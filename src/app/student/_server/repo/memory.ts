import { DEFAULT_CONFIG, ROUTE_RULES } from '../../data'
import { followupEligibility } from '../../logic/followup'
import type { ApprovalStepRecord, BookingConfig, RequestEvent, RouteRule, StudentRequest } from '../../types'
import { addDays, istDateOf, eventInstant } from '../../utils'
import type { ClaimResult, StudentRepository } from './repository'

export function clockOf(r: StudentRequest) {
  return {
    status: r.status,
    submittedAt: r.submittedAt,
    lastApproverActivityAt: r.lastApproverActivityAt,
    lastFollowupAt: r.lastFollowupAt,
    urgencyFollowupUsed: r.urgencyFollowupUsed,
    eventStartAt: eventInstant(r.date, r.startMin).toISOString(),
  }
}

/** In-memory store for the sandbox. Single process only, and gone on restart. */
export class MemoryStudentRepository implements StudentRepository {
  private config: BookingConfig = { ...DEFAULT_CONFIG }
  private rules: RouteRule[] = ROUTE_RULES.map((r) => ({ ...r }))
  private requests = new Map<string, StudentRequest>()
  private steps = new Map<string, ApprovalStepRecord[]>()
  private events: RequestEvent[] = []
  private eventKeys = new Set<string>()
  private counters = new Map<string, number>()

  async getConfig() {
    return { ...this.config }
  }
  async saveConfig(config: BookingConfig) {
    this.config = { ...config }
  }
  async getRouteRules() {
    return this.rules.map((r) => ({ ...r }))
  }
  async saveRouteRules(rules: RouteRule[]) {
    this.rules = rules.map((r) => ({ ...r }))
  }

  nextId(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1
    this.counters.set(prefix, n)
    return `${prefix}-${n}`
  }

  async insertRequest(request: StudentRequest, steps: ApprovalStepRecord[]) {
    this.requests.set(request.id, { ...request })
    this.steps.set(request.id, steps.map((s) => ({ ...s })))
  }

  async getRequest(id: string) {
    const r = this.requests.get(id)
    return r ? { ...r } : null
  }

  async listRequests(organisationId?: string) {
    return [...this.requests.values()].filter((r) => !organisationId || r.organisationId === organisationId).map((r) => ({ ...r }))
  }

  async getSteps(requestId: string) {
    return (this.steps.get(requestId) ?? []).map((s) => ({ ...s }))
  }

  async updateRequest(request: StudentRequest, steps?: ApprovalStepRecord[]) {
    const current = this.requests.get(request.id)
    if (!current || current.version !== request.version - 1) return false
    this.requests.set(request.id, { ...request })
    if (steps) this.steps.set(request.id, steps.map((s) => ({ ...s })))
    return true
  }

  async appendEvent(event: RequestEvent) {
    return this.pushEvent(event)
  }

  private pushEvent(event: RequestEvent): boolean {
    if (event.key !== null) {
      if (this.eventKeys.has(event.key)) return false
      this.eventKeys.add(event.key)
    }
    this.events.push({ ...event })
    return true
  }

  async listEvents(requestId: string) {
    return this.events.filter((e) => e.requestId === requestId).map((e) => ({ ...e }))
  }

  /**
   * One atomic conditional update. There is no await between the read, the rule check and the write, so no
   * other call can run in between. The rule is checked against the stored row, never against the caller.
   */
  async claimFollowup(requestId: string, now: Date, actor: string): Promise<ClaimResult> {
    const row = this.requests.get(requestId)
    if (!row) {
      return { ok: false, request: null, result: { eligible: false, reason: 'not_pending', unlockAt: null, urgencyOverride: false } }
    }
    const today = istDateOf(now)
    const sentToday = this.events.filter(
      (e) => e.type === 'followup_sent' && istDateOf(new Date(e.at)) === today && this.requests.get(e.requestId)?.organisationId === row.organisationId,
    ).length
    const result = followupEligibility(clockOf(row), this.config, now, sentToday)
    if (!result.eligible) return { ok: false, request: { ...row }, result }

    const at = now.toISOString()
    const updated: StudentRequest = {
      ...row,
      lastFollowupAt: at,
      nextFollowupAllowedAt: addDays(now, this.config.followupWaitDays).toISOString(),
      followupCount: row.followupCount + 1,
      urgencyFollowupUsed: row.urgencyFollowupUsed || result.urgencyOverride,
      version: row.version + 1,
      updatedAt: at,
    }
    this.requests.set(requestId, updated)
    const event: RequestEvent = {
      id: this.nextId('ev'),
      requestId,
      type: 'followup_sent',
      at,
      actor,
      detail: result.urgencyOverride ? 'Reminder sent early because the event is close' : 'Reminder sent',
      key: null,
    }
    this.pushEvent(event)
    return { ok: true, request: { ...updated }, event }
  }
}
