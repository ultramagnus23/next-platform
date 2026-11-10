import type {
  Actor,
  BookingSettings,
  OfficeId,
  Organisation,
  OrgKind,
  PersonaId,
  Room,
  TimetableBlock,
} from '../../types'
import { addDays, weekdayOf } from '../../utils'

/**
 * Placeholder reference data. Every name, room and email is invented for the
 * demo. Replace with the official lists (PRD section 14).
 */

const DOMAIN = 'example.ashoka.edu.in'

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildSettings(): BookingSettings {
  return {
    categories: [
      { id: 'academic', label: 'Academic', tier: 1, description: 'Classes, labs and examinations.' },
      { id: 'seminar', label: 'Seminar', tier: 2, description: 'Talks and lectures open to many students.' },
      { id: 'workshop', label: 'Workshop', tier: 2, description: 'Hands-on sessions that teach a skill.' },
      { id: 'competition', label: 'Competition', tier: 3, description: 'Contests, debates and tournaments.' },
      { id: 'club_event', label: 'Club event', tier: 4, description: 'Regular club activities and socials.' },
      { id: 'cultural', label: 'Cultural event', tier: 5, description: 'Performances, festivals and open mics.' },
      { id: 'meeting', label: 'Meeting', tier: 6, description: 'Planning and committee meetings.' },
      { id: 'other', label: 'Other', tier: 7, description: 'Anything that fits no other category.' },
    ],
    offices: [
      { id: 'slo', label: 'Student Life Office', shortLabel: 'Student Life Office', inboxEmails: [`slo.inbox@${DOMAIN}`], memberEmails: [`slo.approver@${DOMAIN}`], isFinal: false, responseTargetHours: 48 },
      { id: 'oa', label: 'OA (name to confirm)', shortLabel: 'OA', inboxEmails: [`oa.inbox@${DOMAIN}`], memberEmails: [`oa.approver@${DOMAIN}`], isFinal: false, responseTargetHours: 48 },
      { id: 'cfe', label: 'Centre for Entrepreneurship', shortLabel: 'CFE', inboxEmails: [`cfe.inbox@${DOMAIN}`], memberEmails: [`cfe.approver@${DOMAIN}`], isFinal: false, responseTargetHours: 48 },
      { id: 'acad', label: 'Academic Booking', shortLabel: 'Academic Booking', inboxEmails: [`acad.inbox@${DOMAIN}`], memberEmails: [`acad.approver@${DOMAIN}`], isFinal: true, responseTargetHours: 48 },
    ],
    workflows: [
      { id: 'wf-cfe-workshops', name: 'CFE workshops', match: { officeId: 'cfe', categories: ['workshop'] }, stages: ['cfe', 'acad'] },
    ],
    autoApproval: [
      {
        id: 'rule-late-meetings',
        name: 'Late meetings in free rooms',
        enabled: false,
        conditions: { categories: ['meeting'], startAtOrAfterMin: 21 * 60, maxAttendance: 30, maxPerOrgPerWeek: 2 },
        effect: 'confirm',
      },
    ],
    changeoverBufferMin: 0,
    minNoticeHours: 48,
    offerHoldHours: 24,
    undoSeconds: 10,
    defaultWeeklyCap: 6,
  }
}

/* ---------------- Rooms: the real campus venue list ---------------- */

type Venue = [name: string, capacity: number]

/** Building, category, then venues. Source: the campus venue inventory supplied by the Ministry. */
const VENUES: Array<[building: string, category: string, venues: Venue[]]> = [
  ['Admin Block', 'Outdoor Area', [['Admin Lawn', 100]]],
  ['Admin Block', 'Dance Room', [['Admin-CB-504 (Dance Studio)', 50]]],
  ['Admin Block', 'Classroom – Medium', [['Admin-LR-305', 50]]],
  ['Admin Block', 'Meeting Room – Medium', [['Admin-MR-002 (Atrium)', 8]]],
  ['Admin Block', 'Meeting Room – Large', [['Admin-MR-202 (HDFC Board Room)', 12]]],
  ['Admin Block', 'Laboratory', [['Computer Lab 1-304', 30]]],
  ['Admin Block', 'Multi Purpose Hall', [['MPH', 200]]],

  ['AC-01', 'Classroom – Small', [['LR-101', 25], ['LR-102', 25], ['LR-201', 25], ['LR-202', 25], ['LR-203', 25], ['LR-204', 25]]],
  ['AC-01', 'Classroom – Medium', [['LR-103', 50], ['LR-104', 50], ['LR-105', 50], ['LR-205', 50], ['LR-206', 50]]],
  ['AC-01', 'Classroom – Large', [['LR-106', 100], ['LR-207', 100]]],
  ['AC-01', 'Auditorium', [['Dr. Reddy’s Auditorium', 408]]],
  ['AC-01', 'Amphitheatre', [['Mini Amphitheatre', 200]]],

  ['Dining Block', 'Meeting Room – Medium', [['Meeting Room 2 (Student Commons)', 10], ['Meeting Room 3 (Student Commons)', 10], ['Meeting Room 4 (Student Commons)', 10], ['Meeting Room 5 (Student Commons)', 10]]],
  ['Dining Block', 'Outdoor Area', [['Mess Lawn', 100]]],
  ['Dining Block', 'Study / Activity Area', [['Students’ Commons', 200]]],

  ['AC-02', 'Laboratory', [['Lab 105', 50], ['Lab 109', 25], ['Computer Lab 216', 60]]],
  ['AC-02', 'Classroom – Small', [['LR-001', 25], ['LR-002', 25], ['LR-004', 25], ['LR-005', 25], ['LR-008', 25], ['LR-009', 25], ['LR-011', 25], ['LR-012', 25], ['LR-014', 25], ['LR-015', 25], ['LR-101', 25], ['LR-102', 25], ['LR-104', 25], ['LR-112', 25], ['LR-113', 25], ['LR-114', 25], ['LR-204', 25], ['LR-205', 25], ['LR-213', 25], ['LR-214', 25]]],
  ['AC-02', 'Classroom – Medium', [['LR-003', 50], ['LR-013', 50], ['LR-103', 50], ['LR-203', 50], ['LR-210', 50]]],
  ['AC-02', 'Classroom – Large', [['LR-007', 200], ['LR-107', 100], ['LR-108', 100], ['LR-206-207', 100], ['LR-208-209', 100]]],
  ['AC-02', 'Meeting Room – Medium', [['MR (330-331)', 10], ['MR-006', 10], ['MR-010', 10]]],

  ['Sports Block', 'Indoor Sports', [['Basketball-Badminton Courts', 200], ['Games Room', 200], ['Gymnasium', 200], ['MPH Sports', 500], ['Shooting Range', 200], ['Squash Courts', 200], ['Table Tennis Room', 200], ['Yoga Studio', 200]]],
  ['Sports Block', 'Dance Room', [['Dance Studio Sports', 200]]],
  ['Sports Block', 'Outdoor Sports', [['Swimming Pool', 200]]],
  ['Sports Block', 'Academic / Creative', [['Visual Art Studio', 25]]],

  ['Outfield', 'Outdoor Sports', [['Basketball Court 1', 25], ['Basketball Court 2', 25], ['Cricket Field', 100], ['Football Field', 25], ['Tennis Court', 100]]],
  ['Outfield', 'Outdoor Area', [['Lawns', 200]]],
  ['Open Amphitheatre', 'Amphitheatre', [['Open Amphitheatre', 200]]],

  ['AC-03', 'Laboratory', [['Lab-102', 50], ['Lab-103', 50], ['Lab-104', 50], ['Lab-105', 50], ['Lab-106', 50], ['Lab-107', 50], ['Lab-201', 50], ['Lab-202', 50], ['Lab-203', 50], ['Lab-204', 50], ['Lab-205', 50], ['Lab-206', 50], ['Lab-207', 50], ['Lab-208', 50]]],
  ['AC-03', 'Classroom – Large', [['LR-003', 100], ['LR-005', 100]]],
  ['AC-03', 'Meeting Room – Medium', [['Meeting Room 317', 10]]],

  ['AC-04', 'Co-curricular Area', [['Dance Studio', 25]]],
  ['AC-04', 'Meeting Room – Small', [['533 (MR)', 6], ['534 (MR)', 4], ['535 (MR)', 4], ['737 (MR)', 5], ['837 (MR)', 4]]],
  ['AC-04', 'Meeting Room – Medium', [['634 (MR)', 10], ['635 (MR)', 10], ['735 (MR)', 10], ['736 (MR)', 10], ['835 (MR)', 10]]],
  ['AC-04', 'Meeting Room – Large', [['536 (MR)', 12], ['537 (MR)', 12], ['633 (MR)', 12], ['836 (MR)', 12]]],
  ['AC-04', 'Classroom – Small', [['LR-001', 25], ['LR-002', 25], ['LR-003', 25], ['LR-006', 25], ['LR-007', 25], ['LR-305', 25], ['LR-306', 25], ['LR-307', 25], ['LR-308', 25], ['LR-311', 25], ['LR-312', 25], ['LR-402', 25], ['LR-403', 25], ['LR-404', 25], ['LR-405', 25], ['LR-406', 25], ['LR-407', 25], ['LR-408', 25], ['LR-409', 25], ['LR-410', 25], ['LR-411', 25]]],
  ['AC-04', 'Classroom – Medium', [['LR-004', 50], ['LR-008', 50], ['LR-009', 50], ['LR-302', 50], ['LR-303', 50], ['LR-309', 50], ['LR-310', 50], ['LR-401', 50]]],
  ['AC-04', 'Classroom – Large', [['LR-005', 100], ['LR-301', 100], ['LR-304', 100]]],
  ['AC-04', 'Multi Purpose Area', [['BlackBox', 100]]],
  ['AC-04', 'Exhibition Area', [['Pre Function Area (Outside Blackbox)', 30]]],

  ['AC-05', 'Classroom – Medium', [['Lab 007', 38]]],
  ['AC-05', 'Classroom – Large', [['Ramachandra Hall', 100]]],
  ['AC-06', 'Classroom – Large', [['CFE Classroom', 100]]],
]

const FLOOR_NAMES = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']

/** First digit of a room number is its floor: LR-001 is Ground, LR-205 is Second. Venues with no number have no floor. */
function floorOf(name: string): string {
  const m = /(?:LR|Lab|MR|Room|Admin-LR|Admin-MR|Admin-CB|\()[-\s]?0?(\d)\d\d/.exec(name) ?? /(\d)\d\d\b/.exec(name)
  if (!m || !m[1]) return ''
  return FLOOR_NAMES[Number(m[1])] ?? ''
}

export function roomIdFor(building: string, name: string): string {
  return `${building}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function featuresFor(category: string, capacity: number): string[] {
  if (category === 'Laboratory') return ['Lab', 'Projector']
  if (category === 'Auditorium' || category === 'Multi Purpose Hall' || category === 'Multi Purpose Area') return ['Projector', 'Mic', 'Stage']
  if (category.startsWith('Classroom')) return capacity >= 100 ? ['Projector', 'Whiteboard', 'Mic'] : ['Projector', 'Whiteboard']
  if (category.startsWith('Meeting Room')) return ['Whiteboard', 'Screen']
  if (category === 'Amphitheatre') return ['Mic', 'Stage']
  return []
}

export function buildRooms(): Room[] {
  const rooms: Room[] = []
  for (const [building, category, venues] of VENUES) {
    for (const [name, capacity] of venues) {
      rooms.push({
        id: roomIdFor(building, name),
        building,
        floor: floorOf(name),
        name,
        category,
        capacity,
        features: featuresFor(category, capacity),
        openFromMin: 8 * 60,
        openUntilMin: 23 * 60,
        // Laboratories are for classes. Everything else can host a club event.
        bookableByClubs: category !== 'Laboratory',
      })
    }
  }
  return rooms
}

/** True for rooms that run timetabled classes. */
export function hasClasses(room: Room): boolean {
  return room.category.startsWith('Classroom') || room.category === 'Laboratory'
}

/* ---------------- Organisations (90) ---------------- */

const SLO_CLUBS = [
  'CS Society', 'Economics Society', 'Debating Society', 'Quiz Club', 'Model UN Society', 'Astronomy Club', 'Mountaineering Club',
  'Photography Club', 'Film Club', 'Psychology Society', 'Writing Club', 'Poetry Circle', 'Chess Club', 'Robotics Club', 'Data Science Club',
  'Finance Club', 'Law Society', 'History Society', 'Philosophy Society', 'Political Science Association', 'Sociology Society',
  'Environmental Society', 'Wildlife Club', 'Cycling Club', 'Running Club', 'Yoga Club', 'Fitness Collective', 'Badminton Club', 'Football Club',
  'Cricket Club', 'Basketball Club', 'Volleyball Club', 'Table Tennis Club', 'Squash Club', 'Swimming Club', 'Anime Club', 'Gaming Society',
  'Board Games Club', 'Cooking Club', 'Gardening Club', 'Volunteering Cell', 'Rotaract Club', 'Mental Health Collective', 'Women in STEM',
  'Mathematics Society', 'Physics Society', 'Chemistry Society', 'Biology Society', 'Linguistics Society', 'Literature Society',
  'Journalism Club', 'Radio Club', 'Design Club', 'Architecture Club', 'Public Policy Forum', 'Ethics Forum', 'Sustainability Cell',
  'Language Exchange', 'Trivia League', 'Open Source Club',
]
const OA_CLUBS = [
  'Cultural Society', 'Music Club', 'Dance Society', 'Theatre Society', 'Fine Arts Society', 'Western Music Society',
  'Classical Dance Society', 'Fashion Society', 'Stand-up Comedy Club', 'Folk Arts Society',
]
const CFE_CLUBS = ['Entrepreneurship Cell', 'Startup Studio', 'Venture Club', 'Product Club', 'Angel Network']
const OTHERS: Array<[string, OrgKind]> = [
  ['Dept of Economics', 'department'], ['Dept of Computer Science', 'department'], ['Dept of Psychology', 'department'],
  ['Dept of History', 'department'], ['Dept of Physics', 'department'], ['Dept of Biology', 'department'],
  ['Ministry of Technology', 'ministry'], ['Student Government', 'ministry'], ['Ministry of Culture', 'ministry'],
  ['Office of Student Life', 'office'], ['Admissions Office', 'office'], ['Career Development Office', 'office'],
  ['Alumni Office', 'office'], ['Library', 'office'], ['Dean’s Office', 'office'],
]

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function orgIdFor(name: string): string {
  return `org-${slug(name)}`
}

function org(name: string, kind: OrgKind, officeId: OfficeId, rng: () => number): Organisation {
  const club = kind === 'club' || kind === 'society'
  const bookings = 6 + Math.floor(rng() * 14)
  const noShows = club && rng() > 0.93 ? 2 + Math.floor(rng() * 2) : club && rng() > 0.8 ? 1 : 0
  return {
    id: orgIdFor(name),
    name,
    kind,
    officeId,
    contactEmail: `${slug(name)}@${DOMAIN}`,
    weeklyCap: club ? 6 : null,
    record: { bookings, used: bookings - noShows, noShows, lateCancels: rng() > 0.85 ? 1 : 0 },
  }
}

export function buildOrganisations(): Organisation[] {
  const rng = mulberry32(4242)
  const kindFor = (name: string): OrgKind => (/Society|Association|Forum/.test(name) ? 'society' : 'club')
  const orgs: Organisation[] = []
  for (const n of SLO_CLUBS) orgs.push(org(n, kindFor(n), 'slo', rng))
  for (const n of OA_CLUBS) orgs.push(org(n, kindFor(n), 'oa', rng))
  for (const n of CFE_CLUBS) orgs.push(org(n, kindFor(n), 'cfe', rng))
  for (const [n, k] of OTHERS) orgs.push(org(n, k, 'acad', rng))
  // The demo's problem club: two no-shows.
  const trek = orgs.find((o) => o.name === 'Mountaineering Club')
  if (trek) trek.record = { bookings: 8, used: 6, noShows: 2, lateCancels: 0 }
  return orgs
}

/* ---------------- Timetable (two weeks of classes) ---------------- */

const SLOTS: Array<[number, number]> = [
  [9 * 60, 10 * 60 + 15],
  [10 * 60 + 30, 11 * 60 + 45],
  [12 * 60 + 30, 13 * 60 + 45],
  [14 * 60 + 15, 15 * 60 + 30],
  [15 * 60 + 45, 17 * 60],
]
const COURSES = ['ECO', 'CS', 'PSY', 'HIS', 'PHY', 'BIO', 'MAT', 'SOC', 'POL', 'ENG', 'PHI', 'CHE']
const TITLES = ['Introduction', 'Methods', 'Seminar', 'Lab practice', 'Theory', 'Tutorial', 'Readings', 'Workshop', 'Foundations']

/** About 60% of rooms have 2 to 4 weekday classes, repeated each week for two weeks. */
export function buildTimetable(today: string, rooms: Room[]): TimetableBlock[] {
  const rng = mulberry32(31337)
  const blocks: TimetableBlock[] = []
  let n = 0
  for (const room of rooms) {
    if (!hasClasses(room) || rng() > 0.6) continue
    for (let weekday = 1; weekday <= 5; weekday++) {
      const taken = SLOTS.filter(() => rng() > 0.55).slice(0, 4)
      if (taken.length < 2) continue
      const code = `${COURSES[Math.floor(rng() * COURSES.length)]}-${100 + Math.floor(rng() * 4) * 100 + Math.floor(rng() * 9)}`
      const title = TITLES[Math.floor(rng() * TITLES.length)] ?? 'Class'
      for (let d = 0; d < 14; d++) {
        const date = addDays(today, d)
        if (weekdayOf(date) !== weekday) continue
        for (const [startMin, endMin] of taken) {
          n += 1
          blocks.push({ id: `tt-${n}`, roomId: room.id, courseCode: code, title, date, startMin, endMin })
        }
      }
    }
  }
  return blocks
}

/* ---------------- Actors ---------------- */

const PERSONA_OFFICE: Record<Exclude<PersonaId, 'super_admin'>, OfficeId> = {
  slo_approver: 'slo',
  oa_approver: 'oa',
  cfe_approver: 'cfe',
  acad_approver: 'acad',
}
const ALL_OFFICES: OfficeId[] = ['slo', 'oa', 'cfe', 'acad']

/** An actor for a demo persona. Never reads the session. */
export function actorForPersona(persona: PersonaId, email: string): Actor {
  if (persona === 'super_admin') {
    return { email, offices: [...ALL_OFFICES], actingFor: 'acad', isSuperAdmin: true, canOverride: true, canEditRules: true, demoPersona: persona }
  }
  const office = PERSONA_OFFICE[persona]
  return { email, offices: [office], actingFor: office, isSuperAdmin: false, canOverride: office === 'acad', canEditRules: false, demoPersona: persona }
}

export function seedActor(office: OfficeId): Actor {
  return { email: `${office}.approver@${DOMAIN}`, offices: [office], actingFor: office, isSuperAdmin: false, canOverride: office === 'acad', canEditRules: false, demoPersona: null }
}

export function seedSuperAdmin(): Actor {
  return { email: `super.admin@${DOMAIN}`, offices: [...ALL_OFFICES], actingFor: 'acad', isSuperAdmin: true, canOverride: true, canEditRules: true, demoPersona: null }
}
