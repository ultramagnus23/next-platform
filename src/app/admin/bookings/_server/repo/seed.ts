import type {
  Actor,
  ActionInput,
  ApprovalLog,
  BookingRequest,
  BookingSettings,
  CategoryId,
  EngineContext,
  Organisation,
  OutboxEmail,
  RequestDraft,
  Room,
  TimetableBlock,
} from '../../types'
import { addDays, isoWeekKey, todayIST, weekdayOf } from '../../utils'
import { freeRooms } from '../engine/availability'
import { occupancy, slotsOverlap } from '../engine/occupancy'
import { directBooking, submitRequest, transition } from '../engine/workflow'
import { buildOrganisations, buildRooms, buildSettings, buildTimetable, mulberry32, orgIdFor, seedActor } from './fixtures'
import type { BookingSeedData } from './repository'

/**
 * Deterministic seed at demo scale: about 104 rooms, 90 organisations, two
 * weeks of classes and about 450 requests. Every request is driven through the
 * real engine, so logs and emails match each history. All names are placeholders.
 */

const SEED = 20261111
const slo = seedActor('slo')
const oa = seedActor('oa')
const cfe = seedActor('cfe')
const acad = seedActor('acad')
const OFFICE_ACTOR = { slo, oa, cfe, acad }

const TOPICS = [
  'Python', 'Data', 'Climate', 'Poetry', 'Budget', 'Startup', 'Photography', 'Film', 'Chess', 'Robotics', 'Law', 'History', 'Mental health',
  'Design', 'Astronomy', 'Trekking', 'Music', 'Theatre', 'Policy', 'Statistics', 'Writing', 'Debate', 'Cooking', 'Fitness', 'Gaming',
  'Anime', 'Finance', 'Ethics', 'Language', 'Quiz',
]
const FORMAT: Record<CategoryId, string[]> = {
  academic: ['review session'],
  seminar: ['talk', 'lecture', 'panel'],
  workshop: ['workshop', 'bootcamp'],
  competition: ['contest', 'league round', 'tournament round'],
  club_event: ['meet-up', 'session', 'social', 'practice'],
  cultural: ['showcase', 'open mic', 'night'],
  meeting: ['planning meeting', 'committee meeting', 'general body meeting'],
  other: ['gathering'],
}
const REJECT_REASONS = [
  'The room is held for exam preparation that evening.',
  'Another event already has priority for this slot.',
  'The event description is too short to review. Please add details.',
  'This room cannot seat the expected crowd safely.',
]
const CHANGE_REASONS = [
  'Please confirm the equipment you need and list any guest speakers.',
  'Please pick a time that does not run past 10 PM.',
  'Please add a faculty contact for this event.',
]

class Driver {
  requests: BookingRequest[] = []
  logs: ApprovalLog[] = []
  outbox: OutboxEmail[] = []
  private counter = 1000
  private forced: number | null = null
  private logN = 0
  private mailN = 0
  private readonly reserved = new Set([1042, 1046])

  constructor(
    readonly settings: BookingSettings,
    readonly rooms: Room[],
    readonly organisations: Organisation[],
    readonly timetable: readonly TimetableBlock[],
  ) {}

  ctx(): EngineContext {
    return {
      settings: this.settings,
      rooms: this.rooms,
      organisations: this.organisations,
      timetable: this.timetable,
      requests: this.requests,
      newId: (kind) => {
        if (kind === 'request') {
          if (this.forced !== null) {
            const n = this.forced
            this.forced = null
            return `BK-${n}`
          }
          do this.counter += 1
          while (this.reserved.has(this.counter))
          return `BK-${this.counter}`
        }
        if (kind === 'log') {
          this.logN += 1
          return `LOG-${String(this.logN).padStart(6, '0')}`
        }
        this.mailN += 1
        return `EM-${String(this.mailN).padStart(6, '0')}`
      },
    }
  }

  private take(result: { requests?: BookingRequest[]; request?: BookingRequest; logs: ApprovalLog[]; emails: OutboxEmail[] }): BookingRequest {
    const changed = result.requests ?? (result.request ? [result.request] : [])
    const next = this.requests.map((r) => changed.find((c) => c.id === r.id) ?? r)
    for (const c of changed) if (!next.some((r) => r.id === c.id)) next.push(c)
    this.requests = next
    this.logs.push(...result.logs)
    this.outbox.push(...result.emails)
    return changed[0] as BookingRequest
  }

  submit(draft: RequestDraft, at: string, forced?: number): BookingRequest {
    if (forced !== undefined) this.forced = forced
    const result = submitRequest(draft, this.ctx(), at)
    if ('error' in result) throw new Error(`Seed submit failed for "${draft.eventName}": ${result.error}`)
    return this.take(result)
  }

  act(id: string, input: Omit<ActionInput, 'version'>, actor: Actor, at: string): BookingRequest {
    const current = this.requests.find((r) => r.id === id)
    if (!current) throw new Error(`Seed: unknown request ${id}`)
    const result = transition(current, { ...input, version: current.version }, actor, this.ctx(), at)
    if ('error' in result) throw new Error(`Seed ${input.action} failed for ${id}: ${result.error}`)
    return this.take(result)
  }

  tryAct(id: string, input: Omit<ActionInput, 'version'>, actor: Actor, at: string): boolean {
    try {
      this.act(id, input, actor, at)
      return true
    } catch {
      return false
    }
  }

  direct(draft: RequestDraft, at: string): BookingRequest | null {
    const result = directBooking(draft, acad, this.ctx(), at)
    if ('error' in result) return null
    return this.take(result)
  }

  /** True when nothing at all occupies the slot: no class, hold, booking or competing request. */
  isFree(roomId: string, date: string, startMin: number, endMin: number): boolean {
    return !occupancy(this.ctx(), roomId, date).some((i) => slotsOverlap({ startMin, endMin }, i, 0))
  }
}

export function buildSeed(nowIso: string): BookingSeedData {
  const settings = buildSettings()
  const rooms = buildRooms()
  const organisations = buildOrganisations()
  const today = todayIST(nowIso)
  const rng = mulberry32(SEED)
  const nowMs = Date.parse(nowIso)
  const ago = (hours: number): string => new Date(nowMs - hours * 3_600_000).toISOString()
  const day = (n: number): string => addDays(today, n)
  const int = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))
  const pick = <T,>(list: readonly T[]): T => list[int(0, list.length - 1)] as T

  // One class is added by hand so the "blocked by a class" demo case always exists.
  const timetable: TimetableBlock[] = [
    ...buildTimetable(today, rooms).filter((b) => !(b.roomId === 'ac-04-lr-304' && b.date === day(3))),
    { id: 'tt-fixed-1', roomId: 'ac-04-lr-304', courseCode: 'HIS-201', title: 'Colonial Histories', date: day(3), startMin: 14 * 60 + 15, endMin: 15 * 60 + 30 },
  ]
  const driver = new Driver(settings, rooms, organisations, timetable)
  const org = (name: string): Organisation => organisations.find((o) => o.id === orgIdFor(name)) as Organisation
  const emailOf = (o: Organisation): string => `lead.${o.id.replace('org-', '')}@example.ashoka.edu.in`
  const officeActor = (o: Organisation): Actor => OFFICE_ACTOR[o.officeId]

  const reservedRooms = new Set(['ac-01-lr-207', 'ac-03-lr-003'])
  const clubRooms = rooms.filter((r) => r.bookableByClubs && !reservedRooms.has(r.id))
  const weekCount = new Map<string, number>()

  const draft = (o: Organisation, name: string, category: CategoryId, roomId: string, date: string, startMin: number, endMin: number, attendance: number): RequestDraft => ({
    organisationId: o.id,
    submittedBy: emailOf(o),
    eventName: name,
    category,
    description: `${name}, organised by ${o.name}.`,
    roomId,
    date,
    startMin,
    endMin,
    expectedAttendance: attendance,
  })

  /** Finds a free room, date and start for an event. Returns null after many tries. */
  const place = (attendance: number, offsets: [number, number], weekendOk = true): { room: Room; date: string; startMin: number; endMin: number } | null => {
    for (let attempt = 0; attempt < 250; attempt++) {
      const date = day(int(offsets[0], offsets[1]))
      const weekend = weekdayOf(date) === 0 || weekdayOf(date) === 6
      if (weekend && !weekendOk) continue
      const startMin = weekend ? int(10, 16) * 60 : 17 * 60 + int(0, 9) * 30
      const endMin = startMin + pick([60, 90, 120])
      const candidates = clubRooms.filter((r) => r.capacity >= attendance && r.capacity <= attendance * 2.4)
      const room = candidates.length > 0 ? pick(candidates) : pick(clubRooms)
      if (endMin > room.openUntilMin) continue
      if (date === day(2) && startMin < 21 * 60 && endMin > 17 * 60 && room.id === 'ac-01-lr-106') continue
      if (driver.isFree(room.id, date, startMin, endMin)) return { room, date, startMin, endMin }
    }
    return null
  }

  const eventName = (category: CategoryId): string => `${pick(TOPICS)} ${pick(FORMAT[category])}`
  const attendanceFor = (): number => int(12, 70)
  const bumpWeek = (o: Organisation, date: string): boolean => {
    const key = `${o.id}|${isoWeekKey(date)}`
    const n = weekCount.get(key) ?? 0
    if (n >= 4) return false
    weekCount.set(key, n + 1)
    return true
  }
  const clubOrgs = (office: Actor['actingFor']): Organisation[] =>
    organisations.filter((o) => o.officeId === office && (o.kind === 'club' || o.kind === 'society'))
  const otherOrgs = organisations.filter((o) => o.kind !== 'club' && o.kind !== 'society')

  /* ---------------- Fixed demo cases ---------------- */

  const ml = org('CS Society')
  driver.submit(draft(ml, 'Intro to ML Workshop', 'workshop', 'ac-01-lr-106', day(2), 18 * 60, 20 * 60, 45), ago(20), 1042)
  const cult = org('Cultural Society')
  driver.submit(draft(cult, 'Open Mic Night', 'cultural', 'ac-01-lr-106', day(2), 18 * 60, 20 * 60, 60), ago(10), 1046)

  // Make AC-03 104 the best free fit for 60 people on the demo evening: every other big room is taken.
  for (const r of rooms) {
    if (r.capacity < 60 || !r.bookableByClubs || ['ac-01-lr-106', 'ac-03-lr-003'].includes(r.id)) continue
    const o = pick(organisations.filter((x) => x.kind === 'department' || x.kind === 'office' || x.kind === 'ministry'))
    driver.direct(draft(o, `${pick(TOPICS)} lecture`, 'seminar', r.id, day(2), 17 * 60, 22 * 60 + 30, Math.min(40, r.capacity)), ago(int(150, 300)))
  }

  const crisisOrg = org('Model UN Society')
  driver.submit(draft(crisisOrg, 'Crisis committee', 'club_event', 'ac-01-lr-103', day(4), 18 * 60, 20 * 60, 70), ago(30))

  // Night sky: starts about 30 hours from now.
  const target = nowMs + 30 * 3_600_000
  const nightDate = todayIST(new Date(target).toISOString())
  const istMin = Math.floor((target / 60_000 + 330) % 1440)
  const nightStart = Math.min(Math.max(Math.round(istMin / 15) * 15, 17 * 60), 21 * 60)
  driver.submit(draft(org('Astronomy Club'), 'Night sky session', 'club_event', 'ac-02-lr-107', nightDate, nightStart, nightStart + 120, 35), ago(6))

  // Trek planning: the club's sixth booking that week, with a poor record.
  const trekOrg = org('Mountaineering Club')
  const trekDate = day(8)
  const sameWeek = Array.from({ length: 6 }, (_, i) => day(6 + i)).filter((d) => isoWeekKey(d) === isoWeekKey(trekDate))
  let placedTrek = 0
  for (const date of sameWeek) {
    for (let k = 0; k < 2 && placedTrek < 5; k++) {
      const startMin = 17 * 60 + k * 150
      const room = pick(clubRooms.filter((r) => r.capacity >= 20))
      if (!driver.isFree(room.id, date, startMin, startMin + 90)) continue
      const r = driver.submit(draft(trekOrg, `${pick(TOPICS)} ${pick(FORMAT.club_event)}`, 'club_event', room.id, date, startMin, startMin + 90, 20), ago(200 + placedTrek))
      driver.act(r.id, { action: 'approve' }, slo, ago(190))
      driver.act(r.id, { action: 'approve' }, acad, ago(180))
      placedTrek += 1
    }
  }
  const trekRoom = pick(clubRooms.filter((r) => r.capacity >= 20 && driver.isFree(r.id, trekDate, 19 * 60, 20 * 60 + 30)))
  driver.submit(draft(trekOrg, 'Trek planning meet', 'meeting', trekRoom.id, trekDate, 19 * 60, 20 * 60 + 30, 15), ago(8))

  // Blocked by a class: no override is possible.
  const history = org('Dept of History')
  driver.submit(draft(history, 'Faculty reading group', 'seminar', 'ac-04-lr-304', day(3), 14 * 60 + 30, 16 * 60, 25), ago(5))

  // Blocked by a confirmed booking: override is offered.
  const filmClub = org('Film Club')
  const rehearsal = driver.submit(draft(filmClub, 'Film festival rehearsal', 'club_event', 'ac-03-lr-005', day(5), 19 * 60, 21 * 60, 30), ago(120))
  driver.act(rehearsal.id, { action: 'approve' }, slo, ago(110))
  driver.act(rehearsal.id, { action: 'approve' }, acad, ago(100))
  driver.submit(draft(org('Dept of Economics'), 'Guest lecture on policy', 'seminar', 'ac-03-lr-005', day(5), 20 * 60, 22 * 60, 40), ago(30))

  // Back to back, no clash. Partial overlap, clash.
  driver.submit(draft(filmClub, 'Short film screening', 'club_event', 'ac-01-lr-205', day(3), 18 * 60, 20 * 60, 40), ago(26))
  driver.submit(draft(org('Photography Club'), 'Photo review night', 'club_event', 'ac-01-lr-205', day(3), 20 * 60, 21 * 60, 20), ago(25))
  driver.submit(draft(org('Debating Society'), 'Debate practice round', 'competition', 'ac-01-lr-204', day(3), 17 * 60, 18 * 60 + 30, 20), ago(24))
  driver.submit(draft(org('Poetry Circle'), 'Open poetry hour', 'cultural', 'ac-01-lr-204', day(3), 18 * 60, 20 * 60, 22), ago(23))

  /* ---------------- The Student Life Office inbox: 21 clear requests ---------------- */

  const named: Array<[string, string, CategoryId]> = [
    ['Quiz Club', 'Weekly quiz night', 'competition'],
    ['Economics Society', 'Budget 2027 explained', 'seminar'],
    ['Debating Society', 'Novice debate practice', 'club_event'],
  ]
  const usedClear = new Set(['Quiz Club', 'Economics Society', 'Debating Society', 'CS Society', 'Model UN Society', 'Astronomy Club', 'Mountaineering Club', 'Film Club', 'Photography Club', 'Poetry Circle'])
  const clearPool = clubOrgs('slo').filter((o) => !usedClear.has(o.name))
  let clearMade = 0
  for (let i = 0; clearMade < 21 && i < 80; i++) {
    const nameDef = named[clearMade]
    const o = nameDef ? org(nameDef[0]) : pick(clearPool)
    const category: CategoryId = nameDef ? nameDef[2] : pick(['club_event', 'workshop', 'seminar'])
    const attendance = int(14, 36)
    const slot = place(attendance, [3, 12], false)
    if (!slot || slot.room.capacity < attendance * 1.4) continue
    if (!nameDef && !bumpWeek(o, slot.date)) continue
    const overdue = clearMade % 7 === 3 ? int(55, 90) : int(1, 40)
    driver.submit(draft(o, nameDef ? nameDef[1] : eventName(category), category, slot.room.id, slot.date, slot.startMin, slot.endMin, attendance), ago(overdue))
    clearMade += 1
  }

  /* ---------------- A few more that need a look ---------------- */

  for (let i = 0; i < 3; i++) {
    const o = pick(clubOrgs('slo'))
    const slot = place(40, [4, 12], false)
    if (!slot) continue
    driver.submit(draft(o, eventName('club_event'), 'club_event', slot.room.id, slot.date, slot.startMin, slot.endMin, Math.ceil(slot.room.capacity * 1.3)), ago(int(3, 30)))
  }
  for (let i = 0; i < 2; i++) {
    const o = pick(clubOrgs('slo'))
    const slot = place(20, [1, 1], false)
    if (!slot) continue
    driver.submit(draft(o, eventName('club_event'), 'club_event', slot.room.id, slot.date, slot.startMin, slot.endMin, 20), ago(5))
  }
  const lab = rooms.find((r) => !r.bookableByClubs)
  if (lab) {
    const date = day(6)
    if (driver.isFree(lab.id, date, 17 * 60, 19 * 60)) driver.submit(draft(org('Data Science Club'), 'Data lab practice', 'workshop', lab.id, date, 17 * 60, 19 * 60, 25), ago(12))
  }

  /* ---------------- Other offices ---------------- */

  for (let i = 0; i < 8; i++) {
    const o = pick(clubOrgs('oa'))
    const slot = place(attendanceFor(), [3, 12])
    if (!slot || !bumpWeek(o, slot.date)) continue
    driver.submit(draft(o, eventName('cultural'), 'cultural', slot.room.id, slot.date, slot.startMin, slot.endMin, Math.min(attendanceFor(), slot.room.capacity)), ago(int(2, 70)))
  }
  for (let i = 0; i < 6; i++) {
    const o = pick(clubOrgs('cfe'))
    const category: CategoryId = i < 3 ? 'workshop' : 'seminar'
    const slot = place(attendanceFor(), [3, 12])
    if (!slot || !bumpWeek(o, slot.date)) continue
    driver.submit(draft(o, eventName(category), category, slot.room.id, slot.date, slot.startMin, slot.endMin, Math.min(attendanceFor(), slot.room.capacity)), ago(int(2, 60)))
  }

  /* ---------------- Waiting on Academic Booking: 38 forwarded ---------------- */

  let forwarded = 0
  for (let i = 0; forwarded < 38 && i < 200; i++) {
    const o = pick(organisations.filter((x) => x.kind === 'club' || x.kind === 'society'))
    const category: CategoryId = pick(['club_event', 'workshop', 'seminar', 'competition', 'cultural'])
    const attendance = attendanceFor()
    const slot = place(attendance, [2, 13])
    if (!slot || !bumpWeek(o, slot.date)) continue
    const at = int(30, 110)
    const r = driver.submit(draft(o, eventName(category), category, slot.room.id, slot.date, slot.startMin, slot.endMin, Math.min(attendance, slot.room.capacity)), ago(at))
    if (!driver.tryAct(r.id, { action: 'approve' }, officeActor(o), ago(at - int(2, 26)))) continue
    forwarded += 1
  }

  /* ---------------- Closed and in-between: changes, rejected, offered ---------------- */

  const makeAndAct = (count: number, finish: (id: string, o: Organisation, at: number) => boolean): void => {
    let done = 0
    for (let i = 0; done < count && i < count * 8; i++) {
      const o = pick(organisations.filter((x) => x.kind === 'club' || x.kind === 'society'))
      const category: CategoryId = pick(['club_event', 'workshop', 'seminar', 'competition', 'cultural', 'meeting'])
      const attendance = attendanceFor()
      const slot = place(attendance, [2, 13])
      if (!slot || !bumpWeek(o, slot.date)) continue
      const at = int(20, 150)
      const r = driver.submit(draft(o, eventName(category), category, slot.room.id, slot.date, slot.startMin, slot.endMin, Math.min(attendance, slot.room.capacity)), ago(at))
      if (finish(r.id, o, at)) done += 1
    }
  }
  makeAndAct(36, (id, o, at) => driver.tryAct(id, { action: 'request_changes', reason: pick(CHANGE_REASONS) }, officeActor(o), ago(at - int(2, 18))))
  makeAndAct(27, (id, o, at) => driver.tryAct(id, { action: 'reject', reason: pick(REJECT_REASONS) }, officeActor(o), ago(at - int(2, 18))))
  makeAndAct(13, (id, o, at) => {
    const request = driver.requests.find((r) => r.id === id)
    const current = rooms.find((r) => r.id === request?.roomId)
    if (!request || !current) return false
    const options = freeRooms(driver.ctx(), { date: request.date, startMin: request.startMin, endMin: request.endMin, minSeats: request.expectedAttendance, forClubs: true, excludeRoomId: request.roomId, excludeRequestId: request.id }, current)
    const choice = options.find((f) => !reservedRooms.has(f.room.id))
    if (!choice) return false
    return driver.tryAct(id, { action: 'offer_room', roomId: choice.room.id, reason: 'Your room is booked for another event at that time.' }, officeActor(o), ago(Math.min(at, int(2, 20))))
  })

  /* ---------------- Confirmed (about 245), cancelled and displaced ---------------- */

  let confirmed = 0
  for (let i = 0; confirmed < 245 && i < 900; i++) {
    const club = rng() > 0.1
    const o = club ? pick(organisations.filter((x) => x.kind === 'club' || x.kind === 'society')) : pick(otherOrgs)
    const category: CategoryId = club ? pick(['club_event', 'club_event', 'workshop', 'seminar', 'competition', 'cultural', 'meeting']) : pick(['seminar', 'meeting', 'academic'])
    const attendance = attendanceFor()
    const slot = place(attendance, [0, 13])
    if (!slot) continue
    if (club && !bumpWeek(o, slot.date)) continue
    const at = int(110, 330)
    const dr = draft(o, eventName(category), category, slot.room.id, slot.date, slot.startMin, slot.endMin, Math.min(attendance, slot.room.capacity))
    if (!club) {
      if (driver.direct(dr, ago(at))) confirmed += 1
      continue
    }
    const r = driver.submit(dr, ago(at))
    let ok = true
    for (let step = 0; step < r.stages.length && ok; step++) {
      const stage = r.stages[step]
      const actor = stage ? OFFICE_ACTOR[stage] : acad
      ok = driver.tryAct(r.id, { action: 'approve' }, actor, ago(at - 4 - step * 12))
    }
    if (ok) confirmed += 1
  }

  // Cancelled: a confirmed booking Academic Booking later cancels.
  const confirmedList = driver.requests.filter((r) => r.status === 'confirmed' && r.source === 'request')
  for (let i = 0; i < 8 && i < confirmedList.length; i++) {
    const r = confirmedList[i * 7]
    if (r) driver.tryAct(r.id, { action: 'cancel', reason: 'Cancelled at the request of the organising club.' }, acad, ago(int(2, 60)))
  }
  // Displaced: a department overrides a club booking.
  let displaced = 0
  for (const r of driver.requests.filter((x) => x.status === 'confirmed' && x.source === 'request' && x.date >= day(4) && x.id !== rehearsal.id)) {
    if (displaced >= 5) break
    const o = pick(otherOrgs.filter((x) => x.kind === 'department'))
    const y = driver.submit(draft(o, `${pick(TOPICS)} lecture`, 'seminar', r.roomId, r.date, r.startMin, r.endMin, 30), ago(int(10, 40)))
    if (driver.tryAct(y.id, { action: 'override_confirm', reason: 'A faculty lecture needs this room at short notice.' }, acad, ago(int(2, 9)))) displaced += 1
  }

  return {
    requests: driver.requests,
    logs: driver.logs,
    outbox: driver.outbox,
    settings,
    rooms,
    organisations,
    timetable,
  }
}
