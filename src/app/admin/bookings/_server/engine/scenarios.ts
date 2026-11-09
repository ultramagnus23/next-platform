/**
 * Scenario checks for the booking engines and service (S1 to S23, plus S24).
 * Run: npx tsx src/app/admin/bookings/_server/engine/scenarios.ts
 *
 * Uses an isolated in-memory repository and a fake clock. No test framework.
 */

import type {
  Actor,
  ActionInput,
  BookingRequest,
  RequestDraft,
  ServiceResult,
} from '../../types'
import { buildOrganisations, buildRooms, buildSettings, seedActor, seedSuperAdmin } from '../repo/fixtures'
import { createIsolatedRepository, type BookingRepository } from '../repo'
import { BookingService } from '../service'
import { findConflictGroups } from './conflicts'
import { rankGroup } from './priority'
import { resolveStages } from './workflow'

/* eslint-disable no-console */

const START = Date.parse('2026-11-09T06:00:00.000Z')
const DATE = '2026-11-20'
const DATE_2 = '2026-11-21'

const slo = seedActor('slo')
const oa = seedActor('oa')
const acad = seedActor('acad')
const superAdmin = seedSuperAdmin()

interface World {
  repo: BookingRepository
  svc: BookingService
  tick: (ms: number) => void
}

function newWorld(mutate?: (w: { orgs: ReturnType<typeof buildOrganisations> }) => void): World {
  let nowMs = START
  const settings = buildSettings()
  const organisations = buildOrganisations()
  mutate?.({ orgs: organisations })
  const repo = createIsolatedRepository({
    requests: [],
    logs: [],
    outbox: [],
    settings,
    rooms: buildRooms(),
    organisations,
  })
  const svc = new BookingService(repo, () => new Date(nowMs).toISOString())
  return { repo, svc, tick: (ms) => (nowMs += ms) }
}

function draft(over: Partial<RequestDraft> = {}): RequestDraft {
  return {
    organisationId: 'org-cs',
    submittedBy: 'lead@example.ashoka.edu.in',
    eventName: 'Event',
    category: 'workshop',
    description: '',
    roomId: 'ac02-201',
    date: DATE,
    startMin: 18 * 60,
    endMin: 20 * 60,
    expectedAttendance: 30,
    ...over,
  }
}

function must<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`Expected ok but got ${result.code}: ${result.error}`)
  return result.data
}

async function submit(w: World, over: Partial<RequestDraft> = {}): Promise<BookingRequest> {
  w.tick(60_000)
  return must(await w.svc.submit(draft(over))).request
}

async function act(w: World, actor: Actor, id: string, input: Omit<ActionInput, 'version'>) {
  const current = await w.repo.getRequest(id)
  if (!current) throw new Error(`Unknown request ${id}`)
  w.tick(60_000)
  return w.svc.performAction(actor, id, { ...input, version: current.version })
}

async function confirmThroughChain(w: World, id: string): Promise<BookingRequest> {
  must(await act(w, slo, id, { action: 'approve' }))
  return must(await act(w, acad, id, { action: 'approve' })).request
}

async function reqs(w: World): Promise<BookingRequest[]> {
  return w.repo.listRequests()
}

/* ------------------------------------------------------------------ */

let failures = 0
let passes = 0

function check(id: string, name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passes += 1
    console.log(`PASS ${id} ${name}`)
  } else {
    failures += 1
    console.log(`FAIL ${id} ${name}${detail ? ` | ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  const settingsOf = (w: World) => w.repo.getSettings()

  // S1
  {
    const w = newWorld()
    await submit(w, { eventName: 'A' })
    await submit(w, { eventName: 'B', organisationId: 'org-cultural', category: 'cultural' })
    const groups = findConflictGroups(await reqs(w), await settingsOf(w))
    check('S1', 'same room, date and time: one group of 2', groups.length === 1 && groups[0]?.members.length === 2)
  }

  // S2 and S2b
  {
    const w = newWorld()
    await submit(w, { startMin: 18 * 60, endMin: 20 * 60 })
    await submit(w, { startMin: 20 * 60, endMin: 21 * 60 })
    const settings = await settingsOf(w)
    check('S2', 'back to back: no conflict at buffer 0', findConflictGroups(await reqs(w), settings).length === 0)
    const buffered = { ...settings, changeoverBufferMin: 15 }
    check('S2b', 'back to back: conflict at buffer 15', findConflictGroups(await reqs(w), buffered).length === 1)
  }

  // S3
  {
    const w = newWorld()
    await submit(w, { startMin: 17 * 60, endMin: 18 * 60 + 30 })
    await submit(w, { startMin: 18 * 60, endMin: 20 * 60 })
    check('S3', 'partial overlap conflicts', findConflictGroups(await reqs(w), await settingsOf(w)).length === 1)
  }

  // S4
  {
    const w = newWorld()
    await submit(w, { roomId: 'ac02-201' })
    await submit(w, { roomId: 'ac03-201' })
    check('S4', 'different rooms: no conflict', findConflictGroups(await reqs(w), await settingsOf(w)).length === 0)
  }

  // S5
  {
    const w = newWorld()
    await submit(w, { date: DATE })
    await submit(w, { date: DATE_2 })
    check('S5', 'different dates: no conflict', findConflictGroups(await reqs(w), await settingsOf(w)).length === 0)
  }

  // S6
  {
    const topAfter = async (swap: boolean): Promise<string | undefined> => {
      const w = newWorld(({ orgs }) => {
        if (!swap) return
        const cs = orgs.find((o) => o.id === 'org-cs')
        const cultural = orgs.find((o) => o.id === 'org-cultural')
        if (cs && cultural) {
          cs.authorityId = 'oa'
          cultural.authorityId = 'slo'
        }
      })
      // The cultural request is submitted first, so only the tier can put the workshop on top.
      await submit(w, { eventName: 'Open Mic', organisationId: 'org-cultural', category: 'cultural' })
      await submit(w, { eventName: 'ML Workshop', organisationId: 'org-cs', category: 'workshop' })
      const settings = await settingsOf(w)
      const group = findConflictGroups(await reqs(w), settings)[0]
      if (!group) return undefined
      const first = rankGroup(group.members, settings.categories)[0]
      return group.members.find((m) => m.id === first?.requestId)?.eventName
    }
    const a = await topAfter(false)
    const b = await topAfter(true)
    check('S6', 'workshop outranks cultural, before and after swapping authorities', a === 'ML Workshop' && b === 'ML Workshop', `${a} / ${b}`)
  }

  // S7
  {
    const w = newWorld()
    await submit(w, { eventName: 'First', category: 'club_event' })
    await submit(w, { eventName: 'Second', category: 'club_event', organisationId: 'org-econ' })
    const settings = await settingsOf(w)
    const group = findConflictGroups(await reqs(w), settings)[0]
    const first = group ? rankGroup(group.members, settings.categories)[0] : undefined
    const name = group?.members.find((m) => m.id === first?.requestId)?.eventName
    check('S7', 'equal tiers: earlier submission ranks first', name === 'First', String(name))
  }

  // S8
  {
    const w = newWorld()
    const r = await submit(w)
    const res = must(await act(w, slo, r.id, { action: 'approve' }))
    const settings = await settingsOf(w)
    const acadInbox = settings.authorities.find((a) => a.id === 'acad')?.inboxEmails[0] ?? ''
    const logs = await w.repo.listLogs(r.id)
    check(
      'S8',
      'SLO approval forwards to stage 1',
      res.request.stageIndex === 1 &&
        res.request.status === 'pending' &&
        logs.some((l) => l.action === 'forwarded') &&
        res.emails.some((e) => e.to.includes(acadInbox)),
    )
  }

  // S9
  {
    const w = newWorld()
    const r = await submit(w)
    const res = await act(w, oa, r.id, { action: 'approve' })
    check('S9', 'OA cannot act at the SLO stage (403)', !res.ok && res.code === 403)
  }

  // S10
  {
    const w = newWorld()
    const r = await submit(w)
    const confirmed = await confirmThroughChain(w, r.id)
    check('S10', 'final approval confirms and sets amsSyncedAt', confirmed.status === 'confirmed' && confirmed.amsSyncedAt !== null)
  }

  // S11
  {
    const w = newWorld()
    const x = await submit(w, { eventName: 'X' })
    await confirmThroughChain(w, x.id)
    const y = await submit(w, { eventName: 'Y', organisationId: 'org-econ', category: 'seminar' })
    must(await act(w, slo, y.id, { action: 'approve' }))
    const res = await act(w, acad, y.id, { action: 'approve' })
    check('S11', 'final approval over a confirmed booking: 409 with blocker', !res.ok && res.code === 409 && res.blocking?.[0]?.id === x.id)
  }

  // S12
  {
    const w = newWorld()
    const x = await submit(w, { eventName: 'X' })
    await confirmThroughChain(w, x.id)
    const y = await submit(w, { eventName: 'Y', organisationId: 'org-econ', category: 'seminar' })
    must(await act(w, slo, y.id, { action: 'approve' }))
    const res = await act(w, acad, y.id, { action: 'override_confirm', reason: 'Urgent academic need for the room.' })
    const settings = await settingsOf(w)
    const sloInbox = settings.authorities.find((a) => a.id === 'slo')?.inboxEmails[0] ?? ''
    const xAfter = await w.repo.getRequest(x.id)
    const yAfter = await w.repo.getRequest(y.id)
    const displacedMail = res.ok ? res.data.emails.find((e) => e.trigger === 'booking_displaced') : undefined
    check(
      'S12',
      'override confirms winner, displaces old booking, emails org and authority',
      res.ok &&
        yAfter?.status === 'confirmed' &&
        xAfter?.status === 'displaced' &&
        displacedMail?.to.includes('cs.society@example.ashoka.edu.in') === true &&
        displacedMail?.cc.includes(sloInbox) === true,
    )
  }

  // S13
  {
    const w = newWorld()
    const r = await submit(w)
    const empty = await act(w, slo, r.id, { action: 'reject', reason: '' })
    const short = await act(w, slo, r.id, { action: 'reject', reason: 'short' })
    check('S13', 'reject needs a reason of 10+ characters (400)', !empty.ok && empty.code === 400 && !short.ok && short.code === 400)
  }

  // S14
  {
    const w = newWorld()
    const r = await submit(w)
    const res = await w.svc.performAction(slo, r.id, { action: 'approve', version: r.version + 5 })
    check('S14', 'stale version: 409', !res.ok && res.code === 409)
  }

  // S15
  {
    const w = newWorld()
    const x = await submit(w, { eventName: 'X' })
    const y = await submit(w, { eventName: 'Y', organisationId: 'org-econ', category: 'seminar' })
    must(await act(w, slo, x.id, { action: 'approve' }))
    must(await act(w, slo, y.id, { action: 'approve' }))
    const xv = (await w.repo.getRequest(x.id))?.version ?? 0
    const yv = (await w.repo.getRequest(y.id))?.version ?? 0
    const results = await Promise.all([
      w.svc.performAction(acad, x.id, { action: 'approve', version: xv }),
      w.svc.performAction(acad, y.id, { action: 'approve', version: yv }),
    ])
    const okCount = results.filter((r) => r.ok).length
    const conflictCount = results.filter((r) => !r.ok && r.code === 409).length
    const confirmed = (await reqs(w)).filter((r) => r.status === 'confirmed').length
    check('S15', 'simultaneous final approvals: exactly one wins', okCount === 1 && conflictCount === 1 && confirmed === 1, `ok=${okCount} 409=${conflictCount} confirmed=${confirmed}`)
  }

  const meeting = (over: Partial<RequestDraft> = {}): Partial<RequestDraft> => ({
    eventName: 'Committee meeting',
    category: 'meeting',
    roomId: 'ac01-101',
    startMin: 21 * 60 + 30,
    endMin: 22 * 60 + 30,
    expectedAttendance: 20,
    ...over,
  })
  const enableRule = async (w: World): Promise<void> => {
    const settings = await settingsOf(w)
    await w.repo.saveSettings({
      ...settings,
      autoApproval: settings.autoApproval.map((r) => ({ ...r, enabled: true })),
    })
  }

  // S16
  {
    const w = newWorld()
    const r = await submit(w, meeting())
    check('S16', 'rule disabled: request stays pending', r.status === 'pending' && r.autoApprovedBy === null)
  }

  // S17
  {
    const w = newWorld()
    await enableRule(w)
    const r = await submit(w, meeting())
    const logs = await w.repo.listLogs(r.id)
    const outbox = await w.repo.listOutbox()
    check(
      'S17',
      'rule enabled: confirmed by system with rule id and auto_approved email',
      r.status === 'confirmed' &&
        logs.some((l) => l.action === 'auto_approved' && l.actorEmail === 'system' && (l.reason ?? '').includes('rule-late-meetings')) &&
        outbox.some((e) => e.trigger === 'auto_approved' && e.requestId === r.id),
    )
  }

  // S18
  {
    const w = newWorld()
    await enableRule(w)
    await submit(w, { eventName: 'Blocker', organisationId: 'org-econ', category: 'club_event', roomId: 'ac01-101', startMin: 21 * 60, endMin: 22 * 60, expectedAttendance: 10 })
    const r = await submit(w, meeting())
    const outbox = await w.repo.listOutbox()
    check('S18', 'overlap with a pending request: not auto-approved, conflict email sent', r.status === 'pending' && outbox.some((e) => e.trigger === 'conflict_detected'))
  }

  // S19
  {
    const w = newWorld()
    await enableRule(w)
    const a = await submit(w, meeting({ roomId: 'ac01-101' }))
    const b = await submit(w, meeting({ roomId: 'ac01-102' }))
    const c = await submit(w, meeting({ roomId: 'ac01-202' }))
    check('S19', 'weekly cap: third auto-approval is refused', a.status === 'confirmed' && b.status === 'confirmed' && c.status === 'pending', `${a.status}/${b.status}/${c.status}`)
  }

  // S20
  {
    const w = newWorld()
    const r = await submit(w)
    const settings = await settingsOf(w)
    await w.repo.saveSettings({
      ...settings,
      workflows: [...settings.workflows, { id: 'wf-test', name: 'Skip SLO', match: { authorityId: 'slo' }, stages: ['acad'] }],
    })
    const after = await w.repo.getRequest(r.id)
    const next = await submit(w, { organisationId: 'org-econ', roomId: 'ac03-201' })
    check('S20', 'template edits do not change in-flight stages', after?.stages.join() === 'slo,acad' && next.stages.join() === 'acad', `${after?.stages.join()} / ${next.stages.join()}`)
  }

  // S21
  {
    const w = newWorld()
    const a = await submit(w, { eventName: 'Same slot' })
    must(await act(w, slo, a.id, { action: 'approve' }))
    must(await act(w, acad, a.id, { action: 'request_changes', reason: 'Please add the guest speaker details.' }))
    const same = must(await act(w, acad, a.id, { action: 'resubmit' })).request

    const b = await submit(w, { eventName: 'New room', roomId: 'ac03-201' })
    must(await act(w, slo, b.id, { action: 'approve' }))
    must(await act(w, acad, b.id, { action: 'request_changes', reason: 'Please pick a larger room for the crowd.' }))
    const moved = must(await act(w, acad, b.id, { action: 'resubmit', changes: { roomId: 'ac03-001' } })).request
    check('S21', 'resubmit: unchanged keeps stage, changed room restarts', same.stageIndex === 1 && moved.stageIndex === 0, `${same.stageIndex}/${moved.stageIndex}`)
  }

  // S22
  {
    const w = newWorld()
    const r = await submit(w)
    const outboxBefore = (await w.repo.listOutbox()).length
    const res = must(await act(w, slo, r.id, { action: 'remark', reason: 'Checked with the facilities team.' }))
    const logs = await w.repo.listLogs(r.id)
    const after = await w.repo.getRequest(r.id)
    check(
      'S22',
      'remark is internal, sends nothing and keeps the version',
      logs.some((l) => l.action === 'remark' && l.internal) &&
        (await w.repo.listOutbox()).length === outboxBefore &&
        after?.version === r.version &&
        res.emails.length === 0,
    )
  }

  // S23 and S24
  {
    const w = newWorld()
    const a = await submit(w, { eventName: 'Workshop', category: 'workshop' })
    const b = await submit(w, { eventName: 'Open Mic', organisationId: 'org-cultural', category: 'cultural', expectedAttendance: 55 })
    must(await act(w, slo, a.id, { action: 'approve' }))
    must(await act(w, oa, b.id, { action: 'escalate' }))
    const groupId = findConflictGroups(await reqs(w), await settingsOf(w))[0]?.id ?? ''
    const av = (await w.repo.getRequest(a.id))?.version ?? 0
    const bv = (await w.repo.getRequest(b.id))?.version ?? 0
    const logCount = (await w.repo.listLogs()).length

    const stale = await w.svc.resolveConflict(acad, groupId, {
      winnerId: a.id,
      versions: { [a.id]: av, [b.id]: bv - 1 },
      others: [{ id: b.id, action: 'request_changes', reason: 'Please move to another room.', alternativeRoomId: 'ac03-001' }],
    })
    const unchanged = (await reqs(w)).every((r) => r.status === 'pending') && (await w.repo.listLogs()).length === logCount
    check('S23', 'resolve with one stale version: 409 and nothing changes', !stale.ok && stale.code === 409 && unchanged)

    const good = await w.svc.resolveConflict(acad, groupId, {
      winnerId: a.id,
      versions: { [a.id]: av, [b.id]: bv },
      others: [{ id: b.id, action: 'request_changes', reason: 'Please move to another room.', alternativeRoomId: 'ac03-001' }],
    })
    const aAfter = await w.repo.getRequest(a.id)
    const bAfter = await w.repo.getRequest(b.id)
    check(
      'S24',
      'resolve confirms the winner, asks the other to change room, sends 2 emails',
      good.ok &&
        aAfter?.status === 'confirmed' &&
        bAfter?.status === 'changes_requested' &&
        good.data.emails.length === 2 &&
        good.data.emails.some((e) => e.text.includes('AC-03')),
    )

    const foreign = await w.svc.resolveConflict(slo, groupId, { winnerId: a.id, versions: {}, others: [] })
    check('S25', 'a first-stage authority cannot resolve (403)', !foreign.ok && foreign.code === 403)
  }

  // Extra: default chain and dedupe
  {
    const stages = resolveStages({ authorityId: 'acad' }, 'academic', [])
    check('S26', 'ACAD-governed organisation gets a single stage', stages.join() === 'acad', stages.join())
    check('S27', 'super admin can act at any stage', (await (async () => {
      const w = newWorld()
      const r = await submit(w)
      const res = await act(w, superAdmin, r.id, { action: 'approve' })
      return res.ok && res.data.request.stageIndex === 1
    })()))
  }

  console.log(`\n${passes} passed, ${failures} failed`)
  if (failures > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.log('Scenario run crashed:', error)
  process.exit(1)
})
