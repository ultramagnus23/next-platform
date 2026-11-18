import type { FollowupResult } from '../../logic/followup'
import type { ApprovalStepRecord, BookingConfig, RequestEvent, RouteRule, StudentRequest } from '../../types'

export type ClaimResult =
  | { ok: true; request: StudentRequest; event: RequestEvent }
  | { ok: false; result: FollowupResult; request: StudentRequest | null }

/**
 * Where student requests live. The in-memory version backs the sandbox. The Strapi version replaces it
 * without touching the service.
 *
 * claimFollowup is the one method that must be a single atomic conditional write: set last_followup_at and
 * next_followup_allowed_at only WHERE the follow-up rule still holds, and return the row. Zero rows updated
 * means refuse. In Strapi that is a custom controller with one transaction, because the REST API cannot do it.
 */
export interface StudentRepository {
  getConfig(): Promise<BookingConfig>
  saveConfig(config: BookingConfig): Promise<void>
  getRouteRules(): Promise<RouteRule[]>
  saveRouteRules(rules: RouteRule[]): Promise<void>

  nextId(prefix: string): string
  insertRequest(request: StudentRequest, steps: ApprovalStepRecord[]): Promise<void>
  getRequest(id: string): Promise<StudentRequest | null>
  listRequests(organisationId?: string): Promise<StudentRequest[]>
  getSteps(requestId: string): Promise<ApprovalStepRecord[]>
  /** Writes only if the stored version equals request.version minus one. Returns false when stale. */
  updateRequest(request: StudentRequest, steps?: ApprovalStepRecord[]): Promise<boolean>

  /** Append only. Returns false, and writes nothing, when an event with the same key exists. */
  appendEvent(event: RequestEvent): Promise<boolean>
  listEvents(requestId: string): Promise<RequestEvent[]>

  claimFollowup(requestId: string, now: Date, actor: string): Promise<ClaimResult>
}
