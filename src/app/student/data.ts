import type { BookingConfig, RouteRule } from './types'

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
