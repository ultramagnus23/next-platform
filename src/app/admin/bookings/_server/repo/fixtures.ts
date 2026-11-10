import type { Actor, AuthorityId, BookingSettings, OrgColour, Organisation, PersonaId, Room } from '../../types'

/**
 * Placeholder reference data. Every name and email here is invented for the
 * demo. Replace with the official lists (see PRD section 13).
 */

const DOMAIN = 'example.ashoka.edu.in'

export function buildSettings(): BookingSettings {
  return {
    categories: [
      { id: 'academic', label: 'Academic', tier: 1, description: 'Classes, labs and examinations.' },
      { id: 'seminar', label: 'Seminar', tier: 2, description: 'Talks and lectures open to many students.' },
      { id: 'workshop', label: 'Workshop', tier: 2, description: 'Hands-on sessions that teach a skill.' },
      { id: 'competition', label: 'Competition', tier: 3, description: 'Contests, debates and tournaments.' },
      { id: 'club_event', label: 'Club event', tier: 4, description: 'Regular club activities and socials.' },
      { id: 'cultural', label: 'Cultural', tier: 5, description: 'Performances, festivals and open mics.' },
      { id: 'meeting', label: 'Meeting', tier: 6, description: 'Planning and committee meetings.' },
      { id: 'other', label: 'Other', tier: 7, description: 'Anything that fits no other category.' },
    ],
    authorities: [
      {
        id: 'slo',
        label: 'Student Life Office (SLO)',
        shortLabel: 'SLO',
        inboxEmails: [`slo.inbox@${DOMAIN}`],
        memberEmails: [`slo.approver@${DOMAIN}`],
        isFinal: false,
      },
      {
        id: 'oa',
        label: 'OA',
        shortLabel: 'OA',
        inboxEmails: [`oa.inbox@${DOMAIN}`],
        memberEmails: [`oa.approver@${DOMAIN}`],
        isFinal: false,
      },
      {
        id: 'cfe',
        label: 'Centre for Entrepreneurship (CFE)',
        shortLabel: 'CFE',
        inboxEmails: [`cfe.inbox@${DOMAIN}`],
        memberEmails: [`cfe.approver@${DOMAIN}`],
        isFinal: false,
      },
      {
        id: 'acad',
        label: 'Academic Booking',
        shortLabel: 'Academic Booking',
        inboxEmails: [`acad.inbox@${DOMAIN}`],
        memberEmails: [`acad.approver@${DOMAIN}`],
        isFinal: true,
      },
    ],
    workflows: [
      {
        id: 'wf-cfe-workshops',
        name: 'CFE workshops',
        match: { authorityId: 'cfe', categories: ['workshop'] },
        stages: ['cfe', 'acad'],
      },
    ],
    autoApproval: [
      {
        id: 'rule-late-meetings',
        name: 'Late meetings in free rooms',
        enabled: false,
        conditions: {
          categories: ['meeting'],
          startAtOrAfterMin: 21 * 60,
          maxAttendance: 30,
          maxPerOrgPerWeek: 2,
        },
        effect: 'confirm',
      },
    ],
    changeoverBufferMin: 0,
  }
}

interface RoomSpec {
  floor: 'Ground' | 'First' | 'Second'
  name: string
  capacity: number
  features: string[]
}

const ROOM_PLAN: Record<string, RoomSpec[]> = {
  'AC-01': [
    { floor: 'Ground', name: '001', capacity: 40, features: ['Projector', 'Whiteboard'] },
    { floor: 'Ground', name: '002', capacity: 30, features: ['Whiteboard'] },
    { floor: 'First', name: '101', capacity: 50, features: ['Projector', 'Whiteboard'] },
    { floor: 'First', name: '102', capacity: 30, features: ['Whiteboard'] },
    { floor: 'Second', name: '201', capacity: 120, features: ['Projector', 'Mic', 'Stage'] },
    { floor: 'Second', name: '202', capacity: 35, features: ['Projector'] },
  ],
  'AC-02': [
    { floor: 'Ground', name: '001', capacity: 45, features: ['Projector', 'Whiteboard'] },
    { floor: 'Ground', name: '002', capacity: 25, features: ['Whiteboard'] },
    { floor: 'First', name: '201', capacity: 60, features: ['Projector', 'Mic', 'Whiteboard'] },
    { floor: 'First', name: '202', capacity: 40, features: ['Projector'] },
    { floor: 'Second', name: '301', capacity: 50, features: ['Projector', 'Whiteboard'] },
    { floor: 'Second', name: '302', capacity: 30, features: ['Whiteboard'] },
  ],
  'AC-03': [
    { floor: 'Ground', name: '001', capacity: 100, features: ['Projector', 'Mic', 'Stage'] },
    { floor: 'Ground', name: '002', capacity: 35, features: ['Projector'] },
    { floor: 'First', name: '201', capacity: 80, features: ['Projector', 'Mic'] },
    { floor: 'First', name: '202', capacity: 60, features: ['Projector', 'Whiteboard'] },
    { floor: 'Second', name: '301', capacity: 70, features: ['Projector', 'Mic'] },
    { floor: 'Second', name: '302', capacity: 28, features: ['Whiteboard'] },
  ],
  'AC-04': [
    { floor: 'Ground', name: '001', capacity: 120, features: ['Projector', 'Mic', 'Stage'] },
    { floor: 'Ground', name: '002', capacity: 50, features: ['Projector', 'Whiteboard'] },
    { floor: 'First', name: '201', capacity: 45, features: ['Projector'] },
    { floor: 'First', name: '202', capacity: 30, features: ['Whiteboard'] },
    { floor: 'Second', name: '301', capacity: 65, features: ['Projector', 'Whiteboard'] },
    { floor: 'Second', name: '302', capacity: 40, features: ['Projector'] },
  ],
}

export function buildRooms(): Room[] {
  const rooms: Room[] = []
  for (const [building, specs] of Object.entries(ROOM_PLAN)) {
    for (const spec of specs) {
      rooms.push({
        id: `${building.toLowerCase().replace('-', '')}-${spec.name}`,
        building,
        floor: spec.floor,
        name: spec.name,
        capacity: spec.capacity,
        features: spec.features,
        openFromMin: 8 * 60,
        openUntilMin: 23 * 60,
      })
    }
  }
  return rooms
}

function org(id: string, name: string, code: string, colour: OrgColour, authorityId: AuthorityId, handle: string): Organisation {
  return { id, name, code, colour, authorityId, contactEmail: `${handle}@${DOMAIN}` }
}

export function buildOrganisations(): Organisation[] {
  return [
    org('org-cs', 'CS Society', 'CSS', 'indigo', 'slo', 'cs.society'),
    org('org-cultural', 'Cultural Society', 'CUL', 'fuchsia', 'oa', 'cultural.society'),
    org('org-econ', 'Economics Society', 'ECO', 'emerald', 'slo', 'econ.society'),
    org('org-debate', 'Debating Society', 'DEB', 'orange', 'slo', 'debating.society'),
    org('org-ecell', 'Entrepreneurship Cell', 'ECL', 'amber', 'cfe', 'ecell'),
    org('org-music', 'Music Club', 'MUS', 'violet', 'oa', 'music.club'),
    org('org-dance', 'Dance Society', 'DAN', 'rose', 'oa', 'dance.society'),
    org('org-quiz', 'Quiz Club', 'QUZ', 'teal', 'slo', 'quiz.club'),
    org('org-photo', 'Photography Club', 'PHO', 'sky', 'slo', 'photography.club'),
    org('org-film', 'Film Club', 'FLM', 'lime', 'slo', 'film.club'),
    org('org-acad', 'Academic Office', 'ACA', 'slate', 'acad', 'academic.office'),
  ]
}

const PERSONA_AUTHORITY: Record<Exclude<PersonaId, 'super_admin'>, AuthorityId> = {
  slo_approver: 'slo',
  oa_approver: 'oa',
  cfe_approver: 'cfe',
  acad_approver: 'acad',
}

const ALL_AUTHORITIES: AuthorityId[] = ['slo', 'oa', 'cfe', 'acad']

/** An actor for a demo persona. Never reads the session. */
export function actorForPersona(persona: PersonaId, email: string): Actor {
  if (persona === 'super_admin') {
    return {
      email,
      authorities: [...ALL_AUTHORITIES],
      isSuperAdmin: true,
      canOverride: true,
      canEditSettings: true,
      demoPersona: persona,
    }
  }
  const authority = PERSONA_AUTHORITY[persona]
  return {
    email,
    authorities: [authority],
    isSuperAdmin: false,
    canOverride: authority === 'acad',
    canEditSettings: false,
    demoPersona: persona,
  }
}

export function seedActor(authority: AuthorityId): Actor {
  return {
    email: `${authority}.approver@${DOMAIN}`,
    authorities: [authority],
    isSuperAdmin: false,
    canOverride: authority === 'acad',
    canEditSettings: false,
    demoPersona: null,
  }
}

export function seedSuperAdmin(): Actor {
  return {
    email: `super.admin@${DOMAIN}`,
    authorities: [...ALL_AUTHORITIES],
    isSuperAdmin: true,
    canOverride: true,
    canEditSettings: true,
    demoPersona: null,
  }
}
