import type { FollowupResult } from '../../logic/followup'
import type { ApprovalStepRecord, ApprovalToken, BookingConfig, OutboxRow, RequestEvent, RouteRule, StudentRequest, Suppression } from '../../types'

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

  /**
   * Outbox. enqueueOutbox enforces a unique key on (request, template, recipient, sequence) and returns
   * false, writing nothing, when it already exists. claimDueOutbox is the SELECT ... FOR UPDATE SKIP LOCKED:
   * it hands each due row to exactly one worker and hides it until the lease runs out.
   */
  enqueueOutbox(row: OutboxRow): Promise<boolean>
  hasOutbox(requestId: string, template: string, to: string, sequence: number): Promise<boolean>
  claimDueOutbox(now: Date, limit: number, leaseMs: number): Promise<OutboxRow[]>
  markOutboxSent(id: string, providerId: string | null, now: Date): Promise<void>
  /** Counts the attempt, backs off, and marks the row dead after maxAttempts. */
  markOutboxFailed(id: string, error: string, now: Date, maxAttempts: number): Promise<OutboxRow | null>
  markOutboxSuppressed(id: string): Promise<void>
  listOutbox(requestId?: string): Promise<OutboxRow[]>

  addSuppression(suppression: Suppression): Promise<void>
  isSuppressed(email: string): Promise<boolean>

  insertToken(token: ApprovalToken): Promise<void>
  getToken(jti: string): Promise<ApprovalToken | null>
  /** Marks the token used only if it exists, is unused and has not expired. True for exactly one caller. */
  consumeToken(jti: string, now: Date): Promise<boolean>
}
