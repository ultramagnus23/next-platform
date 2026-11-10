/**
 * Shared types for the booking admin portal (v2).
 * Pages, routes, engines and the repository all import from here.
 */

export type OfficeId = 'slo' | 'oa' | 'cfe' | 'acad'

export interface Office {
  id: OfficeId
  label: string
  shortLabel: string
  /** Where "new request" and overdue notices go. */
  inboxEmails: string[]
  memberEmails: string[]
  /** True only for Academic Booking. */
  isFinal: boolean
  responseTargetHours: number
}

export type CategoryId =
  | 'academic'
  | 'seminar'
  | 'workshop'
  | 'competition'
  | 'club_event'
  | 'cultural'
  | 'meeting'
  | 'other'

export interface EventCategory {
  id: CategoryId
  label: string
  /** 1 is highest priority. Advice only. */
  tier: number
  description: string
}

export interface Room {
  id: string
  building: string
  /** Empty for outdoor venues and anything without a floor number. */
  floor: string
  name: string
  /** Venue category from the campus inventory, such as 'Classroom – Large'. */
  category: string
  capacity: number
  features: string[]
  openFromMin: number
  openUntilMin: number
  bookableByClubs: boolean
}

export type OrgKind = 'club' | 'society' | 'ministry' | 'department' | 'office' | 'other'

/** Mocked semester record. Real tracking needs check-in, which is out of scope. */
export interface OrgRecord {
  bookings: number
  used: number
  noShows: number
  lateCancels: number
}

export interface Organisation {
  id: string
  name: string
  kind: OrgKind
  officeId: OfficeId
  contactEmail: string
  /** Null means no cap. */
  weeklyCap: number | null
  record: OrgRecord
}

/** One class in the academic timetable. The floor everything else sits on. */
export interface TimetableBlock {
  id: string
  roomId: string
  courseCode: string
  title: string
  date: string
  startMin: number
  endMin: number
}

export type RequestStatus =
  | 'pending'
  | 'changes_requested'
  | 'offered'
  | 'confirmed'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled'
  | 'displaced'
  | 'expired'

/** What a status does to a room. Availability reads this, never the label. */
export type RoomEffect = 'competes' | 'held' | 'booked' | 'none'

export interface RoomOffer {
  roomId: string
  offeredBy: OfficeId | 'superadmin'
  offeredAt: string
  holdUntil: string
  /** The step the request resumes at once the offer is accepted. */
  stageIndexOnAccept: number
}

export interface SlotSnapshot {
  roomId: string
  date: string
  startMin: number
  endMin: number
  expectedAttendance: number
}

export interface BookingRequest {
  id: string
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
  needs: string[]
  status: RequestStatus
  source: 'request' | 'direct'
  stages: OfficeId[]
  stageIndex: number
  stageEnteredAt: string
  offer: RoomOffer | null
  escalated: boolean
  autoApprovedBy: string | null
  amsSyncedAt: string | null
  /** Set when a change after approval reopened the request. */
  previous: SlotSnapshot | null
  /** Step for which an overdue email was already sent. */
  overdueNotified: number | null
  version: number
  createdAt: string
  updatedAt: string
}

export type LogAction =
  | 'submitted'
  | 'auto_checked'
  | 'forwarded'
  | 'escalated'
  | 'confirmed'
  | 'offered'
  | 'offer_accepted'
  | 'offer_lapsed'
  | 'rejected'
  | 'changes_requested'
  | 'resubmitted'
  | 'reopened'
  | 'withdrawn'
  | 'cancelled'
  | 'displaced'
  | 'override_confirmed'
  | 'auto_approved'
  | 'expired'
  | 'undone'
  | 'note'
  | 'direct_booked'

export type LogRole = OfficeId | 'superadmin' | 'system' | 'organisation'

export interface ApprovalLog {
  id: string
  requestId: string
  at: string
  actorEmail: string
  actorRole: LogRole
  action: LogAction
  fromStatus: RequestStatus | null
  toStatus: RequestStatus
  stageLabel: string | null
  reason: string | null
  internal: boolean
  batchId: string | null
}

export type NotificationTrigger =
  | 'request_submitted'
  | 'request_forwarded'
  | 'request_confirmed'
  | 'request_rejected'
  | 'changes_requested'
  | 'room_offered'
  | 'offer_lapsed'
  | 'clash_detected'
  | 'booking_displaced'
  | 'request_expired'
  | 'auto_approved'
  | 'step_overdue'

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
  /** Set when the email was cancelled, for example by an undo. */
  failReason: string | null
  batchId: string | null
}

export type EmailDraft = Omit<OutboxEmail, 'id' | 'at' | 'status' | 'failReason' | 'batchId'>

export interface WorkflowTemplate {
  id: string
  name: string
  match: { officeId?: OfficeId; categories?: CategoryId[] }
  /** Must end with a final office. */
  stages: OfficeId[]
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
    minNoticeHours?: number
    maxPerOrgPerWeek?: number
  }
  effect: 'confirm' | 'skip_to_final_stage'
}

export interface BookingSettings {
  categories: EventCategory[]
  offices: Office[]
  workflows: WorkflowTemplate[]
  autoApproval: AutoApprovalRule[]
  changeoverBufferMin: number
  minNoticeHours: number
  offerHoldHours: number
  undoSeconds: number
  defaultWeeklyCap: number
}

/* ------------------------------------------------------------------ */
/* Actors and actions                                                  */
/* ------------------------------------------------------------------ */

export type PersonaId = 'slo_approver' | 'oa_approver' | 'cfe_approver' | 'acad_approver' | 'super_admin'

export interface Actor {
  email: string
  offices: OfficeId[]
  /** The office this person is acting for right now. */
  actingFor: OfficeId
  isSuperAdmin: boolean
  /** Academic Booking member or super admin. */
  canOverride: boolean
  /** Super admin only. */
  canEditRules: boolean
  demoPersona: PersonaId | null
}

export type ActionId =
  | 'approve'
  | 'offer_room'
  | 'accept_offer'
  | 'escalate'
  | 'request_changes'
  | 'reject'
  | 'resubmit'
  | 'override_confirm'
  | 'cancel'
  | 'note'

export interface SlotChange {
  roomId?: string
  date?: string
  startMin?: number
  endMin?: number
  expectedAttendance?: number
}

export interface ActionInput {
  action: ActionId
  /** Required for every action except `note`. */
  version?: number
  /** Reason, or the note text. */
  reason?: string
  /** Target room for `offer_room`. */
  roomId?: string
  /** Only for `resubmit`. */
  changes?: SlotChange
}

export interface ActionAvailability {
  action: ActionId
  label: string
  visible: boolean
  enabled: boolean
  disabledReason: string | null
}

export type BlockerKind = 'class' | 'booked' | 'held'

export interface Blocker {
  kind: BlockerKind
  label: string
  requestId: string | null
  startMin: number
  endMin: number
}

export interface TransitionError {
  error: string
  code: 400 | 403 | 409
  blockers?: Blocker[]
}

export interface TransitionSuccess {
  /** Every request the transition changed, the target first. */
  requests: BookingRequest[]
  logs: ApprovalLog[]
  emails: OutboxEmail[]
}

export type TransitionResult = TransitionSuccess | TransitionError

export interface TransitionOptions {
  /** Set by the clash resolve flow. Lets the final office decide any member. */
  resolveGroup?: boolean
}

export interface EngineContext {
  settings: BookingSettings
  rooms: Room[]
  organisations: Organisation[]
  timetable: readonly TimetableBlock[]
  /** Every request, including the one being changed. */
  requests: BookingRequest[]
  newId: (kind: 'request' | 'log' | 'email') => string
}

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
  needs?: string[]
}

export interface SubmitSuccess {
  request: BookingRequest
  logs: ApprovalLog[]
  emails: OutboxEmail[]
}

/* ------------------------------------------------------------------ */
/* Derived data                                                        */
/* ------------------------------------------------------------------ */

export type ItemEffect = 'competes' | 'held' | 'booked'

/** Anything that occupies a room for a time: a request, a hold or a class. */
export interface OccupancyItem {
  kind: 'request' | 'class'
  id: string
  roomId: string
  date: string
  startMin: number
  endMin: number
  effect: ItemEffect
  request: BookingRequest | null
  block: TimetableBlock | null
}

export interface ClashGroup {
  id: string
  roomId: string
  date: string
  startMin: number
  endMin: number
  /** Competing requests, soonest submitted first. */
  members: BookingRequest[]
  /** Booked requests, held offers and classes in the same overlap. */
  blockedBy: OccupancyItem[]
}

export interface ClashItem {
  kind: 'competing_request' | 'booked' | 'held' | 'class'
  item: OccupancyItem
}

export type FlagKind =
  | 'over_capacity'
  | 'short_notice'
  | 'outside_hours'
  | 'over_weekly_cap'
  | 'room_not_for_clubs'
  | 'poor_record'
  | 'reopened'
  | 'overdue'

export interface Flag {
  kind: FlagKind
  /** Short chip text, such as "20 more people than seats". */
  title: string
  /** One sentence that cites the rule. */
  body: string
}

export type Lane = 'clash' | 'look' | 'clear'

export interface PriorityRank {
  requestId: string
  rank: number
  tier: number
  reasons: string[]
}

export interface FreeRoomQuery {
  date: string
  startMin: number
  endMin: number
  minSeats: number
  needs?: string[]
  building?: string
  floor?: string
  /** True when the booker is a club, so classes-only rooms are left out. */
  forClubs?: boolean
  excludeRoomId?: string
  excludeRequestId?: string
}

export interface FreeRoom {
  room: Room
  /** Other requests waiting for this room at this time. */
  competing: number
}

export type TimelineKind = 'class' | 'booked' | 'competes' | 'held'

export interface TimelineBlock {
  id: string
  kind: TimelineKind
  label: string
  startMin: number
  endMin: number
  /** Set for requests. Classes have none. */
  requestId: string | null
  inClash: boolean
}

export interface OrgStanding {
  organisationId: string
  weekBookings: number
  weeklyCap: number | null
  semester: OrgRecord
  confirmed: number
  rejected: number
  cancellations: number
  displaced: number
  autoApproved: number
  mostUsedRoomId: string | null
  lastRequestAt: string | null
}

/* ------------------------------------------------------------------ */
/* Service-level shapes                                                */
/* ------------------------------------------------------------------ */

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 400 | 403 | 404 | 409; error: string; blockers?: Blocker[] }

export interface InboxFilters {
  lane?: Lane
  q?: string
  office?: OfficeId
  building?: string
  category?: CategoryId
  organisationId?: string
  page?: number
}

export interface InboxRow {
  request: BookingRequest
  organisationName: string
  kind: OrgKind
  categoryLabel: string
  tier: number
  roomLabel: string
  lane: Lane
  flags: Flag[]
  overdueDays: number
  /** Short chip text for the list: Clash, Over capacity, Waiting 3 days. */
  chip: string
}

export interface InboxData {
  rows: InboxRow[]
  counts: Record<Lane, number>
  /** Requests the actor already passed on, still waiting elsewhere. */
  elsewhere: number
  page: number
  pageSize: number
  total: number
  summary: string
}

export interface RequestDetail {
  request: BookingRequest
  organisation: Organisation
  standing: OrgStanding
  room: Room
  categoryLabel: string
  tier: number
  lane: Lane
  flags: Flag[]
  clashes: ClashItem[]
  groupId: string | null
  ranks: PriorityRank[]
  roomDay: TimelineBlock[]
  alternatives: FreeRoom[]
  actions: ActionAvailability[]
  logs: ApprovalLog[]
  offices: Office[]
  /** Organisation name for every request that appears in a clash, by request id. */
  clashOrgs: Record<string, string>
  visibility: 'full' | 'summary'
}

export interface BatchSnapshot {
  id: string
  actorEmail: string
  at: string
  kind: 'single' | 'bulk_approve' | 'resolve'
  before: BookingRequest[]
  /** Version of each request right after the batch, to spot later changes. */
  afterVersions: Record<string, number>
  undone: boolean
}

export interface ResolveDecision {
  id: string
  action: 'offer_room' | 'reject' | 'request_changes'
  reason: string
  roomId?: string
}

export interface ResolveInput {
  winnerId: string
  versions: Record<string, number>
  others: ResolveDecision[]
}

export interface MutationOutcome {
  requests: BookingRequest[]
  logs: ApprovalLog[]
  emails: OutboxEmail[]
  batchId: string
}

export interface BulkResult {
  approved: string[]
  skipped: Array<{ id: string; why: string }>
  batchId: string | null
}

export interface RoomDayRow {
  room: Room
  blocks: TimelineBlock[]
  freeInWindow: boolean
  competingInWindow: number
}

export interface RoomsDayData {
  date: string
  rows: RoomDayRow[]
  total: number
  freeCount: number
  clashCount: number
}

export interface RoomsDayQuery {
  date: string
  from?: number
  to?: number
  minSeats?: number
  needs?: string[]
  building?: string
  freeOnly?: boolean
}

/* ------------------------------------------------------------------ */
/* Clash views                                                         */
/* ------------------------------------------------------------------ */

export interface ClashMemberView {
  request: BookingRequest
  organisation: Organisation
  standing: OrgStanding
  categoryLabel: string
  tier: number
  rank: PriorityRank
  flags: Flag[]
  /** Free rooms that seat this member's crowd at the same time. */
  alternatives: FreeRoom[]
  visibility: 'full' | 'summary'
  actions: ActionAvailability[]
}

export interface ClashGroupView {
  group: ClashGroup
  room: Room
  members: ClashMemberView[]
  blockers: Blocker[]
  /** Top ranked member. Advice only. */
  suggestedWinnerId: string | null
  canResolve: boolean
  /** Hours since the oldest member was submitted. */
  openHours: number
  offices: Office[]
}

export interface OrgRow {
  organisation: Organisation
  standing: OrgStanding
  mostUsedRoom: string
}

export interface ClockState {
  now: string
  offsetDays: number
}

/* ------------------------------------------------------------------ */
/* Week, month and agenda                                              */
/* ------------------------------------------------------------------ */

export interface MonthDay {
  date: string
  confirmed: number
  waiting: number
  clashes: number
}

export interface AgendaFilters {
  q?: string
  category?: CategoryId
  building?: string
  status?: RequestStatus
  days?: number
}

export interface AgendaRow {
  request: BookingRequest
  organisationName: string
  roomLabel: string
  categoryLabel: string
}
