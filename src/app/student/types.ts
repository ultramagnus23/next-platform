/** Stored states. "Taking longer than usual" is never stored, see logic/status.ts. */
export type StoredStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export type ShownStatus = 'draft' | 'pending' | 'taking_longer' | 'approved' | 'not_approved' | 'cancelled'

export type StatusTone = 'slate' | 'amber' | 'green' | 'red' | 'muted'

export type StatusIcon = 'pencil' | 'hourglass' | 'clock' | 'check' | 'x' | 'ban'

export type StepState = 'not_started' | 'current' | 'approved' | 'rejected'

export interface ApprovalStep {
  role: string
  state: StepState
}

/** Every number the rules depend on. Lives in data, never as a literal in logic. */
export interface BookingConfig {
  followupWaitDays: number
  approverReminderDay: number
  escalationDay: number
  adminFlagDay: number
  urgencyDays: number
  /** Follow-ups one club may send per day. Null until the offices agree a number. */
  orgDailyFollowupCap: number | null
}

/** The fields the status and follow-up rules read. All times are ISO instants. */
export interface RequestClock {
  status: StoredStatus
  submittedAt: string | null
  lastApproverActivityAt: string | null
  lastFollowupAt: string | null
  /** True once the one early follow-up for an event under urgencyDays away was used. */
  urgencyFollowupUsed: boolean
  eventStartAt: string
}

export type CategoryId = 'academic_society' | 'extracurricular' | 'performing_arts' | 'other'

export interface RouteStage {
  role: string
  why: string
}

/** One row of the route table. Versioned and admin editable. Unknown values are null, never guessed. */
export interface RouteRule {
  id: string
  version: number
  /** Venue ids this rule covers, or empty when it covers a category instead. */
  venueIds: string[]
  category: CategoryId | null
  stages: RouteStage[]
  /** Days of notice the office needs. Null means not confirmed. */
  noticeDays: number | null
  /** False for sample or unconfirmed rows. The UI says "to confirm with the office". */
  confirmed: boolean
  maxBookingDaysPerSemester: number | null
  /** Extra stage when the event has an outside guest. Sample, unconfirmed. */
  guestSpeakerStage: RouteStage | null
}

export interface PathInput {
  venueId: string
  category: CategoryId
  eventStartAt: string
  eventEndAt: string
  needsAv: boolean
  guestSpeaker: boolean
  /** Booking days this club already used at this venue this semester, if known. */
  semesterDaysUsed?: number
}

export type PathFlag = 'route_unconfirmed' | 'late_needs_director' | 'av_outside_hours' | 'semester_cap_reached' | 'notice_unconfirmed'

export interface PathStage {
  role: string
  why: string
  confirmed: boolean
}

export interface ApprovalPath {
  stages: PathStage[]
  noticeDays: number | null
  /** Latest instant to submit, or null when the notice is not confirmed. */
  latestSubmitAt: string | null
  tooLate: boolean
  /** First IST date (YYYY-MM-DD) that still meets the notice, or null. */
  nextBestDate: string | null
  routeConfirmed: boolean
  flags: PathFlag[]
}
