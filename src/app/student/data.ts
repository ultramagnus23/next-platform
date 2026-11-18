import type { BookingConfig, DirectoryEntry, RouteRule, StudentVenue } from './types'

/** Defaults to agree with the offices. Change them here or in the admin config table, never in logic. */
export const DEFAULT_CONFIG: BookingConfig = {
  followupWaitDays: 7,
  approverReminderDay: 2,
  escalationDay: 5,
  adminFlagDay: 14,
  urgencyDays: 7,
  orgDailyFollowupCap: null,
}

/** Shown when no rule covers a request. */
export const UNCONFIRMED_ROUTE_TEXT = 'Route unconfirmed, email SLO'
export const FALLBACK_ROLE = 'Student Life Office'
export const DIRECTOR_ROLE = 'Director, Student Life Office'

/** IT and AV support hours from the policy documents, in minutes after midnight IST. */
export const AV_HOURS = { fromMin: 8 * 60, toMin: 20 * 60 }

export const CRITICAL_VENUES = ['dr-reddys-auditorium', 'takshila', 'multi-purpose-hall']

/**
 * Route table, version 1. Every row comes from public documents and still needs each office to confirm it.
 * Notice is null wherever no source gives a number. The guest speaker stage is a SAMPLE to show the preview
 * changing, not an Ashoka policy.
 */
export const ROUTE_RULES: RouteRule[] = [
  {
    id: 'critical-spaces',
    version: 1,
    venueIds: CRITICAL_VENUES,
    category: null,
    stages: [
      { role: 'Student Life Office', why: 'Critical spaces are booked through SLO' },
      { role: 'Additional review', why: 'Critical spaces need a second review' },
    ],
    noticeDays: null,
    confirmed: false,
    maxBookingDaysPerSemester: null,
    guestSpeakerStage: { role: 'Security office', why: 'Sample rule: outside guests may need a security check' },
  },
  {
    id: 'academic-society',
    version: 1,
    venueIds: [],
    category: 'academic_society',
    stages: [{ role: 'Office of Academic Affairs', why: 'Academic society events go through OAA' }],
    noticeDays: 10,
    confirmed: true,
    maxBookingDaysPerSemester: null,
    guestSpeakerStage: null,
  },
  {
    id: 'black-box',
    version: 1,
    venueIds: ['black-box-theatre'],
    category: null,
    stages: [{ role: 'Performing Arts department manager', why: 'The department owns the Black Box Theatre' }],
    noticeDays: null,
    confirmed: false,
    maxBookingDaysPerSemester: 6,
    guestSpeakerStage: null,
  },
  {
    id: 'owned-by-department',
    version: 1,
    venueIds: ['dance-studio', 'residence-hall', 'sports-block'],
    category: null,
    stages: [{ role: 'Owning department', why: 'The department that owns the space decides, by email today' }],
    noticeDays: null,
    confirmed: false,
    maxBookingDaysPerSemester: null,
    guestSpeakerStage: null,
  },
]

/**
 * Venues the student form offers. Only the three critical-space capacities come from public documents.
 * Everything else is null and shown as "to confirm with the office". Where the Multi-Purpose Hall sits is
 * also unconfirmed, so no building is listed.
 */
export const STUDENT_VENUES: StudentVenue[] = [
  { id: 'dr-reddys-auditorium', label: "Dr. Reddy's Auditorium", capacity: 500 },
  { id: 'takshila', label: 'AC 02 LH 011 Takshila', capacity: 200 },
  { id: 'multi-purpose-hall', label: 'Multi-Purpose Hall', capacity: 400 },
  { id: 'black-box-theatre', label: 'Black Box Theatre', capacity: null },
  { id: 'dance-studio', label: 'Dance Studio', capacity: null },
  { id: 'residence-hall', label: 'Residence Hall', capacity: null },
  { id: 'sports-block', label: 'Sports Block', capacity: null },
]

/** Where each role's mail goes. Sample addresses on a reserved test domain. Admin editable later. */
export const ADMIN_MAILBOX = 'booking-admin@example.test'

export const ROLE_DIRECTORY: Record<string, DirectoryEntry> = {
  'Student Life Office': { mailbox: 'slo@example.test', backup: 'slo-backup@example.test' },
  'Additional review': { mailbox: 'review@example.test', backup: 'review-backup@example.test' },
  'Office of Academic Affairs': { mailbox: 'oaa@example.test', backup: 'oaa-backup@example.test' },
  'Performing Arts department manager': { mailbox: 'performing-arts@example.test' },
  'Owning department': { mailbox: 'slo@example.test' },
  'Security office': { mailbox: 'security@example.test' },
  'Director, Student Life Office': { mailbox: 'slo-director@example.test' },
  // The offices as the admin portal names them, used for requests that go through it.
  OA: { mailbox: 'oa@example.test', backup: 'oa-backup@example.test' },
  CFE: { mailbox: 'cfe@example.test', backup: 'cfe-backup@example.test' },
  'Academic Booking': { mailbox: 'acad@example.test', backup: 'acad-backup@example.test' },
}
