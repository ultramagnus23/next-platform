/**
 * Shared types for the booking admin portal.
 * Pages, routes, engines and the repository all import from here.
 */

export type AuthorityId = 'slo' | 'oa' | 'cfe' | 'acad'

export interface Authority {
  id: AuthorityId
  label: string
  shortLabel: string
  /** Where "new request" notifications go. */
  inboxEmails: string[]
  /** Who can act for this authority. */
  memberEmails: string[]
  isFinal: boolean
}

export type CategoryId =
  | 'academic'
  | 'workshop'
  | 'seminar'
  | 'competition'
  | 'cultural'
  | 'club_event'
  | 'meeting'
  | 'other'

export interface EventCategory {
  id: CategoryId
  label: string
  /** 1 = highest priority. Configurable and reorderable. */
  tier: number
  description: string
}

export interface Room {
  id: string
  building: string
  floor: string
  name: string
  capacity: number
  features: string[]
  openFromMin: number
  openUntilMin: number
}

export interface Organisation {
  id: string
  name: string
  authorityId: AuthorityId
  contactEmail: string
}

export type RequestStatus =
  | 'pending'
  | 'changes_requested'
  | 'confirmed'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled'
  | 'displaced'

export interface BookingRequest {
  id: string
  organisationId: string
  submittedBy: string
  eventName: string
  category: CategoryId
  description: string
  roomId: string
  /** 'YYYY-MM-DD', campus local time (IST). */
  date: string
  /** Minutes since midnight. Intervals are half-open. */
  startMin: number
  endMin: number
  expectedAttendance: number
  status: RequestStatus
  /** Snapshot of the approval chain taken at submission. */
  stages: AuthorityId[]
  stageIndex: number
  escalated: boolean
  /** Id of the auto-approval rule that acted on this request. */
  autoApprovedBy: string | null
  /** ISO. Simulated AMS sync time. */
  amsSyncedAt: string | null
  /** Optimistic concurrency counter. */
  version: number
  createdAt: string
  updatedAt: string
}

export type LogAction =
  | 'submitted'
  | 'forwarded'
  | 'escalated'
  | 'confirmed'
  | 'rejected'
  | 'changes_requested'
  | 'resubmitted'
  | 'withdrawn'
  | 'cancelled'
  | 'displaced'
  | 'override_confirmed'
  | 'auto_approved'
  | 'remark'

export type LogActorAuthority = AuthorityId | 'superadmin' | 'system' | 'organisation'

export interface ApprovalLog {
  id: string
  requestId: string
  at: string
  actorEmail: string
  actorAuthority: LogActorAuthority
  action: LogAction
  fromStatus: RequestStatus | null
  toStatus: RequestStatus
  stageLabel: string | null
  reason: string | null
  /** True for remarks. Never emailed. */
  internal: boolean
}

export type NotificationTrigger =
  | 'request_submitted'
  | 'request_forwarded'
  | 'request_approved_final'
  | 'request_rejected'
  | 'changes_requested'
  | 'conflict_detected'
  | 'booking_displaced'
  | 'booking_modified'
  | 'auto_approved'

export interface OutboxEmail {
  id: string
  at: string
  trigger: NotificationTrigger
  requestId: string
  to: string[]
  cc: string[]
  subject: string
  text: string
  status: 'simulated' | 'queued' | 'sent' | 'failed'
}

export type EmailDraft = Omit<OutboxEmail, 'id' | 'at' | 'status'>

export interface WorkflowTemplate {
  id: string
  name: string
  match: { authorityId?: AuthorityId; categories?: CategoryId[] }
  /** Must end with a final authority. */
  stages: AuthorityId[]
}

export interface AutoApprovalRule {
  id: string
  name: string
  enabled: boolean
  conditions: {
    categories?: CategoryId[]
    startAtOrAfterMin?: number
    endAtOrBeforeMin?: number
    maxAttendance?: number
    buildings?: string[]
    minLeadTimeHours?: number
    maxPerOrgPerWeek?: number
  }
  effect: 'confirm' | 'skip_to_final_stage'
}

export interface BookingSettings {
  categories: EventCategory[]
  authorities: Authority[]
  workflows: WorkflowTemplate[]
  autoApproval: AutoApprovalRule[]
  changeoverBufferMin: number
}

/* ------------------------------------------------------------------ */
/* Actors and actions                                                  */
/* ------------------------------------------------------------------ */

export type PersonaId =
  | 'slo_approver'
  | 'oa_approver'
  | 'cfe_approver'
  | 'acad_approver'
  | 'super_admin'

export interface Actor {
  email: string
  authorities: AuthorityId[]
  isSuperAdmin: boolean
  /** ACAD member or super admin. */
  canOverride: boolean
  /** Super admin only. */
  canEditSettings: boolean
  demoPersona: PersonaId | null
}

export type ActionId =
  | 'approve'
  | 'escalate'
  | 'reject'
  | 'request_changes'
  | 'resubmit'
  | 'override_confirm'
  | 'cancel'
  | 'remark'

export interface SlotChange {
  roomId?: string
  date?: string
  startMin?: number
  endMin?: number
}

export interface ActionInput {
  action: ActionId
  /** Required for every action except `remark`. */
  version?: number
  /** Reason, or the remark text. */
  reason?: string
  alternativeRoomId?: string | null
  /** Only for `resubmit`. */
  changes?: SlotChange
}

export interface ActionAvailability {
  action: ActionId
  label: string
  /** False means the control is not shown at all. */
  visible: boolean
  enabled: boolean
  disabledReason: string | null
}

export interface EngineContext {
  settings: BookingSettings
  rooms: Room[]
  organisations: Organisation[]
  /** Every request, including the one being changed. */
  requests: BookingRequest[]
  newId: (kind: 'request' | 'log' | 'email') => string
}

export interface TransitionError {
  error: string
  code: 400 | 403 | 409
  /** Present on a 409 caused by confirmed bookings. */
  blocking?: BookingRequest[]
}

export interface TransitionSuccess {
  request: BookingRequest
  /** Other requests changed by the same transition (displaced bookings). */
  others: BookingRequest[]
  logs: ApprovalLog[]
  emails: OutboxEmail[]
}

export type TransitionResult = TransitionSuccess | TransitionError

export interface TransitionOptions {
  /** Set by the conflict resolve flow. Lets the final authority decide any member. */
  resolveGroup?: boolean
}

/** What a new request looks like before the system fills in the rest. */
export interface RequestDraft {
  organisationId: string
  submittedBy: string
  eventName: string
  category: CategoryId
  description: string
  roomId: string
  date: string
  startMin: number
  endMin: number
  expectedAttendance: number
}

export interface SubmitSuccess {
  request: BookingRequest
  logs: ApprovalLog[]
  emails: OutboxEmail[]
}

/* ------------------------------------------------------------------ */
/* Derived data                                                        */
/* ------------------------------------------------------------------ */

export interface ConflictItem {
  kind: 'competing_request' | 'confirmed_booking'
  request: BookingRequest
}

export interface ConflictGroup {
  id: string
  roomId: string
  date: string
  startMin: number
  endMin: number
  /** Start and end of the part where two or more members overlap. */
  overlapStartMin: number
  overlapEndMin: number
  members: BookingRequest[]
  hasConfirmed: boolean
  /** True when at least one member is pending. */
  isOpen: boolean
}

export interface PriorityRank {
  requestId: string
  rank: number
  tier: number
  reasons: string[]
}

export type WarningCode = 'over_capacity' | 'outside_room_hours' | 'short_notice'

export interface RequestWarning {
  code: WarningCode
  message: string
}

export interface TimelineBlock {
  requestId: string
  eventName: string
  organisationId: string
  status: RequestStatus
  startMin: number
  endMin: number
  inConflict: boolean
}

export interface FreeRoomQuery {
  date: string
  startMin: number
  endMin: number
  minCapacity: number
  preferBuilding?: string
  excludeRoomId?: string
  excludeRequestId?: string
}

export type Visibility = 'full' | 'summary' | 'none'

/* ------------------------------------------------------------------ */
/* Service-level shapes                                                */
/* ------------------------------------------------------------------ */

export type RequestTab = 'needs_action' | 'others' | 'confirmed' | 'closed' | 'all'

export interface RequestFilters {
  tab: RequestTab
  dateFrom?: string
  dateTo?: string
  organisationId?: string
  building?: string
  roomId?: string
  category?: CategoryId
  status?: RequestStatus
  stage?: AuthorityId
  conflictsOnly?: boolean
}

export interface RequestRow {
  request: BookingRequest
  organisationName: string
  authorityId: AuthorityId
  roomLabel: string
  building: string
  categoryLabel: string
  tier: number
  stageLabel: string
  conflictCount: number
  needsMyAction: boolean
}

export interface RequestDetail {
  request: BookingRequest
  visibility: Visibility
  organisation: Organisation
  room: Room
  categoryLabel: string
  logs: ApprovalLog[]
  conflicts: ConflictItem[]
  groupId: string | null
  ranks: PriorityRank[]
  warnings: RequestWarning[]
  alternatives: Room[]
  schedule: TimelineBlock[]
  actions: ActionAvailability[]
  /** Reference data the detail page needs to name things. */
  lookups: {
    organisations: Organisation[]
    authorities: Authority[]
    categories: EventCategory[]
    rooms: Room[]
  }
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 400 | 403 | 404 | 409; error: string; blocking?: BookingRequest[] }

export interface ResolveMemberDecision {
  id: string
  action: 'reject' | 'request_changes'
  reason: string
  alternativeRoomId?: string | null
}

export interface ResolveInput {
  winnerId: string
  versions: Record<string, number>
  others: ResolveMemberDecision[]
}

export interface ResolveOutcome {
  requests: BookingRequest[]
  logs: ApprovalLog[]
  emails: OutboxEmail[]
}

export interface OrganisationStats {
  organisation: Organisation
  requests: number
  confirmed: number
  rejected: number
  cancellations: number
  displaced: number
  autoApproved: number
  mostUsedRoomId: string | null
  lastRequestAt: string | null
}

/* ------------------------------------------------------------------ */
/* Conflict views                                                      */
/* ------------------------------------------------------------------ */

export interface OrganisationRecord {
  requests: number
  confirmed: number
  rejected: number
  cancelled: number
}

export interface ConflictMemberView {
  request: BookingRequest
  organisation: Organisation
  categoryLabel: string
  rank: PriorityRank
  stageLabel: string
  record: OrganisationRecord
  /** Alternative rooms free at this member's time with enough seats. */
  alternatives: Room[]
  visibility: Visibility
  actions: ActionAvailability[]
}

export interface ConflictGroupView {
  group: ConflictGroup
  room: Room
  members: ConflictMemberView[]
  /** Top ranked pending member. Advice only. */
  suggestedWinnerId: string | null
  canResolve: boolean
}

export interface ActionOutcome {
  request: BookingRequest
  logs: ApprovalLog[]
  emails: OutboxEmail[]
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

export type CalendarView = 'day' | 'week' | 'month'

export interface CalendarFilters {
  view: CalendarView
  date: string
  building?: string
  floor?: string
  roomId?: string
  organisationId?: string
  category?: CategoryId
  status?: RequestStatus
}

export interface CalendarItem {
  id: string
  eventName: string
  organisationName: string
  roomId: string
  date: string
  startMin: number
  endMin: number
  status: RequestStatus
  inConflict: boolean
  /** False when the viewer may not open the request page. */
  canOpen: boolean
}

export interface CalendarData {
  rooms: Room[]
  items: CalendarItem[]
  rangeFrom: string
  rangeTo: string
  /** Dates in range that hold an open conflict. */
  conflictDates: string[]
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export interface ActivityItem {
  id: string
  text: string
  at: string
  requestId: string
  internal: boolean
}

export interface RoomUsageItem {
  roomLabel: string
  eventName: string
  startMin: number
  endMin: number
  requestId: string
}

export interface OverviewData {
  today: string
  needsAction: number
  openConflicts: number
  confirmedNext7Days: number
  rejectedLast30Days: number
  needsActionRows: RequestRow[]
  conflictGroups: ConflictGroupView[]
  inUseNow: RoomUsageItem[]
  nextUp: RoomUsageItem[]
  utilisationPercent: number
  activity: ActivityItem[]
}
