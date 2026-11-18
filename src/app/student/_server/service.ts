import { KeyedMutex } from '@/app/admin/bookings/_server/lock'
import { STUDENT_VENUES } from '../data'
import { approvalPath } from '../logic/approval-path'
import { followupEligibility } from '../logic/followup'
import { deriveStatus, overallFromSteps } from '../logic/status'
import type {
  ApprovalStepRecord,
  DecisionInput,
  NewRequestInput,
  RequestDetail,
  RequestEvent,
  RequestListRow,
  Result,
  StudentActor,
  StoredStatus,
  StudentRequest,
} from '../types'
import { addDays, eventInstant, latestOf, MS_PER_DAY } from '../utils'
import { clockOf } from './repo/memory'
import type { StudentRepository } from './repo/repository'

const fail = (code: 400 | 403 | 404 | 409, error: string, extra: { reason?: string; unlockAt?: string | null } = {}) => ({ ok: false as const, code, error, ...extra })

/**
 * Student side rules on top of a repository. Every method takes the clock from now(), so tests and the demo
 * can move time. Approver actions here stand in for the admin portal until M5 joins the two.
 */
export class StudentService {
  private offsetDays = 0
  private mutex = new KeyedMutex()

  constructor(private readonly repo: StudentRepository) {}

  now(): Date {
    return new Date(Date.now() + this.offsetDays * MS_PER_DAY)
  }

  advanceDays(days: number): { now: string; offsetDays: number } {
    this.offsetDays += days
    return { now: this.now().toISOString(), offsetDays: this.offsetDays }
  }

  private async log(requestId: string, type: RequestEvent['type'], actor: string, detail: string, key: string | null = null): Promise<void> {
    await this.repo.appendEvent({ id: this.repo.nextId('ev'), requestId, type, at: this.now().toISOString(), actor, detail, key })
  }

  /** The path preview the form shows, using the stored rules. */
  async previewPath(input: Pick<NewRequestInput, 'venueId' | 'category' | 'date' | 'startMin' | 'endMin' | 'needsAv' | 'guestSpeaker'>) {
    return approvalPath(
      {
        venueId: input.venueId,
        category: input.category,
        eventStartAt: eventInstant(input.date, input.startMin).toISOString(),
        eventEndAt: eventInstant(input.date, input.endMin).toISOString(),
        needsAv: input.needsAv,
        guestSpeaker: input.guestSpeaker,
      },
      await this.repo.getRouteRules(),
      this.now(),
    )
  }

  /** Create and send a request in one step. Saving a draft first is a separate call. */
  async submit(actor: StudentActor, input: NewRequestInput, previousRequestId: string | null = null): Promise<Result<RequestDetail>> {
    const venue = STUDENT_VENUES.find((v) => v.id === input.venueId)
    if (!venue) return fail(400, 'Choose a space from the list.')
    if (input.endMin <= input.startMin) return fail(400, 'The event must end after it starts.')
    const start = eventInstant(input.date, input.startMin)
    const now = this.now()
    if (start.getTime() <= now.getTime()) return fail(400, 'The event is in the past.')
    if (venue.capacity !== null && input.attendance > venue.capacity) return fail(400, `${venue.label} seats ${venue.capacity}.`)

    const path = await this.previewPath(input)
    const at = now.toISOString()
    const id = this.repo.nextId('sr')
    const request: StudentRequest = {
      id,
      organisationId: actor.organisationId,
      organisationName: actor.organisationName,
      submittedBy: actor.email,
      eventName: input.eventName,
      description: input.description,
      category: input.category,
      venueId: venue.id,
      venueLabel: venue.label,
      date: input.date,
      startMin: input.startMin,
      endMin: input.endMin,
      attendance: input.attendance,
      needsAv: input.needsAv,
      guestSpeaker: input.guestSpeaker,
      status: 'pending',
      submittedAt: at,
      lastApproverActivityAt: null,
      lastFollowupAt: null,
      nextFollowupAllowedAt: addDays(now, (await this.repo.getConfig()).followupWaitDays).toISOString(),
      followupCount: 0,
      urgencyFollowupUsed: false,
      rootMessageId: null,
      previousRequestId,
      decisionReason: null,
      routeConfirmed: path.routeConfirmed,
      routeVersion: 1,
      version: 1,
      createdAt: at,
      updatedAt: at,
    }
    const steps: ApprovalStepRecord[] = path.stages.map((s, i) => ({
      id: this.repo.nextId('st'),
      requestId: id,
      position: i,
      role: s.role,
      why: s.why,
      confirmed: s.confirmed,
      state: i === 0 ? 'current' : 'not_started',
      decidedAt: null,
      decidedBy: null,
      reason: null,
    }))
    await this.repo.insertRequest(request, steps)
    await this.log(id, 'created', actor.email, 'Request created')
    await this.log(id, previousRequestId ? 'resubmitted' : 'submitted', actor.email, previousRequestId ? `Resubmitted from ${previousRequestId}` : `Sent to ${steps[0]?.role ?? 'an office'}`)
    return this.getDetail(actor, id)
  }

  private owned(request: StudentRequest | null, actor: StudentActor): request is StudentRequest {
    return request !== null && request.organisationId === actor.organisationId
  }

  async getDetail(actor: StudentActor, id: string): Promise<Result<RequestDetail>> {
    const request = await this.repo.getRequest(id)
    if (!this.owned(request, actor)) return fail(404, 'Request not found.')
    const config = await this.repo.getConfig()
    const now = this.now()
    return {
      ok: true,
      data: {
        request,
        status: deriveStatus(request, config, now),
        steps: await this.repo.getSteps(id),
        events: await this.repo.listEvents(id),
        followup: followupEligibility(clockOf(request), config, now),
      },
    }
  }

  /** My requests, most urgent first: taking longer, pending, approved upcoming, then the rest. */
  async listMine(actor: StudentActor): Promise<RequestListRow[]> {
    const config = await this.repo.getConfig()
    const now = this.now()
    const rows: RequestListRow[] = []
    for (const request of await this.repo.listRequests(actor.organisationId)) {
      const steps = await this.repo.getSteps(request.id)
      rows.push({ request, status: deriveStatus(request, config, now), currentRole: steps.find((s) => s.state === 'current')?.role ?? null })
    }
    const rank = (r: RequestListRow) =>
      r.status.shown === 'taking_longer' ? 0 : r.status.shown === 'pending' ? 1 : r.status.shown === 'approved' ? 2 : r.status.shown === 'draft' ? 3 : 4
    return rows.sort((a, b) => rank(a) - rank(b) || a.request.date.localeCompare(b.request.date))
  }

  /** The follow-up. The rule is enforced inside the repository's single atomic update, never here. */
  async sendFollowup(actor: StudentActor, id: string): Promise<Result<RequestDetail>> {
    const request = await this.repo.getRequest(id)
    if (!this.owned(request, actor)) return fail(404, 'Request not found.')
    const claim = await this.repo.claimFollowup(id, this.now(), actor.email)
    if (!claim.ok) return fail(409, 'A reminder cannot be sent now.', { reason: claim.result.reason, unlockAt: claim.result.unlockAt })
    return this.getDetail(actor, id)
  }

  async cancel(actor: StudentActor, id: string): Promise<Result<RequestDetail>> {
    const release = await this.mutex.acquire([id])
    try {
      const request = await this.repo.getRequest(id)
      if (!this.owned(request, actor)) return fail(404, 'Request not found.')
      if (request.status !== 'pending' && request.status !== 'draft') return fail(409, 'Only a request that is waiting can be cancelled.')
      const at = this.now().toISOString()
      const ok = await this.repo.updateRequest({ ...request, status: 'cancelled', version: request.version + 1, updatedAt: at })
      if (!ok) return fail(409, 'This request changed. Reload and try again.')
      await this.log(id, 'cancelled', actor.email, 'Request cancelled')
      return this.getDetail(actor, id)
    } finally {
      release()
    }
  }

  /** A rejected request becomes a new, linked version. The old one stays as it was. */
  async resubmit(actor: StudentActor, id: string, input: NewRequestInput): Promise<Result<RequestDetail>> {
    const previous = await this.repo.getRequest(id)
    if (!this.owned(previous, actor)) return fail(404, 'Request not found.')
    if (previous.status !== 'rejected') return fail(409, 'Only a request that was not approved can be resubmitted.')
    const result = await this.submit(actor, input, id)
    if (result.ok) await this.log(id, 'resubmitted', actor.email, `Resubmitted as ${result.data.request.id}`)
    return result
  }

  /**
   * An office decides or comments. Stands in for the admin portal until the two are joined. Any call
   * restarts the follow-up window. A rejection needs a reason and closes the request at once.
   */
  async recordDecision(id: string, input: DecisionInput): Promise<Result<RequestDetail>> {
    const release = await this.mutex.acquire([id])
    try {
      const request = await this.repo.getRequest(id)
      if (!request) return fail(404, 'Request not found.')
      if (request.status !== 'pending') return fail(409, 'This request is no longer waiting for a decision.')
      const steps = await this.repo.getSteps(id)
      const current = steps.find((s) => s.state === 'current')
      if (!current) return fail(409, 'No office is waiting on this request.')
      const now = this.now()
      const at = now.toISOString()
      const wait = (await this.repo.getConfig()).followupWaitDays

      let next = steps
      let decisionReason = request.decisionReason
      if (input.decision === 'approve') {
        next = steps.map((s) => (s.id === current.id ? { ...s, state: 'approved', decidedAt: at, decidedBy: input.by } : s))
        const following = next.find((s) => s.state === 'not_started')
        if (following) next = next.map((s) => (s.id === following.id ? { ...s, state: 'current' } : s))
      } else if (input.decision === 'reject') {
        if (!input.reason.trim()) return fail(400, 'A reason is needed to not approve a request.')
        next = steps.map((s) => (s.id === current.id ? { ...s, state: 'rejected', decidedAt: at, decidedBy: input.by, reason: input.reason } : s))
        decisionReason = input.reason
      }
      const status: StoredStatus = overallFromSteps(next)

      const updated: StudentRequest = {
        ...request,
        status,
        decisionReason,
        lastApproverActivityAt: at,
        nextFollowupAllowedAt: addDays(now, wait).toISOString(),
        version: request.version + 1,
        updatedAt: at,
      }
      if (!(await this.repo.updateRequest(updated, next))) return fail(409, 'This request changed. Reload and try again.')
      const type = input.decision === 'approve' ? 'step_approved' : input.decision === 'reject' ? 'step_rejected' : 'comment'
      await this.log(id, type, input.by, input.decision === 'comment' ? input.reason : `${current.role}: ${input.decision === 'approve' ? 'approved' : 'not approved'}`)
      const detail = await this.repo.getRequest(id)
      if (!detail) return fail(404, 'Request not found.')
      return this.getDetail({ organisationId: detail.organisationId, organisationName: detail.organisationName, email: detail.submittedBy }, id)
    } finally {
      release()
    }
  }

  /**
   * Scheduler tick. Writes events only, so it is safe to run every 15 minutes and to rerun. Each event has a
   * key built from the request and its last activity, so it is written once per quiet spell. A cancelled or
   * decided request is skipped, so cancelling stops every job. Emails come in M3.
   */
  async tick(): Promise<RequestEvent[]> {
    const config = await this.repo.getConfig()
    const now = this.now()
    const written: RequestEvent[] = []
    for (const request of await this.repo.listRequests()) {
      if (request.status !== 'pending') continue
      const anchor = latestOf([request.submittedAt, request.lastApproverActivityAt])
      if (!anchor) continue
      const idle = (now.getTime() - anchor.getTime()) / MS_PER_DAY
      const jobs: Array<[RequestEvent['type'], number, string]> = [
        ['reminder_due', config.approverReminderDay, 'The current office is reminded'],
        ['escalated', config.escalationDay, 'The backup role is told'],
        ['admin_flagged', config.adminFlagDay, 'Flagged for an administrator'],
      ]
      for (const [type, day, detail] of jobs) {
        if (idle < day) continue
        const event: RequestEvent = {
          id: this.repo.nextId('ev'),
          requestId: request.id,
          type,
          at: now.toISOString(),
          actor: 'scheduler',
          detail,
          key: `${type}:${request.id}:${anchor.toISOString()}`,
        }
        if (await this.repo.appendEvent(event)) written.push(event)
      }
    }
    return written
  }
}
