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
} from '../../types'
import { addDays, todayIST } from '../../utils'
import { overlaps } from '../engine/overlap'
import { submitRequest, transition } from '../engine/workflow'
import { buildOrganisations, buildRooms, buildSettings, seedActor } from './fixtures'
import type { BookingSeedData } from './repository'

/**
 * Deterministic seed. Dates are relative to the day the store is created.
 * Every request is driven through the real engine, so logs and outbox emails
 * match each request's history. All names are placeholders.
 */

const SEED = 20261111

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const slo = seedActor('slo')
const oa = seedActor('oa')
const cfe = seedActor('cfe')
const acad = seedActor('acad')

const CLASS_NAMES = [
  'Microeconomics Lecture',
  'Data Structures Lab',
  'Introduction to Psychology',
  'Calculus II',
  'Modern Indian History',
  'Organic Chemistry Tutorial',
  'Political Theory Seminar Class',
  'Statistics for Social Science',
  'Creative Writing Studio',
  'Introduction to Sociology',
  'Linear Algebra',
  'Environmental Studies Lecture',
]

type EventIdea = readonly [name: string, category: CategoryId]

const EVENT_POOL: Record<string, EventIdea[]> = {
  'org-cs': [
    ['Git and GitHub Basics', 'workshop'],
    ['Competitive Programming Contest', 'competition'],
    ['Open Source Evening', 'club_event'],
  ],
  'org-cultural': [
    ['Poetry Evening', 'cultural'],
    ['Folk Music Showcase', 'cultural'],
  ],
  'org-econ': [
    ['Behavioural Economics Talk', 'seminar'],
    ['Market Simulation Game', 'club_event'],
  ],
  'org-debate': [
    ['Parliamentary Debate Round', 'competition'],
    ['Public Speaking Clinic', 'workshop'],
  ],
  'org-ecell': [
    ['Founders Fireside Chat', 'seminar'],
    ['Idea Validation Workshop', 'workshop'],
  ],
  'org-music': [
    ['Acoustic Night', 'cultural'],
    ['Band Practice Session', 'club_event'],
  ],
  'org-dance': [
    ['Contemporary Dance Showcase', 'cultural'],
    ['Salsa Social', 'club_event'],
  ],
  'org-quiz': [
    ['General Knowledge Quiz', 'competition'],
    ['Sports Quiz Evening', 'club_event'],
  ],
  'org-photo': [
    ['Portrait Photography Workshop', 'workshop'],
    ['Photo Exhibition Setup', 'club_event'],
  ],
  'org-film': [
    ['Documentary Screening', 'club_event'],
    ['Screenwriting Workshop', 'workshop'],
  ],
}

const CLUB_ORG_IDS = Object.keys(EVENT_POOL)

class Driver {
  requests: BookingRequest[] = []
  logs: ApprovalLog[] = []
  outbox: OutboxEmail[] = []
  private requestCounter = 0
  private logCounter = 0
  private emailCounter = 0

  constructor(
    private readonly year: string,
    readonly settings: BookingSettings,
    readonly rooms: Room[],
    readonly organisations: Organisation[],
  ) {}

  private ctx(): EngineContext {
    return {
      settings: this.settings,
      rooms: this.rooms,
      organisations: this.organisations,
      requests: this.requests,
      newId: (kind) => {
        if (kind === 'request') {
          this.requestCounter += 1
          return `BK-${this.year}-${String(this.requestCounter).padStart(4, '0')}`
        }
        if (kind === 'log') {
          this.logCounter += 1
          return `LOG-${String(this.logCounter).padStart(5, '0')}`
        }
        this.emailCounter += 1
        return `EM-${String(this.emailCounter).padStart(5, '0')}`
      },
    }
  }

  submit(draft: RequestDraft, at: string, forcedNumber?: number): BookingRequest {
    if (forcedNumber !== undefined) this.requestCounter = forcedNumber - 1
    const result = submitRequest(draft, this.ctx(), at)
    if ('error' in result) throw new Error(`Seed submit failed for "${draft.eventName}": ${result.error}`)
    this.requests.push(result.request)
    this.logs.push(...result.logs)
    this.outbox.push(...result.emails)
    return result.request
  }

  act(id: string, input: Omit<ActionInput, 'version'>, actor: Actor, at: string): BookingRequest {
    const current = this.requests.find((r) => r.id === id)
    if (!current) throw new Error(`Seed: unknown request ${id}`)
    const result = transition(current, { ...input, version: current.version }, actor, this.ctx(), at)
    if ('error' in result) throw new Error(`Seed action ${input.action} failed for ${id}: ${result.error}`)
    this.requests = this.requests.map((r) => {
      if (r.id === result.request.id) return result.request
      return result.others.find((o) => o.id === r.id) ?? r
    })
    this.logs.push(...result.logs)
    this.outbox.push(...result.emails)
    return result.request
  }

  /** True when the slot is free of every active request. */
  isFree(roomId: string, date: string, startMin: number, endMin: number): boolean {
    const slot = { roomId, date, startMin, endMin }
    return !this.requests.some(
      (r) =>
        (r.status === 'pending' || r.status === 'changes_requested' || r.status === 'confirmed') &&
        overlaps(slot, r, 0),
    )
  }
}

export function buildSeed(nowIso: string): BookingSeedData {
  const settings = buildSettings()
  const rooms = buildRooms()
  const organisations = buildOrganisations()
  const today = todayIST(nowIso)
  const year = today.slice(0, 4)
  const rng = mulberry32(SEED)
  const driver = new Driver(year, settings, rooms, organisations)

  const nowMs = Date.parse(nowIso)
  const ago = (hours: number): string => new Date(nowMs - hours * 3_600_000).toISOString()
  const day = (offset: number): string => addDays(today, offset)
  const int = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))
  const pick = <T,>(list: readonly T[]): T => list[int(0, list.length - 1)] as T
  const emailOf = (orgId: string): string =>
    `${orgId.replace('org-', '')}.lead@example.ashoka.edu.in`
  const roomById = (id: string): Room => rooms.find((r) => r.id === id) as Room

  const demoDate = day(4)
  /** Random placement must leave the demo evening and the AC-03 alternatives alone. */
  const reservedForDemo = (room: Room, date: string, start: number, end: number): boolean =>
    date === demoDate && start < 21 * 60 && end > 17 * 60 && (room.building === 'AC-03' || room.id === 'ac02-201')

  const place = (
    startFrom: number,
    startTo: number,
    durations: readonly number[],
    days: readonly [number, number],
  ): { room: Room; date: string; startMin: number; endMin: number } | null => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const room = pick(rooms)
      const date = day(int(days[0], days[1]))
      const startMin = int(startFrom / 30, startTo / 30) * 30
      const endMin = startMin + pick(durations)
      if (endMin > room.openUntilMin) continue
      if (reservedForDemo(room, date, startMin, endMin)) continue
      if (!driver.isFree(room.id, date, startMin, endMin)) continue
      return { room, date, startMin, endMin }
    }
    return null
  }

  const draftFor = (
    orgId: string,
    idea: EventIdea,
    slot: { room: Room; date: string; startMin: number; endMin: number },
    attendance?: number,
  ): RequestDraft => ({
    organisationId: orgId,
    submittedBy: emailOf(orgId),
    eventName: idea[0],
    category: idea[1],
    description: `${idea[0]}, organised by ${organisations.find((o) => o.id === orgId)?.name ?? orgId}.`,
    roomId: slot.room.id,
    date: slot.date,
    startMin: slot.startMin,
    endMin: slot.endMin,
    expectedAttendance: attendance ?? Math.max(10, Math.floor(slot.room.capacity * (0.4 + rng() * 0.45))),
  })

  const approverFor = (orgId: string): Actor => {
    const authority = organisations.find((o) => o.id === orgId)?.authorityId
    return authority === 'oa' ? oa : authority === 'cfe' ? cfe : slo
  }

  /* ---------------- Specific cases first, so random fill avoids them ---------------- */

  // Hard conflict: a confirmed class that a pending request overlaps.
  const hardClass = driver.submit(
    {
      organisationId: 'org-acad',
      submittedBy: emailOf('org-acad'),
      eventName: 'Public Policy Lecture',
      category: 'academic',
      description: 'Scheduled lecture for the public policy course.',
      roomId: 'ac04-301',
      date: day(5),
      startMin: 14 * 60,
      endMin: 16 * 60,
      expectedAttendance: 55,
    },
    ago(240),
  )
  driver.act(hardClass.id, { action: 'approve' }, acad, ago(238))

  // The pending request that overlaps it, already forwarded to Academic Booking.
  const hardPending = driver.submit(
    {
      organisationId: 'org-econ',
      submittedBy: emailOf('org-econ'),
      eventName: 'Guest Lecture Q&A',
      category: 'seminar',
      description: 'Question and answer session with a visiting economist.',
      roomId: 'ac04-301',
      date: day(5),
      startMin: 15 * 60,
      endMin: 17 * 60,
      expectedAttendance: 40,
    },
    ago(60),
  )
  driver.act(hardPending.id, { action: 'approve' }, slo, ago(52))

  // Partial overlap (17:00 to 18:30 against 18:00 to 20:00), both pending at SLO.
  driver.submit(
    {
      organisationId: 'org-debate',
      submittedBy: emailOf('org-debate'),
      eventName: 'Debate Practice Round',
      category: 'competition',
      description: 'Practice round ahead of the inter-college debate.',
      roomId: 'ac01-101',
      date: day(2),
      startMin: 17 * 60,
      endMin: 18 * 60 + 30,
      expectedAttendance: 30,
    },
    ago(30),
  )
  driver.submit(
    {
      organisationId: 'org-quiz',
      submittedBy: emailOf('org-quiz'),
      eventName: 'Weekly Quiz Night',
      category: 'club_event',
      description: 'The regular Quiz Club night.',
      roomId: 'ac01-101',
      date: day(2),
      startMin: 18 * 60,
      endMin: 20 * 60,
      expectedAttendance: 35,
    },
    ago(26),
  )

  // Back-to-back (18:00 to 20:00 and 20:00 to 21:00): no conflict at buffer 0.
  driver.submit(
    {
      organisationId: 'org-film',
      submittedBy: emailOf('org-film'),
      eventName: 'Short Films Screening',
      category: 'club_event',
      description: 'A screening of student short films.',
      roomId: 'ac03-202',
      date: day(3),
      startMin: 18 * 60,
      endMin: 20 * 60,
      expectedAttendance: 45,
    },
    ago(40),
  )
  driver.submit(
    {
      organisationId: 'org-photo',
      submittedBy: emailOf('org-photo'),
      eventName: 'Photo Walk Briefing',
      category: 'meeting',
      description: 'Briefing before the weekend photo walk.',
      roomId: 'ac03-202',
      date: day(3),
      startMin: 20 * 60,
      endMin: 21 * 60,
      expectedAttendance: 20,
    },
    ago(36),
  )

  // Over capacity: 55 people in a 30 seat room.
  driver.submit(
    {
      organisationId: 'org-dance',
      submittedBy: emailOf('org-dance'),
      eventName: 'Beginner Dance Workshop',
      category: 'workshop',
      description: 'An open workshop for first-time dancers.',
      roomId: 'ac04-202',
      date: day(6),
      startMin: 18 * 60,
      endMin: 20 * 60,
      expectedAttendance: 55,
    },
    ago(20),
  )

  // Changes requested.
  const jam = driver.submit(
    {
      organisationId: 'org-music',
      submittedBy: emailOf('org-music'),
      eventName: 'Open Jam Session',
      category: 'club_event',
      description: 'A relaxed jam session for all music lovers.',
      roomId: 'ac01-001',
      date: day(7),
      startMin: 19 * 60,
      endMin: 21 * 60,
      expectedAttendance: 35,
    },
    ago(70),
  )
  driver.act(
    jam.id,
    {
      action: 'request_changes',
      reason: 'Please confirm the sound equipment plan and list the guest performers.',
    },
    oa,
    ago(64),
  )

  // Short notice: tomorrow evening, submitted a few hours ago.
  driver.submit(
    {
      organisationId: 'org-econ',
      submittedBy: emailOf('org-econ'),
      eventName: 'Policy Roundtable',
      category: 'seminar',
      description: 'A short roundtable on the new education policy.',
      roomId: 'ac03-201',
      date: day(1),
      startMin: 17 * 60,
      endMin: 18 * 60 + 30,
      expectedAttendance: 40,
    },
    ago(6),
  )

  // Three rejected, with reasons.
  const rejectedSlo = driver.submit(
    {
      organisationId: 'org-quiz',
      submittedBy: emailOf('org-quiz'),
      eventName: 'Late Night Quiz',
      category: 'club_event',
      description: 'A late night quiz.',
      roomId: 'ac01-201',
      date: day(3),
      startMin: 21 * 60,
      endMin: 22 * 60 + 30,
      expectedAttendance: 60,
    },
    ago(90),
  )
  driver.act(
    rejectedSlo.id,
    { action: 'reject', reason: 'The room is held for exam preparation that evening.' },
    slo,
    ago(84),
  )
  const rejectedOa = driver.submit(
    {
      organisationId: 'org-cultural',
      submittedBy: emailOf('org-cultural'),
      eventName: 'Garba Night',
      category: 'cultural',
      description: 'An evening of Garba for the whole campus.',
      roomId: 'ac03-001',
      date: day(9),
      startMin: 18 * 60,
      endMin: 21 * 60,
      expectedAttendance: 90,
    },
    ago(100),
  )
  driver.act(
    rejectedOa.id,
    {
      action: 'reject',
      reason: 'Higher-priority academic booking in the same room.',
      alternativeRoomId: 'ac04-001',
    },
    oa,
    ago(96),
  )
  const rejectedAcad = driver.submit(
    {
      organisationId: 'org-ecell',
      submittedBy: emailOf('org-ecell'),
      eventName: 'Startup Pitch Evening',
      category: 'competition',
      description: 'Teams pitch to a panel of founders.',
      roomId: 'ac02-001',
      date: day(8),
      startMin: 17 * 60,
      endMin: 20 * 60,
      expectedAttendance: 44,
    },
    ago(120),
  )
  driver.act(rejectedAcad.id, { action: 'approve' }, cfe, ago(110))
  driver.act(
    rejectedAcad.id,
    { action: 'reject', reason: 'Expected attendance is too close to the room capacity for a panel set up.' },
    acad,
    ago(100),
  )

  // Confirmed, then cancelled.
  const cancelled = driver.submit(
    {
      organisationId: 'org-cs',
      submittedBy: emailOf('org-cs'),
      eventName: 'Hackathon Kickoff',
      category: 'competition',
      description: 'Kickoff briefing for the hackathon.',
      roomId: 'ac02-301',
      date: day(8),
      startMin: 10 * 60,
      endMin: 12 * 60,
      expectedAttendance: 40,
    },
    ago(200),
  )
  driver.act(cancelled.id, { action: 'approve' }, slo, ago(190))
  driver.act(cancelled.id, { action: 'approve' }, acad, ago(180))
  driver.act(
    cancelled.id,
    { action: 'cancel', reason: 'Cancelled at the request of the organising society.' },
    acad,
    ago(50),
  )

  /* ---------------- Academic classes confirmed by Academic Booking ---------------- */

  let classes = 0
  for (let i = 0; i < 70 && classes < 56; i++) {
    const slot = place(9 * 60, 15 * 60, [60, 90], [0, 13])
    if (!slot) continue
    const attendance = Math.max(12, Math.floor(slot.room.capacity * (0.5 + rng() * 0.4)))
    const request = driver.submit(
      {
        organisationId: 'org-acad',
        submittedBy: emailOf('org-acad'),
        eventName: pick(CLASS_NAMES),
        category: 'academic',
        description: 'Scheduled class.',
        roomId: slot.room.id,
        date: slot.date,
        startMin: slot.startMin,
        endMin: slot.endMin,
        expectedAttendance: attendance,
      },
      ago(int(120, 300)),
    )
    driver.act(request.id, { action: 'approve' }, acad, ago(int(100, 118)))
    classes += 1
  }

  /* ---------------- Evening events: confirmed, and pending at each stage ---------------- */

  const evening = (): ReturnType<typeof place> => place(17 * 60, 20 * 60, [60, 90, 120], [1, 13])

  const plan: Array<{ orgId: string; outcome: 'confirmed' | 'stage0' | 'stage1' }> = []
  for (let i = 0; i < 10; i++) plan.push({ orgId: pick(CLUB_ORG_IDS), outcome: 'confirmed' })
  for (const orgId of ['org-cs', 'org-econ', 'org-photo', 'org-cultural', 'org-music', 'org-dance', 'org-ecell', 'org-ecell']) {
    plan.push({ orgId, outcome: 'stage0' })
  }
  for (const orgId of ['org-debate', 'org-film', 'org-cultural', 'org-music', 'org-ecell', 'org-cs', 'org-quiz', 'org-dance']) {
    plan.push({ orgId, outcome: 'stage1' })
  }

  for (const item of plan) {
    const slot = evening()
    if (!slot) continue
    const idea = pick(EVENT_POOL[item.orgId] ?? EVENT_POOL['org-cs'] ?? [])
    if (!idea) continue
    const created = driver.submit(draftFor(item.orgId, idea, slot), ago(int(30, 150)))
    const approver = approverFor(item.orgId)
    if (item.outcome === 'stage0') continue
    driver.act(created.id, { action: 'approve' }, approver, ago(int(20, 28)))
    if (item.outcome === 'confirmed') {
      driver.act(created.id, { action: 'approve' }, acad, ago(int(5, 18)))
    }
  }

  /* ---------------- The demo pair, added last under fixed numbers ---------------- */

  const room201 = roomById('ac02-201')
  driver.submit(
    {
      organisationId: 'org-cs',
      submittedBy: emailOf('org-cs'),
      eventName: 'Intro to ML Workshop',
      category: 'workshop',
      description: 'A hands-on introduction to machine learning for first and second years.',
      roomId: room201.id,
      date: demoDate,
      startMin: 18 * 60,
      endMin: 20 * 60,
      expectedAttendance: 45,
    },
    ago(72),
    201,
  )
  driver.submit(
    {
      organisationId: 'org-cultural',
      submittedBy: emailOf('org-cultural'),
      eventName: 'Open Mic Night',
      category: 'cultural',
      description: 'An open mic evening for poetry, music and stand-up.',
      roomId: room201.id,
      date: demoDate,
      startMin: 18 * 60,
      endMin: 20 * 60,
      expectedAttendance: 60,
    },
    ago(24),
    202,
  )

  return {
    requests: driver.requests,
    logs: driver.logs,
    outbox: driver.outbox,
    settings,
    rooms,
    organisations,
  }
}

export const DEMO_REQUEST_A = (year: string): string => `BK-${year}-0201`
export const DEMO_REQUEST_B = (year: string): string => `BK-${year}-0202`
