import { describe, expect, it } from 'vitest'
import type { NewRequestInput, StudentActor } from '../types'
import { resolveBackup, resolveRecipient } from './email/directory'
import { DryRunTransport, type MailTransport, type OutgoingMail } from './email/transport'
import { MemoryStudentRepository } from './repo/memory'
import { StudentService } from './service'
import { newPayload, signToken, verifyToken } from './tokens'

const SECRET = 'test-secret-that-is-long-enough'
const ACTOR: StudentActor = { organisationId: 'org-quiz', organisationName: 'Quiz Club', email: 'lead@example.test' }

function input(service: StudentService, patch: Partial<NewRequestInput> = {}): NewRequestInput {
  return {
    eventName: 'Inter-hostel quiz finals (sample)',
    description: 'Sample.',
    category: 'extracurricular',
    venueId: 'dr-reddys-auditorium',
    date: new Date(service.now().getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
    startMin: 18 * 60 + 30,
    endMin: 20 * 60,
    attendance: 120,
    needsAv: false,
    guestSpeaker: false,
    ...patch,
  }
}

async function setup(transport: MailTransport = new DryRunTransport()) {
  const repo = new MemoryStudentRepository()
  const service = new StudentService(repo, { transport, tokenSecret: SECRET, baseUrl: 'https://example.test' })
  const created = await service.submit(ACTOR, input(service))
  if (!created.ok) throw new Error(created.error)
  return { repo, service, id: created.data.request.id, transport }
}

function linkOf(text: string): string {
  const match = text.match(/https:\/\/example\.test\/student\/approve\/([\w.-]+)/)
  if (!match?.[1]) throw new Error('no approve link in email')
  return match[1]
}

describe('threading', () => {
  it('sends the first email as the root, and every later one in its thread with the same subject', async () => {
    const { service, id, repo } = await setup()
    await service.recordDecision(id, { decision: 'approve', by: 'slo' })
    await service.recordDecision(id, { decision: 'approve', by: 'review' })
    service.advanceDays(1)
    const rows = await repo.listOutbox(id)
    expect(rows.map((r) => r.template)).toEqual(['submitted', 'forwarded', 'approved'])
    const [root, ...rest] = rows
    expect(root?.inReplyTo).toBeNull()
    expect(root?.messageId).toBe((await repo.getRequest(id))?.rootMessageId)
    for (const row of rest) {
      expect(row.inReplyTo).toBe(root?.messageId)
      expect(row.references).toContain(root?.messageId)
    }
    expect(new Set(rows.map((r) => r.subject)).size).toBe(1)
  })

  it('threads a follow-up and a rejection too', async () => {
    const { service, id, repo } = await setup()
    service.advanceDays(8)
    await service.sendFollowup(ACTOR, id)
    await service.recordDecision(id, { decision: 'reject', by: 'slo', reason: 'Booked.' })
    const rows = await repo.listOutbox(id)
    expect(rows.map((r) => r.template)).toEqual(['submitted', 'followup', 'not_approved'])
    expect(rows.slice(1).every((r) => r.inReplyTo === rows[0]?.messageId)).toBe(true)
  })

  it('puts the not approved reason in full in the email to the club', async () => {
    const { service, id, repo } = await setup()
    await service.recordDecision(id, { decision: 'reject', by: 'slo', reason: 'The hall is held for a university event.' })
    const mail = (await repo.listOutbox(id)).find((r) => r.template === 'not_approved')
    expect(mail?.to).toBe('lead@example.test')
    expect(mail?.text).toContain('The hall is held for a university event.')
  })
})

describe('dry run and sending', () => {
  it('prints and records every email and sends nothing real', async () => {
    const dry = new DryRunTransport()
    const { id, repo } = await setup(dry)
    expect(dry.sent).toHaveLength(1)
    expect((await repo.listOutbox(id))[0]?.status).toBe('sent')
    expect(dry.name).toBe('dry-run')
  })

  it('never writes an em dash into an email', async () => {
    const { service, id, repo } = await setup()
    service.advanceDays(8)
    await service.sendFollowup(ACTOR, id)
    for (const row of await repo.listOutbox(id)) expect(row.text + row.subject).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('outbox idempotency and retry', () => {
  it('does not queue the same email twice for the same request, template, recipient and sequence', async () => {
    const { repo, id } = await setup()
    const [row] = await repo.listOutbox(id)
    if (!row) throw new Error('no row')
    expect(await repo.enqueueOutbox({ ...row, id: 'ob-dup' })).toBe(false)
    expect(await repo.listOutbox(id)).toHaveLength(1)
  })

  it('retries a failed send with backoff and does not send twice once it works', async () => {
    let calls = 0
    const received: OutgoingMail[] = []
    const flaky: MailTransport = {
      name: 'flaky',
      async send(mail) {
        calls += 1
        if (calls === 1) throw new Error('timeout')
        received.push(mail)
        return 'provider-1'
      },
    }
    const { service, repo, id } = await setup(flaky)
    let [row] = await repo.listOutbox(id)
    expect(row).toMatchObject({ status: 'queued', attempts: 1, lastError: 'timeout' })
    expect(Date.parse(row?.nextAttemptAt ?? '')).toBeGreaterThan(service.now().getTime())

    await service.drainOutbox()
    ;[row] = await repo.listOutbox(id)
    expect(row?.status).toBe('queued')

    service.advanceDays(1)
    await service.drainOutbox()
    await service.drainOutbox()
    ;[row] = await repo.listOutbox(id)
    expect(row).toMatchObject({ status: 'sent', providerId: 'provider-1' })
    expect(received).toHaveLength(1)
    expect(received[0]?.idempotencyKey).toBe(row?.idempotencyKey)
  })

  it('gives up after the maximum attempts', async () => {
    const down: MailTransport = { name: 'down', send: async () => Promise.reject(new Error('refused')) }
    const { service, repo, id } = await setup(down)
    for (let i = 0; i < 6; i += 1) {
      service.advanceDays(1)
      await service.drainOutbox()
    }
    expect((await repo.listOutbox(id))[0]?.status).toBe('dead')
  })

  it('hands one due row to only one of several simultaneous workers', async () => {
    const { repo } = await setup(new DryRunTransport())
    await repo.enqueueOutbox({ id: 'ob-x', requestId: 'sr-1', template: 'cancelled', sequence: 9, to: 'a@example.test', cc: [], subject: 's', text: 't', messageId: '<x>', inReplyTo: null, references: [], idempotencyKey: '', status: 'queued', attempts: 0, nextAttemptAt: new Date(0).toISOString(), lockedUntil: null, lastError: null, providerId: null, createdAt: new Date(0).toISOString(), sentAt: null })
    const claims = await Promise.all(Array.from({ length: 10 }, () => repo.claimDueOutbox(new Date(), 5, 60_000)))
    expect(claims.flat().filter((r) => r.id === 'ob-x')).toHaveLength(1)
  })
})

describe('suppressions', () => {
  it('does not send to an address that bounced, and keeps working for others', async () => {
    const dry = new DryRunTransport()
    const { service, id, repo } = await setup(dry)
    await service.recordBounce('slo@example.test', 'bounce')
    await service.recordDecision(id, { decision: 'approve', by: 'slo' })
    const rows = await repo.listOutbox(id)
    const forwarded = rows.find((r) => r.template === 'forwarded')
    expect(forwarded?.to).toBe('review@example.test')
    expect(forwarded?.status).toBe('sent')
    service.advanceDays(8)
    await service.recordBounce('review@example.test', 'complaint')
    await service.sendFollowup(ACTOR, id)
    expect((await repo.listOutbox(id)).find((r) => r.template === 'followup')?.status).toBe('suppressed')
  })

  it('drops only the suppressed copy address, not the email', async () => {
    const dry = new DryRunTransport()
    const { service } = await setup(dry)
    await service.recordBounce('lead@example.test', 'bounce')
    const second = await service.submit(ACTOR, input(service))
    expect(second.ok).toBe(true)
    const last = dry.sent.at(-1)
    expect(last?.to).toBe('slo@example.test')
    expect(last?.cc).toEqual([])
  })
})

describe('recipient resolution', () => {
  const now = new Date('2026-11-20T05:00:00.000Z')
  const dir = {
    Role: { mailbox: 'role@t', backup: 'backup@t', delegate: 'delegate@t', assignee: { email: 'person@t', leave: { from: '2026-11-19T00:00:00Z', to: '2026-11-25T00:00:00Z' } } },
    NoDelegate: { mailbox: 'box@t', backup: 'backup2@t', assignee: { email: 'p2@t', leave: { from: '2026-11-19T00:00:00Z', to: '2026-11-25T00:00:00Z' } } },
    Plain: { mailbox: 'plain@t', assignee: { email: 'p3@t' } },
    Box: { mailbox: 'onlybox@t' },
  }

  it('uses the delegate while the assignee is on leave', () => {
    expect(resolveRecipient('Role', now, dir)).toEqual({ email: 'delegate@t', via: 'delegate' })
  })
  it('uses the role backup when there is no delegate', () => {
    expect(resolveRecipient('NoDelegate', now, dir)).toEqual({ email: 'backup2@t', via: 'backup' })
  })
  it('uses the assignee when nobody is on leave, then the role mailbox', () => {
    expect(resolveRecipient('Role', new Date('2026-12-30T00:00:00Z'), dir).email).toBe('person@t')
    expect(resolveRecipient('Plain', now, dir).email).toBe('p3@t')
    expect(resolveRecipient('Box', now, dir).email).toBe('onlybox@t')
  })
  it('sends an unknown role to the SLO mailbox instead of dropping the mail', () => {
    expect(resolveRecipient('Unheard of', now).via).toBe('fallback')
  })
  it('finds the backup for escalation', () => {
    expect(resolveBackup('Role', dir)).toBe('backup@t')
    expect(resolveBackup('Box', dir)).toBe('onlybox@t')
  })
})

describe('signed approve links', () => {
  async function linkFor(setupResult: Awaited<ReturnType<typeof setup>>): Promise<string> {
    const mail = (await setupResult.repo.listOutbox(setupResult.id)).find((r) => r.template === 'submitted')
    return linkOf(mail?.text ?? '')
  }

  it('opening the link (GET) changes nothing', async () => {
    const s = await setup()
    const token = await linkFor(s)
    const before = JSON.stringify(await s.repo.getRequest(s.id))
    const first = await s.service.previewApproval(token, SECRET)
    const second = await s.service.previewApproval(token, SECRET)
    expect(first.ok && second.ok).toBe(true)
    expect(JSON.stringify(await s.repo.getRequest(s.id))).toBe(before)
    expect((await s.repo.listEvents(s.id)).map((e) => e.type)).toEqual(['created', 'submitted'])
  })

  it('approves from the confirmation POST, once', async () => {
    const s = await setup()
    const token = await linkFor(s)
    const done = await s.service.actViaToken(token, SECRET, 'approve')
    if (!done.ok) throw new Error(done.error)
    expect(done.data.steps.map((x) => x.state)).toEqual(['approved', 'current'])
    expect(await s.service.actViaToken(token, SECRET, 'approve')).toMatchObject({ ok: false, reason: 'used' })
  })

  it('lets only one of several simultaneous uses win', async () => {
    const s = await setup()
    const token = await linkFor(s)
    const results = await Promise.all(Array.from({ length: 10 }, () => s.service.actViaToken(token, SECRET, 'approve')))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })

  it('needs a reason to not approve, and does not spend the link when the reason is missing', async () => {
    const s = await setup()
    const token = await linkFor(s)
    expect(await s.service.actViaToken(token, SECRET, 'reject', ' ')).toMatchObject({ ok: false, code: 400 })
    const retry = await s.service.actViaToken(token, SECRET, 'reject', 'Clashes with a university event.')
    expect(retry.ok && retry.data.request.status).toBe('rejected')
  })

  it('refuses an expired link', async () => {
    const s = await setup()
    const token = await linkFor(s)
    s.service.advanceDays(2)
    expect(await s.service.previewApproval(token, SECRET)).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('refuses a link for a stage that is no longer current', async () => {
    const s = await setup()
    const token = await linkFor(s)
    await s.service.recordDecision(s.id, { decision: 'approve', by: 'slo, in the portal' })
    expect(await s.service.actViaToken(token, SECRET, 'approve')).toMatchObject({ ok: false, reason: 'wrong_stage' })
  })

  it('refuses a link after the request was cancelled', async () => {
    const s = await setup()
    const token = await linkFor(s)
    await s.service.cancel(ACTOR, s.id)
    expect(await s.service.previewApproval(token, SECRET)).toMatchObject({ ok: false, reason: 'wrong_stage' })
  })

  it('refuses a tampered or foreign token and a missing secret', async () => {
    const s = await setup()
    const token = await linkFor(s)
    const [body, sig] = token.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body ?? '', 'base64url').toString()), role: 'Additional review' })).toString('base64url')
    expect(await s.service.previewApproval(`${forgedBody}.${sig}`, SECRET)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await s.service.previewApproval(token, 'another-secret')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await s.service.previewApproval(token, '')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await s.service.previewApproval('garbage', SECRET)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await s.service.previewApproval(`${body}.${sig}.extra`, SECRET)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('refuses a correctly signed token the server never issued', async () => {
    const s = await setup()
    const steps = await s.repo.getSteps(s.id)
    const rogue = signToken(newPayload(s.id, steps[0]?.id ?? '', steps[0]?.role ?? '', s.service.now()), SECRET)
    expect(await s.service.previewApproval(rogue, SECRET)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('has no links when no secret is configured, and says to use the portal', async () => {
    const repo = new MemoryStudentRepository()
    const service = new StudentService(repo, { tokenSecret: '' })
    const created = await service.submit(ACTOR, input(service))
    if (!created.ok) throw new Error(created.error)
    const mail = (await repo.listOutbox(created.data.request.id))[0]
    expect(mail?.text).not.toContain('/student/approve/')
    expect(mail?.text).toContain('booking portal')
  })
})

describe('token format', () => {
  it('round trips and rejects after expiry', () => {
    const now = new Date('2026-11-20T00:00:00Z')
    const payload = newPayload('sr-1', 'st-1', 'Role', now)
    const token = signToken(payload, SECRET)
    expect(verifyToken(token, SECRET, now)).toMatchObject({ ok: true })
    expect(verifyToken(token, SECRET, new Date(payload.exp + 1))).toMatchObject({ ok: false, problem: 'expired' })
  })
})

describe('scheduler emails', () => {
  it('queues the reminder, the backup escalation and the admin flag once each', async () => {
    const { service, repo, id } = await setup()
    service.advanceDays(2)
    await service.tick()
    service.advanceDays(3)
    await service.tick()
    service.advanceDays(9)
    await service.tick()
    await service.tick()
    const rows = await repo.listOutbox(id)
    expect(rows.map((r) => r.template)).toEqual(['submitted', 'reminder', 'escalation', 'admin_flag'])
    expect(rows.find((r) => r.template === 'escalation')?.to).toBe('slo-backup@example.test')
    expect(rows.slice(1).every((r) => r.inReplyTo === rows[0]?.messageId)).toBe(true)
  })

  it('sends nothing for a cancelled request', async () => {
    const { service, repo, id } = await setup()
    await service.cancel(ACTOR, id)
    const before = (await repo.listOutbox(id)).length
    service.advanceDays(20)
    await service.tick()
    expect((await repo.listOutbox(id)).length).toBe(before)
  })
})

describe('mark as decided', () => {
  it('records a decision taken offline in the log and moves the request on', async () => {
    const { service, id } = await setup()
    const r = await service.recordDecision(id, { decision: 'approve', by: 'SLO (phone call)', offline: true })
    if (!r.ok) throw new Error(r.error)
    expect(r.data.events.at(-1)?.detail).toContain('decided offline')
    expect(r.data.steps[0]?.state).toBe('approved')
  })
})
