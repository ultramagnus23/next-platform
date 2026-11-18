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

/* ------------------------------------------------------------------ */
/* Stored records (M2)                                                 */
/* ------------------------------------------------------------------ */

export interface StudentRequest {
  id: string
  organisationId: string
  organisationName: string
  submittedBy: string
  eventName: string
  description: string
  category: CategoryId
  venueId: string
  venueLabel: string
  /** IST date, YYYY-MM-DD. */
  date: string
  startMin: number
  endMin: number
  attendance: number
  needsAv: boolean
  guestSpeaker: boolean
  status: StoredStatus
  submittedAt: string | null
  lastApproverActivityAt: string | null
  lastFollowupAt: string | null
  /** Mirror of the window end, kept in step by the repository. The rule itself is in logic/followup.ts. */
  nextFollowupAllowedAt: string | null
  followupCount: number
  urgencyFollowupUsed: boolean
  /** Set when the first email goes out (M3). Every later email threads under it. */
  rootMessageId: string | null
  /** The mirrored request in the admin portal, or null when the space is not bridged. */
  adminRequestId: string | null
  /** The rejected request this one resubmits, if any. */
  previousRequestId: string | null
  /** The office's reason when rejected, shown in full to the student. */
  decisionReason: string | null
  routeConfirmed: boolean
  routeVersion: number
  /** Bumped on every write. A stale write is refused. */
  version: number
  createdAt: string
  updatedAt: string
}

export interface ApprovalStepRecord {
  id: string
  requestId: string
  position: number
  role: string
  why: string
  confirmed: boolean
  state: StepState
  decidedAt: string | null
  decidedBy: string | null
  reason: string | null
}

export type EventType =
  | 'created'
  | 'submitted'
  | 'step_approved'
  | 'step_rejected'
  | 'comment'
  | 'followup_sent'
  | 'cancelled'
  | 'resubmitted'
  | 'reminder_due'
  | 'escalated'
  | 'admin_flagged'

/** Append only. Nothing edits or deletes a row. */
export interface RequestEvent {
  id: string
  requestId: string
  type: EventType
  at: string
  actor: string
  detail: string
  /** Set on scheduler events so a rerun never writes the same event twice. */
  key: string | null
}

export interface StudentVenue {
  id: string
  label: string
  /** Null where no source gives a capacity. */
  capacity: number | null
}

export interface StudentActor {
  organisationId: string
  organisationName: string
  email: string
}

export type Failure = { ok: false; code: 400 | 403 | 404 | 409; error: string; reason?: string; unlockAt?: string | null }
export type Result<T> = { ok: true; data: T } | Failure

export interface RequestDetail {
  request: StudentRequest
  status: import('./logic/status').DerivedStatus
  steps: ApprovalStepRecord[]
  events: RequestEvent[]
  followup: import('./logic/followup').FollowupResult
}

export interface RequestListRow {
  request: StudentRequest
  status: import('./logic/status').DerivedStatus
  currentRole: string | null
}

export interface NewRequestInput {
  eventName: string
  description: string
  category: CategoryId
  venueId: string
  date: string
  startMin: number
  endMin: number
  attendance: number
  needsAv: boolean
  guestSpeaker: boolean
}

export type DecisionInput =
  | { decision: 'approve'; by: string; offline?: boolean }
  | { decision: 'reject'; by: string; reason: string; offline?: boolean }
  | { decision: 'comment'; by: string; reason: string }

/* ------------------------------------------------------------------ */
/* Email (M3)                                                          */
/* ------------------------------------------------------------------ */

export type EmailTemplate = 'submitted' | 'forwarded' | 'approved' | 'not_approved' | 'followup' | 'cancelled' | 'reminder' | 'escalation' | 'admin_flag'

export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'suppressed' | 'dead'

export interface OutboxRow {
  id: string
  requestId: string
  template: EmailTemplate
  /** Position within (request, template, recipient). Part of the unique key. */
  sequence: number
  to: string
  cc: string[]
  subject: string
  text: string
  messageId: string
  inReplyTo: string | null
  references: string[]
  /** Passed to the provider so a retry never sends twice. */
  idempotencyKey: string
  status: OutboxStatus
  attempts: number
  nextAttemptAt: string
  /** A claimed row is invisible to other workers until this time. */
  lockedUntil: string | null
  lastError: string | null
  providerId: string | null
  createdAt: string
  sentAt: string | null
}

export interface Suppression {
  email: string
  reason: 'bounce' | 'complaint' | 'manual'
  at: string
}

export interface ApprovalToken {
  jti: string
  requestId: string
  stepId: string
  role: string
  expiresAt: string
  usedAt: string | null
}

export type TokenProblem = 'invalid' | 'expired' | 'used' | 'wrong_stage'

export interface ApprovalSummary {
  request: StudentRequest
  role: string
  expiresAt: string
  /** Offices still to come after this one, so the approver sees the whole path. */
  remainingRoles: string[]
}

export interface DirectoryEntry {
  mailbox: string
  /** The person who normally handles it. Optional. */
  assignee?: { email: string; leave?: { from: string; to: string } }
  /** Covers the assignee while on leave. */
  delegate?: string
  backup?: string
}
