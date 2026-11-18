import { describe, expect, it } from 'vitest'
import type { NewRequestInput, StudentActor } from '../types'
import { MemoryStudentRepository } from './repo/memory'
import { StudentService } from './service'

const ACTOR: StudentActor = { organisationId: 'org-quiz', organisationName: 'Quiz Club', email: 'lead@example.test' }
const OTHER: StudentActor = { organisationId: 'org-other', organisationName: 'Other Club', email: 'other@example.test' }

function futureDate(service: StudentService, days: number): string {
  return new Date(service.now().getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

function input(service: StudentService, patch: Partial<NewRequestInput> = {}): NewRequestInput {
  return {
    eventName: 'Inter-hostel quiz finals (sample)',
    description: 'Sample request for tests.',
    category: 'extracurricular',
    venueId: 'dr-reddys-auditorium',
    date: futureDate(service, 30),
    startMin: 18 * 60 + 30,
    endMin: 20 * 60,
    attendance: 120,
    needsAv: false,
    guestSpeaker: false,
    ...patch,
  }
}

async function setup() {
  const repo = new MemoryStudentRepository()
  const service = new StudentService(repo)
  const created = await service.submit(ACTOR, input(service))
  if (!created.ok) throw new Error(created.error)
  return { repo, service, id: created.data.request.id }
}

describe('submit', () => {
  it('creates a pending request with the first office current', async () => {
    const { service, id } = await setup()
    const detail = await service.getDetail(ACTOR, id)
    if (!detail.ok) throw new Error('missing')
    expect(detail.data.request.status).toBe('pending')
    expect(detail.data.steps.map((s) => s.state)).toEqual(['current', 'not_started'])
    expect(detail.data.events.map((e) => e.type)).toEqual(['created', 'submitted'])
  })

  it('refuses a past event, a bad time range and too many guests', async () => {
    const { service } = await setup()
    expect((await service.submit(ACTOR, input(service, { date: '2020-01-01' }))).ok).toBe(false)
    expect((await service.submit(ACTOR, input(service, { endMin: 18 * 60 }))).ok).toBe(false)
    expect((await service.submit(ACTOR, input(service, { attendance: 501 }))).ok).toBe(false)
  })

  it('hides a request from another club', async () => {
    const { service, id } = await setup()
    const r = await service.getDetail(OTHER, id)
    expect(r).toMatchObject({ ok: false, code: 404 })
  })
})

describe('follow-up', () => {
  it('is refused with the unlock date while the window is closed', async () => {
    const { service, id } = await setup()
    const r = await service.sendFollowup(ACTOR, id)
    expect(r).toMatchObject({ ok: false, code: 409, reason: 'locked' })
    expect(r.ok === false && r.unlockAt).toBeTruthy()
  })

  it('works after 7 days and then locks again', async () => {
    const { service, id } = await setup()
    service.advanceDays(7)
    expect((await service.sendFollowup(ACTOR, id)).ok).toBe(true)
    expect(await service.sendFollowup(ACTOR, id)).toMatchObject({ ok: false, reason: 'locked' })
  })

  it('lets exactly one of 20 simultaneous calls through', async () => {
    const { service, repo, id } = await setup()
    service.advanceDays(8)
    const results = await Promise.all(Array.from({ length: 20 }, () => service.sendFollowup(ACTOR, id)))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const events = (await repo.listEvents(id)).filter((e) => e.type === 'followup_sent')
    expect(events).toHaveLength(1)
    expect((await repo.getRequest(id))?.followupCount).toBe(1)
  })

  it('cannot be forced by another club', async () => {
    const { service, id } = await setup()
    service.advanceDays(8)
    expect(await service.sendFollowup(OTHER, id)).toMatchObject({ ok: false, code: 404 })
  })

  it('allows one early follow-up when the event is under 7 days away', async () => {
    const repo = new MemoryStudentRepository()
    const service = new StudentService(repo)
    const created = await service.submit(ACTOR, input(service, { date: futureDate(service, 5) }))
    if (!created.ok) throw new Error(created.error)
    const id = created.data.request.id
    expect((await service.sendFollowup(ACTOR, id)).ok).toBe(true)
    expect(await service.sendFollowup(ACTOR, id)).toMatchObject({ ok: false })
    expect((await repo.getRequest(id))?.urgencyFollowupUsed).toBe(true)
  })

  it('is refused for a request that is not pending', async () => {
    const { service, id } = await setup()
    await service.cancel(ACTOR, id)
    service.advanceDays(10)
    expect(await service.sendFollowup(ACTOR, id)).toMatchObject({ ok: false, reason: 'not_pending' })
  })
})

describe('decisions', () => {
  it('stays pending until every office approves, then approves', async () => {
    const { service, id } = await setup()
    const first = await service.recordDecision(id, { decision: 'approve', by: 'slo' })
    if (!first.ok) throw new Error(first.error)
    expect(first.data.request.status).toBe('pending')
    expect(first.data.steps.map((s) => s.state)).toEqual(['approved', 'current'])
    const second = await service.recordDecision(id, { decision: 'approve', by: 'review' })
    if (!second.ok) throw new Error(second.error)
    expect(second.data.request.status).toBe('approved')
  })

  it('rejects at once with the reason shown in full, and needs a reason', async () => {
    const { service, id } = await setup()
    expect(await service.recordDecision(id, { decision: 'reject', by: 'slo', reason: '  ' })).toMatchObject({ ok: false, code: 400 })
    const r = await service.recordDecision(id, { decision: 'reject', by: 'slo', reason: 'The hall is booked for a convocation rehearsal.' })
    if (!r.ok) throw new Error(r.error)
    expect(r.data.request.status).toBe('rejected')
    expect(r.data.request.decisionReason).toBe('The hall is booked for a convocation rehearsal.')
    expect(r.data.status.label).toBe('Not approved')
  })

  it('restarts the follow-up window on any approver activity, even a comment', async () => {
    const { service, id } = await setup()
    service.advanceDays(6)
    await service.recordDecision(id, { decision: 'comment', by: 'slo', reason: 'Looking at it.' })
    service.advanceDays(3)
    expect(await service.sendFollowup(ACTOR, id)).toMatchObject({ ok: false, reason: 'locked' })
    service.advanceDays(5)
    expect((await service.sendFollowup(ACTOR, id)).ok).toBe(true)
  })

  it('never decides a request that is already closed', async () => {
    const { service, id } = await setup()
    await service.recordDecision(id, { decision: 'reject', by: 'slo', reason: 'No.' })
    expect(await service.recordDecision(id, { decision: 'approve', by: 'slo' })).toMatchObject({ ok: false, code: 409 })
  })
})

describe('resubmit and cancel', () => {
  it('makes a linked new version and leaves the old one rejected', async () => {
    const { service, id } = await setup()
    await service.recordDecision(id, { decision: 'reject', by: 'slo', reason: 'Wrong date.' })
    const again = await service.resubmit(ACTOR, id, input(service, { date: futureDate(service, 40) }))
    if (!again.ok) throw new Error(again.error)
    expect(again.data.request.previousRequestId).toBe(id)
    expect(again.data.request.status).toBe('pending')
    const old = await service.getDetail(ACTOR, id)
    expect(old.ok && old.data.request.status).toBe('rejected')
  })

  it('only resubmits a request that was not approved', async () => {
    const { service, id } = await setup()
    expect(await service.resubmit(ACTOR, id, input(service))).toMatchObject({ ok: false, code: 409 })
  })

  it('cancelling stops the scheduler for that request', async () => {
    const { service, id } = await setup()
    await service.cancel(ACTOR, id)
    service.advanceDays(20)
    expect(await service.tick()).toHaveLength(0)
  })
})

describe('tick', () => {
  it('writes reminder, escalation and admin flag once each, on their days', async () => {
    const { service } = await setup()
    service.advanceDays(2)
    expect((await service.tick()).map((e) => e.type)).toEqual(['reminder_due'])
    service.advanceDays(3)
    expect((await service.tick()).map((e) => e.type)).toEqual(['escalated'])
    service.advanceDays(9)
    expect((await service.tick()).map((e) => e.type)).toEqual(['admin_flagged'])
  })

  it('is safe to run twice in a row', async () => {
    const { service } = await setup()
    service.advanceDays(6)
    expect((await service.tick()).length).toBeGreaterThan(0)
    expect(await service.tick()).toHaveLength(0)
  })

  it('starts the count again after an approver acts', async () => {
    const { service, id } = await setup()
    service.advanceDays(3)
    await service.tick()
    await service.recordDecision(id, { decision: 'approve', by: 'slo' })
    service.advanceDays(2)
    expect((await service.tick()).map((e) => e.type)).toEqual(['reminder_due'])
  })
})
