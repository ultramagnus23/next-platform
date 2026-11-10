/**
 * Scenario checks for the booking engines and service (S1 to S35).
 * Run: npx tsx src/app/admin/bookings/_server/engine/scenarios.ts
 *
 * Uses an isolated in-memory repository and a fake clock. No test framework.
 */

import type { ActionInput, Actor, BookingRequest, EngineContext, RequestDraft, ServiceResult, TimetableBlock } from '../../types'
import { buildOrganisations, buildRooms, buildSettings, orgIdFor, seedActor, seedSuperAdmin } from '../repo/fixtures'
import { buildSeed } from '../repo/seed'
import { isoWeekKey, todayIST } from '../../utils'
import { createIsolatedRepository, type BookingRepository } from '../repo'
import { BookingService } from '../service'
import { roomsDay } from './availability'
import { flagsFor, laneFor } from './flags'
import { allClashGroups, clashesFor, occupancy } from './occupancy'
import { rankGroup } from './priority'

/* eslint-disable no-console */

const START = Date.parse('2026-11-09T06:00:00.000Z')
const DATE = '2026-11-20'
const slo = seedActor('slo')
const oa = seedActor('oa')
const acad = seedActor('acad')
const superAdmin = seedSuperAdmin()
const CS = orgIdFor('CS Society')
const CULTURAL = orgIdFor('Cultural Society')
const ECON = orgIdFor('Economics Society')
const HISTORY = orgIdFor('Dept of History')
const ROOM = 'ac-01-lr-106'

interface World {
  repo: BookingRepository
  svc: BookingService
  tick: (ms: number) => void
  timetable: TimetableBlock[]
}

function newWorld(opts: { timetable?: TimetableBlock[]; swapOffices?: boolean } = {}): World {
  let nowMs = START
  const organisations = buildOrganisations()
  if (opts.swapOffices) {
    const cs = organisations.find((o) => o.id === CS)
    const cu = organisations.find((o) => o.id === CULTURAL)
    if (cs && cu) {
      cs.officeId = 'oa'
      cu.officeId = 'slo'
    }
  }
  const timetable = opts.timetable ?? []
  const repo = createIsolatedRepository({
    requests: [],
    logs: [],
    outbox: [],
    settings: buildSettings(),
    rooms: buildRooms(),
    organisations,
    timetable,
  })
  const svc = new BookingService(repo, () => new Date(nowMs).toISOString())
  return { repo, svc, tick: (ms) => (nowMs += ms), timetable }
}

function draft(over: Partial<RequestDraft> = {}): RequestDraft {
  return {
    organisationId: CS,
    submittedBy: 'lead@example.ashoka.edu.in',
    eventName: 'Event',
    category: 'workshop',
    description: '',
    roomId: ROOM,
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
  const out = must(await w.svc.submit(draft(over)))
  const created = out.requests[0]
  if (!created) throw new Error('No request returned')
  return created
}

async function act(w: World, actor: Actor, id: string, input: Omit<ActionInput, 'version'>) {
  const current = await w.repo.getRequest(id)
  if (!current) throw new Error(`Unknown request ${id}`)
  w.tick(60_000)
  return w.svc.performAction(actor, id, { ...input, version: current.version })
}

async function confirmThroughChain(w: World, id: string): Promise<BookingRequest> {
  must(await act(w, slo, id, { action: 'approve' }))
  const out = must(await act(w, acad, id, { action: 'approve' }))
  return out.requests[0] as BookingRequest
}

async function ctxOf(w: World): Promise<EngineContext> {
  const [settings, rooms, organisations, requests, timetable] = await Promise.all([
    w.repo.getSettings(),
    w.repo.listRooms(),
    w.repo.listOrganisations(),
    w.repo.listRequests(),
    w.repo.listTimetable(),
  ])
  let n = 0
  return { settings, rooms, organisations, timetable, requests, newId: () => `x${(n += 1)}` }
}

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

function sweepWorld(w: World, actor: Actor) {
  return w.svc.getInbox(actor, { page: 1 })
}

async function main(): Promise<void> {
  // S1
  {
    const w = newWorld()
    await submit(w, { eventName: 'A' })
    await submit(w, { eventName: 'B', organisationId: CULTURAL, category: 'cultural' })
    const groups = allClashGroups(await ctxOf(w))
    check('S1', 'two pending, same slot: one clash group of 2', groups.length === 1 && groups[0]?.members.length === 2)
  }
  // S2 and S2b
  {
    const w = newWorld()
    await submit(w, { startMin: 18 * 60, endMin: 20 * 60 })
    await submit(w, { startMin: 20 * 60, endMin: 21 * 60 })
    const ctx = await ctxOf(w)
    check('S2', 'back to back: no clash at buffer 0', allClashGroups(ctx).length === 0)
    const buffered: EngineContext = { ...ctx, requests: [...ctx.requests], settings: { ...ctx.settings, changeoverBufferMin: 15 } }
    check('S2b', 'back to back: clash at buffer 15', allClashGroups(buffered).length === 1)
  }
  // S3
  {
    const w = newWorld()
    await submit(w, { startMin: 17 * 60, endMin: 18 * 60 + 30 })
    await submit(w, { startMin: 18 * 60, endMin: 20 * 60 })
    check('S3', 'partial overlap clashes', allClashGroups(await ctxOf(w)).length === 1)
  }
  // S4
  {
    const w = newWorld()
    await submit(w, { roomId: ROOM })
    await submit(w, { roomId: 'ac-04-lr-304' })
    check('S4', 'different rooms: no clash', allClashGroups(await ctxOf(w)).length === 0)
  }
  // S5
  {
    const cls: TimetableBlock = { id: 'tt-1', roomId: ROOM, courseCode: 'HIS-201', title: 'Class', date: DATE, startMin: 17 * 60, endMin: 19 * 60 }
    const w = newWorld({ timetable: [cls] })
    const r = await submit(w, { organisationId: HISTORY, category: 'seminar' })
    const ctx = await ctxOf(w)
    const hasClass = clashesFor(ctx, r.id).some((c) => c.kind === 'class')
    const res = await act(w, acad, r.id, { action: 'approve' })
    const detail = await w.svc.getRequestDetail(acad, r.id)
    const override = detail.ok ? detail.data.actions.find((a) => a.action === 'override_confirm') : undefined
    check('S5', 'class blocks final approval (409), no override', hasClass && !res.ok && res.code === 409 && res.blockers?.[0]?.kind === 'class' && override?.visible === false)
  }
  // S6
  {
    const topAfter = async (swap: boolean): Promise<string | undefined> => {
      const w = newWorld({ swapOffices: swap })
      await submit(w, { eventName: 'Open Mic', organisationId: CULTURAL, category: 'cultural' })
      await submit(w, { eventName: 'ML Workshop', organisationId: CS, category: 'workshop' })
      const ctx = await ctxOf(w)
      const group = allClashGroups(ctx)[0]
      if (!group) return undefined
      const first = rankGroup(group.members, ctx.settings.categories)[0]
      return group.members.find((m) => m.id === first?.requestId)?.eventName
    }
    const a = await topAfter(false)
    const b = await topAfter(true)
    check('S6', 'workshop outranks cultural, before and after swapping offices', a === 'ML Workshop' && b === 'ML Workshop', `${a} / ${b}`)
  }
  // S7
  {
    const w = newWorld()
    await submit(w, { eventName: 'First', category: 'club_event' })
    await submit(w, { eventName: 'Second', category: 'club_event', organisationId: ECON })
    const ctx = await ctxOf(w)
    const group = allClashGroups(ctx)[0]
    const first = group ? rankGroup(group.members, ctx.settings.categories)[0] : undefined
    check('S7', 'equal tiers: earlier submission first', group?.members.find((m) => m.id === first?.requestId)?.eventName === 'First')
  }
  // S8
  {
    const w = newWorld()
    const r = await submit(w)
    const out = must(await act(w, slo, r.id, { action: 'approve' }))
    const settings = await w.repo.getSettings()
    const acadInbox = settings.offices.find((o) => o.id === 'acad')?.inboxEmails[0] ?? ''
    const logs = await w.repo.listLogs(r.id)
    check('S8', 'SLO approval forwards to step 1', out.requests[0]?.stageIndex === 1 && out.requests[0]?.status === 'pending' && logs.some((l) => l.action === 'forwarded') && out.emails.some((e) => e.to.includes(acadInbox)))
  }
  // S9
  {
    const w = newWorld()
    const r = await submit(w)
    const res = await act(w, oa, r.id, { action: 'approve' })
    check('S9', 'OA cannot act at the SLO step (403)', !res.ok && res.code === 403)
  }
  // S10
  {
    const w = newWorld()
    const r = await submit(w)
    const done = await confirmThroughChain(w, r.id)
    check('S10', 'final approval confirms and sets amsSyncedAt', done.status === 'confirmed' && done.amsSyncedAt !== null)
  }
  // S11
  {
    const w = newWorld()
    const x = await submit(w, { eventName: 'X' })
    await confirmThroughChain(w, x.id)
    const y = await submit(w, { eventName: 'Y', organisationId: ECON, category: 'seminar' })
    must(await act(w, slo, y.id, { action: 'approve' }))
    const res = await act(w, acad, y.id, { action: 'approve' })
    check('S11', 'final approval over a confirmed request: 409 with blocker', !res.ok && res.code === 409 && res.blockers?.[0]?.requestId === x.id)
  }
  // S12
  {
    const w = newWorld()
    const x = await submit(w, { eventName: 'X' })
    await confirmThroughChain(w, x.id)
    const y = await submit(w, { eventName: 'Y', organisationId: ECON, category: 'seminar' })
    must(await act(w, slo, y.id, { action: 'approve' }))
    const res = await act(w, acad, y.id, { action: 'override_confirm', reason: 'Urgent academic need for the room.' })
    const settings = await w.repo.getSettings()
    const sloInbox = settings.offices.find((o) => o.id === 'slo')?.inboxEmails[0] ?? ''
    const xAfter = await w.repo.getRequest(x.id)
    const yAfter = await w.repo.getRequest(y.id)
    const mail = res.ok ? res.data.emails.find((e) => e.trigger === 'booking_displaced') : undefined
    check('S12', 'override confirms winner, displaces blocker, emails org and office', res.ok && yAfter?.status === 'confirmed' && xAfter?.status === 'displaced' && mail?.cc.includes(sloInbox) === true)
  }
  // S13
  {
    const w = newWorld()
    const r = await submit(w)
    const empty = await act(w, slo, r.id, { action: 'reject', reason: '' })
    const short = await act(w, slo, r.id, { action: 'reject', reason: 'short' })
    check('S13', 'decline needs 10+ characters (400)', !empty.ok && empty.code === 400 && !short.ok && short.code === 400)
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
    const y = await submit(w, { eventName: 'Y', organisationId: ECON, category: 'seminar' })
    must(await act(w, slo, x.id, { action: 'approve' }))
    must(await act(w, slo, y.id, { action: 'approve' }))
    const xv = (await w.repo.getRequest(x.id))?.version ?? 0
    const yv = (await w.repo.getRequest(y.id))?.version ?? 0
    const results = await Promise.all([
      w.svc.performAction(acad, x.id, { action: 'approve', version: xv }),
      w.svc.performAction(acad, y.id, { action: 'approve', version: yv }),
    ])
    const confirmed = (await w.repo.listRequests()).filter((r) => r.status === 'confirmed').length
    check('S15', 'simultaneous final approvals: exactly one wins', results.filter((r) => r.ok).length === 1 && results.filter((r) => !r.ok && r.code === 409).length === 1 && confirmed === 1)
  }
  // S16, S17, S18
  {
    const w = newWorld()
    const r = await submit(w)
    const out = must(await act(w, slo, r.id, { action: 'offer_room', roomId: 'ac-03-lr-003', reason: 'Your room is booked for another event.' }))
    const offered = out.requests[0]
    const ctx = await ctxOf(w)
    const heldThere = occupancy(ctx, 'ac-03-lr-003', DATE).some((i) => i.id === r.id && i.effect === 'held')
    const leftOriginal = !occupancy(ctx, ROOM, DATE).some((i) => i.id === r.id)
    check('S16', 'offer holds the new room and frees the original', offered?.status === 'offered' && heldThere && leftOriginal && offered?.offer?.roomId === 'ac-03-lr-003')

    const other = await submit(w, { roomId: 'ac-03-lr-003', organisationId: ECON, category: 'seminar', eventName: 'Other' })
    const ctx2 = await ctxOf(w)
    check('S17', 'another request for the offered room clashes with a held blocker', clashesFor(ctx2, other.id).some((c) => c.kind === 'held'))

    const accepted = must(await act(w, slo, r.id, { action: 'accept_offer' }))
    const a = accepted.requests[0]
    check('S18', 'accepting an SLO offer moves the room and goes to ACAD', a?.roomId === 'ac-03-lr-003' && a?.status === 'pending' && a?.stageIndex === 1)
  }
  // S19
  {
    const w = newWorld()
    const r = await submit(w)
    must(await act(w, slo, r.id, { action: 'approve' }))
    must(await act(w, acad, r.id, { action: 'offer_room', roomId: 'ac-03-lr-003' }))
    const out = must(await act(w, acad, r.id, { action: 'accept_offer' }))
    check('S19', 'accepting an ACAD offer confirms in the new room', out.requests[0]?.status === 'confirmed' && out.requests[0]?.roomId === 'ac-03-lr-003')
  }
  // S20
  {
    const w = newWorld()
    const r = await submit(w)
    must(await act(w, slo, r.id, { action: 'offer_room', roomId: 'ac-03-lr-003' }))
    w.tick(25 * 3_600_000)
    await sweepWorld(w, slo)
    const after = await w.repo.getRequest(r.id)
    const logs = await w.repo.listLogs(r.id)
    const outbox = await w.repo.listOutbox()
    check('S20', 'offer lapses after 24 hours', after?.status === 'changes_requested' && logs.some((l) => l.action === 'offer_lapsed') && outbox.some((e) => e.trigger === 'offer_lapsed' && e.requestId === r.id))
  }
  // S21
  {
    const w = newWorld()
    const booked = await submit(w, { roomId: 'ac-03-lr-003', eventName: 'Booked' })
    await confirmThroughChain(w, booked.id)
    const r = await submit(w, { organisationId: ECON, category: 'seminar', expectedAttendance: 55 })
    const taken = await act(w, slo, r.id, { action: 'offer_room', roomId: 'ac-03-lr-003' })
    const small = await act(w, slo, r.id, { action: 'offer_room', roomId: 'ac-01-lr-101' })
    const rooms = await w.repo.listRooms()
    const tiny = rooms.find((x) => x.capacity < 55 && x.bookableByClubs && x.id !== ROOM)
    const tooSmall = tiny ? await act(w, slo, r.id, { action: 'offer_room', roomId: tiny.id }) : small
    check('S21', 'offering a booked or too small room: 400', !taken.ok && taken.code === 400 && !tooSmall.ok && tooSmall.code === 400)
  }
  // S22
  {
    const w = newWorld()
    const clean = await submit(w, { roomId: 'ac-01-lr-201', eventName: 'Clean', expectedAttendance: 10 })
    const over = await submit(w, { roomId: 'ac-01-lr-202', eventName: 'Over', expectedAttendance: 500 })
    await submit(w, { roomId: 'ac-01-lr-203', eventName: 'Clash A' })
    const clash = await submit(w, { roomId: 'ac-01-lr-203', eventName: 'Clash B' })
    const ctx = await ctxOf(w)
    const now = new Date(START + 600_000).toISOString()
    const laneOf = (id: string) => {
      const r = ctx.requests.find((x) => x.id === id)
      const room = ctx.rooms.find((x) => x.id === r?.roomId)
      return r && room ? laneFor(ctx, r, flagsFor(ctx, r, room, now)) : 'none'
    }
    check('S22', 'lanes: clear, look, clash', laneOf(clean.id) === 'clear' && laneOf(over.id) === 'look' && laneOf(clash.id) === 'clash', `${laneOf(clean.id)}/${laneOf(over.id)}/${laneOf(clash.id)}`)
  }
  // S23, S24, S25
  {
    const w = newWorld()
    const r1 = await submit(w, { roomId: 'ac-01-lr-201', eventName: 'R1', expectedAttendance: 10 })
    const r2 = await submit(w, { roomId: 'ac-01-lr-202', eventName: 'R2', expectedAttendance: 10 })
    const r3 = await submit(w, { roomId: 'ac-01-lr-205', eventName: 'R3', expectedAttendance: 10 })
    await submit(w, { roomId: 'ac-01-lr-205', eventName: 'Rival', organisationId: ECON, category: 'seminar', expectedAttendance: 10 })
    w.tick(60_000)
    const res = must(await w.svc.bulkApprove(slo, [r1, r2, r3].map((r) => ({ id: r.id, version: r.version }))))
    check('S23', 'bulk approve skips a request that became a clash', res.approved.length === 2 && res.skipped.length === 1 && res.skipped[0]?.id === r3.id, JSON.stringify(res.skipped))

    const undone = await w.svc.undo(slo, res.batchId ?? '')
    const after = await w.repo.getRequest(r1.id)
    const outbox = await w.repo.listOutbox()
    const logs = await w.repo.listLogs(r1.id)
    check('S24', 'undo within 10 s restores requests and voids emails', undone.ok && after?.stageIndex === 0 && outbox.some((e) => e.batchId === res.batchId && e.status === 'failed') && logs.some((l) => l.action === 'undone'))

    const w2 = newWorld()
    const a = await submit(w2, { roomId: 'ac-01-lr-201', eventName: 'A', expectedAttendance: 10 })
    const b = must(await w2.svc.bulkApprove(slo, [{ id: a.id, version: a.version }]))
    const wrongActor = await w2.svc.undo(oa, b.batchId ?? '')
    w2.tick(11_000)
    const late = await w2.svc.undo(slo, b.batchId ?? '')
    check('S25', 'undo by another actor is 403, after 10 s is 409', !wrongActor.ok && wrongActor.code === 403 && !late.ok && late.code === 409)
  }
  // S26
  {
    const w = newWorld()
    const a = await submit(w, { eventName: 'Workshop', category: 'workshop' })
    const b = await submit(w, { eventName: 'Open Mic', organisationId: CULTURAL, category: 'cultural', expectedAttendance: 55 })
    must(await act(w, slo, a.id, { action: 'approve' }))
    must(await act(w, oa, b.id, { action: 'escalate' }))
    const ctx = await ctxOf(w)
    const groupId = allClashGroups(ctx)[0]?.id ?? ''
    const av = (await w.repo.getRequest(a.id))?.version ?? 0
    const bv = (await w.repo.getRequest(b.id))?.version ?? 0
    const logCount = (await w.repo.listLogs()).length
    const stale = await w.svc.resolveClash(acad, groupId, {
      winnerId: a.id,
      versions: { [a.id]: av, [b.id]: bv - 1 },
      others: [{ id: b.id, action: 'offer_room', reason: 'Another room suits you.', roomId: 'ac-03-lr-003' }],
    })
    const unchanged = (await w.repo.listRequests()).every((r) => r.status === 'pending') && (await w.repo.listLogs()).length === logCount
    check('S26', 'clash resolve with a stale version: 409 and nothing changes', !stale.ok && stale.code === 409 && unchanged)

    const good = await w.svc.resolveClash(acad, groupId, {
      winnerId: a.id,
      versions: { [a.id]: av, [b.id]: bv },
      others: [{ id: b.id, action: 'offer_room', reason: 'Another room suits you.', roomId: 'ac-03-lr-003' }],
    })
    const aAfter = await w.repo.getRequest(a.id)
    const bAfter = await w.repo.getRequest(b.id)
    check('S26b', 'resolve confirms the winner and offers the other a room', good.ok && aAfter?.status === 'confirmed' && bAfter?.status === 'offered' && bAfter.offer?.roomId === 'ac-03-lr-003')
  }

  const lateMeeting: Partial<RequestDraft> = { eventName: 'Committee', category: 'meeting', roomId: 'ac-01-lr-102', startMin: 21 * 60 + 30, endMin: 22 * 60 + 30, expectedAttendance: 20 }
  const enable = async (w: World): Promise<void> => {
    const s = await w.repo.getSettings()
    await w.repo.saveSettings({ ...s, autoApproval: s.autoApproval.map((r) => ({ ...r, enabled: true })) })
  }
  // S27
  {
    const w = newWorld()
    const r = await submit(w, lateMeeting)
    const ctx = await ctxOf(w)
    const room = ctx.rooms.find((x) => x.id === r.roomId)
    const lane = room ? laneFor(ctx, r, flagsFor(ctx, r, room, new Date(START + 120_000).toISOString())) : 'none'
    check('S27', 'rule disabled: pending and clear', r.status === 'pending' && lane === 'clear')
  }
  // S28
  {
    const w = newWorld()
    await enable(w)
    const r = await submit(w, lateMeeting)
    const logs = await w.repo.listLogs(r.id)
    const outbox = await w.repo.listOutbox()
    check('S28', 'rule enabled: confirmed by system with rule id', r.status === 'confirmed' && logs.some((l) => l.action === 'auto_approved' && l.actorEmail === 'system' && (l.reason ?? '').includes('rule-late-meetings')) && outbox.some((e) => e.trigger === 'auto_approved'))
  }
  // S29
  {
    const w = newWorld()
    await enable(w)
    const r = await submit(w, { ...lateMeeting, expectedAttendance: 500 })
    check('S29', 'rule enabled but request needs a look: not auto-approved', r.status === 'pending')
  }
  // S30
  {
    const w = newWorld()
    const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']
    let last: BookingRequest | null = null
    for (const date of dates) last = await submit(w, { date, roomId: 'ac-01-lr-201', expectedAttendance: 10 })
    const ctx = await ctxOf(w)
    const room = ctx.rooms.find((x) => x.id === 'ac-01-lr-201')
    const flags = last && room ? flagsFor(ctx, last, room, new Date(START + 900_000).toISOString()) : []
    const lane = last && room ? laneFor(ctx, last, flags) : 'none'
    check('S30', 'club at its weekly cap: flag and look lane', flags.some((f) => f.kind === 'over_weekly_cap') && lane === 'look')
  }
  // S31
  {
    const w = newWorld()
    const r = await submit(w)
    const s = await w.repo.getSettings()
    await w.repo.saveSettings({ ...s, workflows: [...s.workflows, { id: 'wf-test', name: 'Skip SLO', match: { officeId: 'slo' }, stages: ['acad'] }] })
    const after = await w.repo.getRequest(r.id)
    const next = await submit(w, { organisationId: ECON, roomId: 'ac-04-lr-304' })
    check('S31', 'template edits do not change in-flight chains', after?.stages.join() === 'slo,acad' && next.stages.join() === 'acad')
  }
  // S32
  {
    const w = newWorld()
    const a = await submit(w, { eventName: 'Same' })
    must(await act(w, slo, a.id, { action: 'approve' }))
    must(await act(w, acad, a.id, { action: 'request_changes', reason: 'Please add the guest speaker details.' }))
    const same = must(await act(w, acad, a.id, { action: 'resubmit' })).requests[0]
    const b = await submit(w, { eventName: 'Moved', roomId: 'ac-04-lr-304' })
    must(await act(w, slo, b.id, { action: 'approve' }))
    must(await act(w, acad, b.id, { action: 'request_changes', reason: 'Please pick a bigger room for the crowd.' }))
    const moved = must(await act(w, acad, b.id, { action: 'resubmit', changes: { roomId: 'ac-03-lr-005' } })).requests[0]
    check('S32', 'resubmit: unchanged keeps the step, moved restarts with previous set', same?.stageIndex === 1 && same?.previous === null && moved?.stageIndex === 0 && moved?.previous !== null)
  }
  // S33
  {
    const w = newWorld()
    const r = await submit(w)
    const requestMail = async () => (await w.repo.listOutbox()).filter((e) => e.requestId !== 'DIGEST').length
    const before = await requestMail()
    must(await act(w, slo, r.id, { action: 'note', reason: 'Checked with the facilities team.' }))
    const logs = await w.repo.listLogs(r.id)
    const after = await w.repo.getRequest(r.id)
    check('S33', 'note is internal, sends nothing, keeps the version', logs.some((l) => l.action === 'note' && l.internal) && (await requestMail()) === before && after?.version === r.version)
  }
  // S34
  {
    const w = newWorld()
    const r = await submit(w)
    w.tick(12 * 86_400_000)
    await sweepWorld(w, slo)
    const after = await w.repo.getRequest(r.id)
    const outbox = await w.repo.listOutbox()
    check('S34', 'undecided request expires once the event has started', after?.status === 'expired' && outbox.some((e) => e.trigger === 'request_expired' && e.requestId === r.id))
  }
  // S35
  {
    const seed = buildSeed(new Date(START).toISOString())
    const ctx: EngineContext = { settings: seed.settings, rooms: seed.rooms, organisations: seed.organisations, timetable: seed.timetable, requests: seed.requests, newId: () => 'x' }
    const now = new Date(START).toISOString()
    const t0 = performance.now()
    let counted = 0
    for (const r of seed.requests) {
      if (r.status !== 'pending') continue
      const room = seed.rooms.find((x) => x.id === r.roomId)
      if (room) {
        laneFor(ctx, r, flagsFor(ctx, r, room, now))
        counted += 1
      }
    }
    const lanesMs = performance.now() - t0
    const t1 = performance.now()
    roomsDay(ctx, { date: '2026-11-12', from: 18 * 60, to: 20 * 60, minSeats: 40 })
    const roomsMs = performance.now() - t1
    check('S35', `lanes for ${counted} pending and the rooms summary under 200 ms`, lanesMs < 200 && roomsMs < 200, `lanes ${lanesMs.toFixed(0)} ms, rooms ${roomsMs.toFixed(0)} ms`)
  }
  // S36, S37, S38
  {
    const w = newWorld()
    const r = await submit(w, { eventName: 'Slow one' })
    w.tick(3 * 86_400_000)
    await sweepWorld(w, slo)
    let outbox = await w.repo.listOutbox()
    check('S36a', 'after the response target: overdue email, no escalation yet', outbox.some((e) => e.trigger === 'step_overdue' && e.requestId === r.id) && !outbox.some((e) => e.trigger === 'step_escalated'))
    w.tick(2 * 86_400_000)
    await sweepWorld(w, slo)
    await sweepWorld(w, slo)
    outbox = await w.repo.listOutbox()
    const escalations = outbox.filter((e) => e.trigger === 'step_escalated' && e.requestId === r.id)
    const settings = await w.repo.getSettings()
    const acadInbox = settings.offices.find((o) => o.id === 'acad')?.inboxEmails[0] ?? ''
    check('S36b', 'after twice the target: the backup (Academic Booking) is emailed once', escalations.length === 1 && escalations[0]?.to.includes(acadInbox) === true)

    const digests = outbox.filter((e) => e.trigger === 'weekly_digest')
    check('S37', 'a weekly summary goes out once per office per week', digests.length >= 1 && new Set(digests.map((d) => `${d.to.join()}|${isoWeekKey(todayIST(d.at))}`)).size === digests.length && digests.every((d) => d.requestId === 'DIGEST'))
  }
  {
    const w = newWorld()
    const r = await submit(w)
    must(await act(w, slo, r.id, { action: 'approve' }))
    const stale = await w.svc.performAction(oa, r.id, { action: 'reject', version: r.version, reason: 'Not my request to decide.' })
    const second = await w.svc.performAction(acad, r.id, { action: 'approve', version: r.version })
    check('S38', 'a stale action names who already acted', !second.ok && second.code === 409 && /Already actioned by Student Life Office/.test(second.error), second.ok ? 'ok' : second.error)
    void stale
  }
  void superAdmin

  console.log(`\n${passes} passed, ${failures} failed`)
  if (failures > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.log('Scenario run crashed:', error)
  process.exit(1)
})
