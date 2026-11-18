import { describe, expect, it } from 'vitest'
import { createDemoRepository } from '@/app/admin/bookings/_server/repo'
import { seedActor } from '@/app/admin/bookings/_server/repo/fixtures'
import { BookingService } from '@/app/admin/bookings/_server/service'
import type { NewRequestInput, StudentActor } from '../types'
import { AdminBridge, type AdminView, type Bridge, type BridgeResult } from './bridge'
import { DryRunTransport } from './email/transport'
import { MemoryStudentRepository } from './repo/memory'
import { StudentService } from './service'

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

/** A stand-in admin portal whose answers the test sets. */
class FakeBridge implements Bridge {
  view_: AdminView | null = null
  calls: string[] = []
  refuse: string | null = null
  canMirror(venueId: string) {
    return venueId === 'dr-reddys-auditorium'
  }
  async mirror() {
    this.calls.push('mirror')
    return this.refuse ? { ok: false as const, error: this.refuse } : { ok: true as const, adminId: 'adm-1' }
  }
  async view() {
    return this.view_
  }
  async decide(_id: string, decision: 'approve' | 'reject', reason?: string): Promise<BridgeResult> {
    this.calls.push(`decide:${decision}:${reason ?? ''}`)
    return { ok: true }
  }
  async withdraw() {
    this.calls.push('withdraw')
  }
  async note(_id: string, text: string) {
    this.calls.push(`note:${text}`)
  }
  async advanceDays(days: number) {
    this.calls.push(`advance:${days}`)
  }
}

const log = (id: string, action: string, at: string, reason: string | null = null) =>
  ({ id, requestId: 'adm-1', at, actorEmail: 'slo.approver@example.test', actorRole: 'slo', action, fromStatus: null, toStatus: 'pending', stageLabel: 'Student Life Office', reason, internal: false, batchId: null }) as AdminView['logs'][number]

function pendingView(): AdminView {
  return {
    status: 'pending',
    stages: [
      { role: 'Student Life Office', state: 'current', decidedAt: null, decidedBy: null },
      { role: 'Academic Booking', state: 'not_started', decidedAt: null, decidedBy: null },
    ],
    reason: null,
    lastApproverActivityAt: null,
    logs: [],
  }
}

async function linked() {
  const bridge = new FakeBridge()
  bridge.view_ = pendingView()
  const repo = new MemoryStudentRepository()
  const service = new StudentService(repo, { bridge, transport: new DryRunTransport(), tokenSecret: 'secret-secret-secret' })
  const created = await service.submit(ACTOR, input(service))
  if (!created.ok) throw new Error(created.error)
  return { bridge, repo, service, id: created.data.request.id }
}

describe('mirroring on submit', () => {
  it('creates the admin request first and keeps its id', async () => {
    const { bridge, repo, id } = await linked()
    expect(bridge.calls).toContain('mirror')
    expect((await repo.getRequest(id))?.adminRequestId).toBe('adm-1')
  })

  it('refuses the student request when the admin portal refuses the slot', async () => {
    const bridge = new FakeBridge()
    bridge.refuse = 'That room is in use by a class at that time.'
    const repo = new MemoryStudentRepository()
    const service = new StudentService(repo, { bridge })
    const r = await service.submit(ACTOR, input(service))
    expect(r).toMatchObject({ ok: false, code: 409, reason: 'slot_unavailable', error: 'That room is in use by a class at that time.' })
    expect(await repo.listRequests()).toHaveLength(0)
  })

  it('leaves a space that is not in the admin portal as a student only request', async () => {
    const bridge = new FakeBridge()
    const repo = new MemoryStudentRepository()
    const service = new StudentService(repo, { bridge })
    const r = await service.submit(ACTOR, input(service, { venueId: 'takshila' }))
    if (!r.ok) throw new Error(r.error)
    expect(r.data.request.adminRequestId).toBeNull()
    expect(bridge.calls).not.toContain('mirror')
  })

  it('moves both clocks together', async () => {
    const { bridge, service } = await linked()
    await service.advanceClock(3)
    expect(bridge.calls).toContain('advance:3')
    expect(service.now().getTime()).toBeGreaterThan(Date.now() + 2.9 * 86_400_000)
  })
})

describe('syncing back from the admin portal', () => {
  it('follows an office approving the first stage', async () => {
    const { bridge, service, id, repo } = await linked()
    bridge.view_ = {
      ...pendingView(),
      stages: [
        { role: 'Student Life Office', state: 'approved', decidedAt: '2026-11-20T05:00:00.000Z', decidedBy: 'slo' },
        { role: 'Academic Booking', state: 'current', decidedAt: null, decidedBy: null },
      ],
      lastApproverActivityAt: '2026-11-20T05:00:00.000Z',
      logs: [log('l1', 'forwarded', '2026-11-20T05:00:00.000Z')],
    }
    const d = await service.getDetail(ACTOR, id)
    if (!d.ok) throw new Error(d.error)
    expect(d.data.steps.map((s) => [s.role, s.state])).toEqual([['Student Life Office', 'approved'], ['Academic Booking', 'current']])
    expect(d.data.request.status).toBe('pending')
    expect(d.data.request.lastApproverActivityAt).toBe('2026-11-20T05:00:00.000Z')
    expect(d.data.events.some((e) => e.key === 'admin:l1')).toBe(true)
    const mail = (await repo.listOutbox(id)).find((r) => r.template === 'forwarded')
    expect(mail?.to).toBe('acad@example.test')
  })

  it('writes each admin action once and mails the club once, however often it is read', async () => {
    const { bridge, service, id, repo } = await linked()
    bridge.view_ = { ...pendingView(), status: 'approved', stages: pendingView().stages.map((s) => ({ ...s, state: 'approved' as const })), lastApproverActivityAt: '2026-11-21T05:00:00.000Z', logs: [log('l1', 'forwarded', '2026-11-20T05:00:00.000Z'), log('l2', 'confirmed', '2026-11-21T05:00:00.000Z')] }
    await service.getDetail(ACTOR, id)
    await service.getDetail(ACTOR, id)
    await service.listMine(ACTOR)
    expect((await repo.listEvents(id)).filter((e) => e.key?.startsWith('admin:'))).toHaveLength(2)
    expect((await repo.listOutbox(id)).filter((r) => r.template === 'approved')).toHaveLength(1)
    const d = await service.getDetail(ACTOR, id)
    expect(d.ok && d.data.request.status).toBe('approved')
  })

  it('shows the office reason when it does not approve', async () => {
    const { bridge, service, id } = await linked()
    bridge.view_ = { ...pendingView(), status: 'rejected', reason: 'The hall is held for a university event.', stages: [{ role: 'Student Life Office', state: 'rejected', decidedAt: null, decidedBy: null }, { role: 'Academic Booking', state: 'not_started', decidedAt: null, decidedBy: null }], lastApproverActivityAt: '2026-11-20T05:00:00.000Z', logs: [log('l1', 'rejected', '2026-11-20T05:00:00.000Z', 'The hall is held for a university event.')] }
    const d = await service.getDetail(ACTOR, id)
    if (!d.ok) throw new Error(d.error)
    expect(d.data.status.label).toBe('Not approved')
    expect(d.data.request.decisionReason).toBe('The hall is held for a university event.')
    expect(d.data.steps[0]?.reason).toBe('The hall is held for a university event.')
  })

  it('restarts the follow-up window from the office activity', async () => {
    const { bridge, service, id } = await linked()
    service.advanceDays(6)
    bridge.view_ = { ...pendingView(), lastApproverActivityAt: service.now().toISOString(), logs: [log('l1', 'note', service.now().toISOString(), 'Looking at it.')] }
    service.advanceDays(3)
    expect(await service.sendFollowup(ACTOR, id)).toMatchObject({ ok: false, reason: 'locked' })
  })

  it('does not let the admin portal reopen a request the club cancelled', async () => {
    const { bridge, service, id } = await linked()
    await service.cancel(ACTOR, id)
    expect(bridge.calls).toContain('withdraw')
    bridge.view_ = { ...pendingView(), status: 'approved' }
    const d = await service.getDetail(ACTOR, id)
    expect(d.ok && d.data.request.status).toBe('cancelled')
  })
})

describe('actions from the student side', () => {
  it('passes a follow-up to the admin portal as a note', async () => {
    const { bridge, service, id } = await linked()
    service.advanceDays(8)
    await service.sendFollowup(ACTOR, id)
    expect(bridge.calls).toContain('note:The club sent a reminder.')
  })

  it('sends an office decision through the admin portal, not around it', async () => {
    const { bridge, service, id } = await linked()
    await service.recordDecision(id, { decision: 'reject', by: 'slo', reason: 'No room that evening.' })
    expect(bridge.calls).toContain('decide:reject:No room that evening.')
  })
})

describe('against the real admin portal', () => {
  async function real() {
    const admin = new BookingService(createDemoRepository())
    const repo = new MemoryStudentRepository()
    const service = new StudentService(repo, { bridge: new AdminBridge(async () => admin), transport: new DryRunTransport(), tokenSecret: 'secret-secret-secret' })
    return { admin, repo, service }
  }

  it('shows a student request in the admin Inbox and follows the admin decisions', async () => {
    const { admin, service } = await real()
    const created = await service.submit(ACTOR, input(service))
    if (!created.ok) throw new Error(created.error)
    const adminId = created.data.request.adminRequestId
    expect(adminId).toBeTruthy()

    const slo = seedActor('slo')
    const inbox = await admin.getInbox(slo, { tab: 'review' } as never)
    expect(JSON.stringify(inbox)).toContain(adminId ?? 'missing')

    expect(created.data.steps[0]?.state).toBe('current')
    const first = created.data.steps[0]?.role
    const approved = await service.recordDecision(created.data.request.id, { decision: 'approve', by: 'ignored' })
    if (!approved.ok) throw new Error(approved.error)
    expect(approved.data.steps.find((s) => s.role === first)?.state).toBe('approved')
  })

  it('puts two requests for the same slot into one admin clash', async () => {
    const { admin, service } = await real()
    const when = input(service)
    const one = await service.submit(ACTOR, when)
    const two = await service.submit(ACTOR, { ...when, eventName: 'Second event for the same slot' })
    expect(one.ok && two.ok).toBe(true)
    const clashes = await admin.listClashes(seedActor('acad'))
    expect(clashes.length).toBeGreaterThan(0)
  })
})
