import { KeyedMutex } from '@/app/admin/bookings/_server/lock'
import { ADMIN_MAILBOX, STUDENT_VENUES } from '../data'
import { approvalPath } from '../logic/approval-path'
import { followupEligibility } from '../logic/followup'
import { deriveStatus, overallFromSteps } from '../logic/status'
import type {
  ApprovalStepRecord,
  ApprovalSummary,
  DecisionInput,
  EmailTemplate,
  OutboxRow,
  TokenProblem,
  NewRequestInput,
  RequestDetail,
  RequestEvent,
  RequestListRow,
  Result,
  StudentActor,
  StoredStatus,
  StudentRequest,
} from '../types'
import { addDays, eventInstant, istDateOf, latestOf, MS_PER_DAY } from '../utils'
import type { Bridge } from './bridge'
import { resolveBackup, resolveRecipient } from './email/directory'
import { Notifier } from './email/notifier'
import { DryRunTransport, type MailTransport } from './email/transport'
import { clockOf } from './repo/memory'
import type { StudentRepository } from './repo/repository'
import { verifyToken } from './tokens'

const fail = (code: 400 | 403 | 404 | 409, error: string, extra: { reason?: string; unlockAt?: string | null } = {}) => ({ ok: false as const, code, error, ...extra })

/**
 * Student side rules on top of a repository. Every method takes the clock from now(), so tests and the demo
 * can move time. Approver actions here stand in for the admin portal until M5 joins the two.
 */
export class StudentService {
  private offsetDays = 0
  private mutex = new KeyedMutex()

  private readonly notifier: Notifier
  private readonly bridge: Bridge | null

  constructor(
    private readonly repo: StudentRepository,
    options: Partial<{ transport: MailTransport; tokenSecret: string; baseUrl: string; messageIdDomain: string; bridge: Bridge }> = {},
  ) {
    this.bridge = options.bridge ?? null
    this.notifier = new Notifier(repo, {
      transport: options.transport ?? new DryRunTransport(),
      tokenSecret: options.tokenSecret ?? '',
      baseUrl: options.baseUrl ?? 'http://localhost:3000',
      messageIdDomain: options.messageIdDomain ?? 'booking.example.test',
    })
  }

  now(): Date {
    return new Date(Date.now() + this.offsetDays * MS_PER_DAY)
  }

  /** Moves this clock and the admin clock together, so a linked request never sees two different dates. */
  async advanceClock(days: number): Promise<{ now: string; offsetDays: number }> {
    const state = this.advanceDays(days)
    if (this.bridge) await this.bridge.advanceDays(days)
    return state
  }

  /** Rooms and what is free, from the admin portal. Null when this service is not joined to one. */
  async findRooms(query: Parameters<NonNullable<Bridge['rooms']>>[0]) {
    return this.bridge ? this.bridge.rooms(query) : null
  }

  /** Today's date in IST, YYYY-MM-DD. */
  today(): string {
    return istDateOf(this.now())
  }

  async getConfig() {
    return this.repo.getConfig()
  }

  advanceDays(days: number): { now: string; offsetDays: number } {
    this.offsetDays += days
    return { now: this.now().toISOString(), offsetDays: this.offsetDays }
  }

  private async log(requestId: string, type: RequestEvent['type'], actor: string, detail: string, key: string | null = null): Promise<void> {
    await this.repo.appendEvent({ id: this.repo.nextId('ev'), requestId, type, at: this.now().toISOString(), actor, detail, key })
  }

  /**
   * The path preview the form shows. For a room that exists in the admin portal it is the admin chain for
   * this club and event type. For anything else it falls back to the route table.
   */
  async previewPath(input: Pick<NewRequestInput, 'venueId' | 'category' | 'date' | 'startMin' | 'endMin' | 'needsAv' | 'guestSpeaker'>, orgName?: string) {
    if (this.bridge && orgName && (await this.bridge.room(input.venueId))) {
      const fromAdmin = await this.bridge.pathFor(orgName, input.category)
      if (fromAdmin) return fromAdmin
    }
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
    const adminRoom = this.bridge ? await this.bridge.room(input.venueId) : null
    const venue = adminRoom ? { id: input.venueId, label: adminRoom.label, capacity: adminRoom.capacity as number | null } : STUDENT_VENUES.find((v) => v.id === input.venueId)
    if (!venue) return fail(400, 'Choose a space from the list.')
    if (input.endMin <= input.startMin) return fail(400, 'The event must end after it starts.')
    const start = eventInstant(input.date, input.startMin)
    const now = this.now()
    if (start.getTime() <= now.getTime()) return fail(400, 'The event is in the past.')
    if (venue.capacity !== null && input.attendance > venue.capacity) return fail(400, `${venue.label} seats ${venue.capacity}.`)

    const path = await this.previewPath(input, actor.organisationName)
    // A bridged space is also created in the admin portal, which checks the room and the timetable. If it
    // refuses, so do we, and the club sees why instead of a request that can never be approved.
    let adminRequestId: string | null = null
    if (this.bridge && adminRoom) {
      const mirrored = await this.bridge.mirror(actor, input)
      if (!mirrored.ok) return fail(409, mirrored.error, { reason: 'slot_unavailable' })
      adminRequestId = mirrored.adminId
    }
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
      rootMessageId: this.notifier.rootIdFor(id),
      adminRequestId,
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
    await this.notifyOffice('submitted', request, steps[0], 1, { previousRequestId })
    return this.getDetail(actor, id)
  }

  private owned(request: StudentRequest | null, actor: StudentActor): request is StudentRequest {
    return request !== null && request.organisationId === actor.organisationId
  }

  async getDetail(actor: StudentActor, id: string): Promise<Result<RequestDetail>> {
    const stored = await this.repo.getRequest(id)
    if (!this.owned(stored, actor)) return fail(404, 'Request not found.')
    await this.sync(stored)
    return this.detailUnlocked(actor, id)
  }

  /** Reads one request as it is stored. Never takes the lock, so it is safe inside a locked section. */
  private async detailUnlocked(actor: StudentActor, id: string): Promise<Result<RequestDetail>> {
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
        events: (await this.repo.listEvents(id)).sort((a, b) => a.at.localeCompare(b.at)),
        followup: followupEligibility(clockOf(request), config, now),
      },
    }
  }

  /** My requests, most urgent first: taking longer, pending, approved upcoming, then the rest. */
  async listMine(actor: StudentActor): Promise<RequestListRow[]> {
    const config = await this.repo.getConfig()
    const now = this.now()
    const rows: RequestListRow[] = []
    for (const stored of await this.repo.listRequests(actor.organisationId)) {
      const request = await this.sync(stored)
      const steps = await this.repo.getSteps(request.id)
      rows.push({ request, status: deriveStatus(request, config, now), currentRole: steps.find((s) => s.state === 'current')?.role ?? null })
    }
    const rank = (r: RequestListRow) =>
      r.status.shown === 'taking_longer' ? 0 : r.status.shown === 'pending' ? 1 : r.status.shown === 'approved' ? 2 : r.status.shown === 'draft' ? 3 : 4
    return rows.sort((a, b) => rank(a) - rank(b) || a.request.date.localeCompare(b.request.date))
  }

  /** The follow-up. The rule is enforced inside the repository's single atomic update, never here. */
  async sendFollowup(actor: StudentActor, id: string): Promise<Result<RequestDetail>> {
    const first = await this.repo.getRequest(id)
    if (!this.owned(first, actor)) return fail(404, 'Request not found.')
    // Under the same lock as decisions, so a reminder can never make a decision lose its version check.
    const release = await this.mutex.acquire([id])
    let claim
    try {
      const stored = await this.repo.getRequest(id)
      if (!this.owned(stored, actor)) return fail(404, 'Request not found.')
      // Read what the office did first, so activity there restarts the window before the rule is checked.
      await this.syncUnlocked(stored)
      claim = await this.repo.claimFollowup(id, this.now(), actor.email)
    } finally {
      release()
    }
    if (!claim.ok) return fail(409, 'A reminder cannot be sent now.', { reason: claim.result.reason, unlockAt: claim.result.unlockAt })
    if (claim.request.adminRequestId && this.bridge) await this.bridge.note(claim.request.adminRequestId, 'The club sent a reminder.').catch(() => undefined)
    const steps = await this.repo.getSteps(id)
    await this.notifyOffice('followup', claim.request, steps.find((x) => x.state === 'current'), claim.request.followupCount)
    return this.getDetail(actor, id)
  }

  async cancel(actor: StudentActor, id: string): Promise<Result<RequestDetail>> {
    const release = await this.mutex.acquire([id])
    try {
      const stored = await this.repo.getRequest(id)
      if (!this.owned(stored, actor)) return fail(404, 'Request not found.')
      // The office may have decided since the page was loaded. Look first, so a decision is never lost.
      const request = await this.syncUnlocked(stored)
      if (request.status !== 'pending' && request.status !== 'draft') return fail(409, 'Only a request that is waiting can be cancelled. An office may have just decided it.')
      if (request.adminRequestId && this.bridge) {
        const withdrawn = await this.bridge.withdraw(request.adminRequestId)
        if (!withdrawn.ok) return fail(409, withdrawn.error)
      }
      const at = this.now().toISOString()
      const ok = await this.repo.updateRequest({ ...request, status: 'cancelled', version: request.version + 1, updatedAt: at })
      if (!ok) return fail(409, 'This request changed. Reload and try again.')
      await this.log(id, 'cancelled', actor.email, 'Request cancelled')
      const open = (await this.repo.getSteps(id)).find((x) => x.state === 'current')
      await this.notifyStudent('cancelled', { ...request, status: 'cancelled' }, open?.role ?? null, 1)
      return this.detailUnlocked(actor, id)
    } finally {
      release()
    }
  }

  /** A rejected request becomes a new, linked version. The old one stays as it was. */
  async resubmit(actor: StudentActor, id: string, input: NewRequestInput): Promise<Result<RequestDetail>> {
    const previous = await this.repo.getRequest(id)
    if (!this.owned(previous, actor)) return fail(404, 'Request not found.')
    if (previous.status !== 'rejected') return fail(409, 'Only a request that was not approved can be resubmitted.')
    const children = await this.repo.listRequests(actor.organisationId)
    if (children.some((c) => c.previousRequestId === id && c.status !== 'cancelled' && c.status !== 'rejected')) return fail(409, 'This request was already resubmitted.')
    const result = await this.submit(actor, input, id)
    if (result.ok) await this.log(id, 'resubmitted', actor.email, `Resubmitted as ${result.data.request.id}`)
    return result
  }

  /**
   * An office decides or comments. Stands in for the admin portal until the two are joined. Any call
   * restarts the follow-up window. A rejection needs a reason and closes the request at once.
   */
  async recordDecision(id: string, input: DecisionInput, guard?: { stepId: string; role: string; jti: string }): Promise<Result<RequestDetail>> {
    const release = await this.mutex.acquire([id])
    try {
      const stored = await this.repo.getRequest(id)
      if (!stored) return fail(404, 'Request not found.')
      const request = await this.syncUnlocked(stored)
      if (request.status !== 'pending') return fail(409, 'This request is no longer waiting for a decision.')
      if (guard) {
        // An email link may only act on the stage it was made for, checked now, after reading the office's
        // latest action, and the link is spent only if the decision goes through.
        const live = (await this.repo.getSteps(id)).find((x) => x.state === 'current')
        if (!live || live.id !== guard.stepId || live.role !== guard.role) return this.tokenFailure('wrong_stage')
        const record = await this.repo.getToken(guard.jti)
        if (!record || record.usedAt !== null) return this.tokenFailure('used')
      }
      const spend = async () => {
        if (guard) await this.repo.consumeToken(guard.jti, this.now())
      }
      if (request.adminRequestId && this.bridge) {
        if (input.decision === 'comment') await this.bridge.note(request.adminRequestId, input.reason)
        else {
          const done = await this.bridge.decide(request.adminRequestId, input.decision, input.decision === 'reject' ? input.reason : undefined)
          if (!done.ok) return fail(input.decision === 'reject' && !input.reason.trim() ? 400 : 409, done.error)
        }
        await spend()
        const synced = await this.repo.getRequest(id)
        if (!synced) return fail(404, 'Request not found.')
        await this.syncUnlocked(synced)
        return this.detailUnlocked({ organisationId: synced.organisationId, organisationName: synced.organisationName, email: synced.submittedBy }, id)
      }
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
      const offline = input.decision !== 'comment' && input.offline ? ' (decided offline)' : ''
      await this.log(id, type, input.by, input.decision === 'comment' ? input.reason : `${current.role}: ${input.decision === 'approve' ? 'approved' : 'not approved'}${offline}`)
      if (input.decision === 'reject') await this.notifyStudent('not_approved', updated, current.role, 1, { role: current.role, reason: input.reason })
      else if (input.decision === 'approve') {
        const following = next.find((x) => x.state === 'current')
        if (following) await this.notifyOffice('forwarded', updated, following, following.position + 1)
        else await this.notifyStudent('approved', updated, current.role, 1)
      }
      await spend()
      const detail = await this.repo.getRequest(id)
      if (!detail) return fail(404, 'Request not found.')
      return this.detailUnlocked({ organisationId: detail.organisationId, organisationName: detail.organisationName, email: detail.submittedBy }, id)
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
    for (const stored of await this.repo.listRequests()) {
      // An office may have decided in the admin portal. Look first, so a finished request gets no reminders.
      const request = await this.sync(stored)
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
        if (await this.repo.appendEvent(event)) {
          written.push(event)
          await this.emailForJob(type, request)
        }
      }
    }
    await this.drainOutbox()
    return written
  }

  /* ---------------- Admin portal link ---------------- */

  /**
   * Brings a linked request in line with the admin portal, which decides. Rebuilds the path from the admin
   * chain, copies the office's actions into the activity log once each (keyed by the admin log id), moves
   * the status, and sends the matching emails once. A request the club cancelled stays cancelled.
   */
  private async sync(request: StudentRequest): Promise<StudentRequest> {
    if (!this.bridge || !request.adminRequestId) return request
    const release = await this.mutex.acquire([request.id])
    try {
      const fresh = await this.repo.getRequest(request.id)
      return fresh ? await this.syncUnlocked(fresh) : request
    } finally {
      release()
    }
  }

  /** The sync itself. Call it only while holding this request's lock. */
  private async syncUnlocked(request: StudentRequest): Promise<StudentRequest> {
    if (!this.bridge || !request.adminRequestId || request.status === 'cancelled') return request
    const view = await this.bridge.view(request.adminRequestId)
    if (!view) return request

    const wait = (await this.repo.getConfig()).followupWaitDays
    const before = await this.repo.getSteps(request.id)
    const steps: ApprovalStepRecord[] = view.stages.map((stage, i) => ({
      id: before[i]?.role === stage.role ? (before[i]?.id ?? this.repo.nextId('st')) : this.repo.nextId('st'),
      requestId: request.id,
      position: i,
      role: stage.role,
      why: 'This office decides in the admin portal',
      confirmed: true,
      state: stage.state,
      decidedAt: stage.decidedAt,
      decidedBy: stage.decidedBy,
      reason: stage.state === 'rejected' ? view.reason : null,
    }))

    const actions: Record<string, RequestEvent['type']> = { forwarded: 'step_approved', confirmed: 'step_approved', override_confirmed: 'step_approved', rejected: 'step_rejected' }
    for (const log of view.logs) {
      if (log.action === 'submitted' || log.action === 'auto_checked' || log.action === 'resubmitted') continue
      const type = actions[log.action] ?? 'comment'
      const detail = `${log.stageLabel ?? 'The office'}: ${log.action.replace(/_/g, ' ')}${log.reason ? `. ${log.reason}` : ''}`
      await this.repo.appendEvent({ id: this.repo.nextId('ev'), requestId: request.id, type, at: log.at, actor: log.actorEmail, detail, key: `admin:${log.id}` })
    }

    const changed =
      view.status !== request.status ||
      view.lastApproverActivityAt !== request.lastApproverActivityAt ||
      view.reason !== request.decisionReason ||
      JSON.stringify(steps.map((x) => [x.role, x.state])) !== JSON.stringify(before.map((x) => [x.role, x.state]))
    if (!changed) {
      await this.emailsForSync(request, steps, view.logs)
      return request
    }

    const at = this.now()
    const updated: StudentRequest = {
      ...request,
      status: view.status,
      decisionReason: view.reason,
      lastApproverActivityAt: view.lastApproverActivityAt ?? request.lastApproverActivityAt,
      nextFollowupAllowedAt: view.lastApproverActivityAt ? addDays(new Date(view.lastApproverActivityAt), wait).toISOString() : request.nextFollowupAllowedAt,
      version: request.version + 1,
      updatedAt: at.toISOString(),
    }
    if (!(await this.repo.updateRequest(updated, steps))) return (await this.repo.getRequest(request.id)) ?? request

    await this.emailsForSync(updated, steps, view.logs)
    return updated
  }

  /**
   * Emails for what the office did, worked out from the admin log every time and deduplicated by the outbox
   * key, so a sync that lost a race still sends them on the next read, and never twice.
   */
  private async emailsForSync(request: StudentRequest, steps: ApprovalStepRecord[], logs: Array<{ action: string; at: string }>): Promise<void> {
    const approvals = logs.filter((l) => l.action === 'forwarded' || l.action === 'confirmed' || l.action === 'override_confirmed').sort((a, b) => a.at.localeCompare(b.at))
    for (const [i, log] of approvals.entries()) {
      if (log.action === 'forwarded') {
        const next = steps[i + 1]
        if (next && next.state === 'current') await this.notifyOffice('forwarded', request, next, next.position + 1)
      } else if (request.status === 'approved') await this.notifyStudent('approved', request, steps.at(-1)?.role ?? null, 1)
    }
    if (request.status === 'rejected') {
      const rejected = steps.find((x) => x.state === 'rejected')
      await this.notifyStudent('not_approved', request, rejected?.role ?? null, 1, { role: rejected?.role, reason: request.decisionReason ?? undefined })
    }
  }

  /* ---------------- Email ---------------- */

  private async emailForJob(type: RequestEvent['type'], request: StudentRequest): Promise<void> {
    const step = (await this.repo.getSteps(request.id)).find((x) => x.state === 'current')
    if (!step) return
    const activity = (await this.repo.listEvents(request.id)).filter((e) => e.type === 'step_approved' || e.type === 'step_rejected' || e.type === 'comment').length + 1
    const now = this.now()
    if (type === 'reminder_due') await this.notifyOffice('reminder', request, step, activity)
    else if (type === 'escalated') {
      await this.notifier.queue({ template: 'escalation', request, now, to: resolveBackup(step.role), cc: [], sequence: activity, approveFor: { stepId: step.id, role: step.role }, context: { role: step.role } })
    } else if (type === 'admin_flagged') {
      await this.notifier.queue({ template: 'admin_flag', request, now, to: ADMIN_MAILBOX, sequence: activity, context: { role: step.role } })
    }
  }

  /**
   * An email to the office whose turn it is, with a one-time approve link. The club is never copied on it,
   * because the link would let the club approve its own request. The club gets its own copy with no link.
   */
  private async notifyOffice(template: EmailTemplate, request: StudentRequest, step: ApprovalStepRecord | undefined, sequence: number, extra: { previousRequestId?: string | null } = {}): Promise<void> {
    if (!step) return
    const now = this.now()
    await this.notifier.queue({
      template,
      request,
      now,
      to: resolveRecipient(step.role, now).email,
      cc: [],
      sequence,
      approveFor: { stepId: step.id, role: step.role },
      context: { role: step.role, ...extra },
    })
    await this.notifier.queue({ template, request, now, to: request.submittedBy, cc: [], sequence, context: { role: step.role, forClub: true, ...extra } })
    await this.drainOutbox()
  }

  /** An email to the club, with the office that acted copied. */
  private async notifyStudent(template: EmailTemplate, request: StudentRequest, officeRole: string | null, sequence: number, context: { role?: string; reason?: string } = {}): Promise<void> {
    const now = this.now()
    await this.notifier.queue({
      template,
      request,
      now,
      to: request.submittedBy,
      cc: officeRole ? [resolveRecipient(officeRole, now).email] : [],
      sequence,
      context: { role: officeRole ?? undefined, ...context },
    })
    await this.drainOutbox()
  }

  /** Sends what is due. Never throws, so an email problem cannot undo a status change. */
  async drainOutbox(): Promise<{ sent: number; failed: number; suppressed: number }> {
    try {
      return await this.notifier.drain(this.now())
    } catch {
      return { sent: 0, failed: 0, suppressed: 0 }
    }
  }

  get mailTransport(): string {
    return this.notifier.transportName
  }

  /** The emails for a request. Approve links are hidden from the club unless demo mode asks to show them. */
  async listEmails(actor: StudentActor, id: string, revealLinks = false): Promise<Result<OutboxRow[]>> {
    const request = await this.repo.getRequest(id)
    if (!this.owned(request, actor)) return fail(404, 'Request not found.')
    const rows = (await this.repo.listOutbox(id)).map((r) => ({
      ...r,
      idempotencyKey: '',
      text: revealLinks ? r.text : r.text.replace(/https?:\/\/\S*\/student\/approve\/\S+/g, '[approve link sent to the office only]'),
    }))
    return { ok: true, data: rows }
  }

  /** From a bounce or complaint report. That address gets no more mail. */
  async recordBounce(email: string, kind: 'bounce' | 'complaint'): Promise<void> {
    await this.repo.addSuppression({ email, reason: kind, at: this.now().toISOString() })
  }

  private async checkToken(token: string, secret: string) {
    const verified = verifyToken(token, secret, this.now())
    if (!verified.ok) return { ok: false as const, problem: verified.problem as TokenProblem }
    const { payload } = verified
    const record = await this.repo.getToken(payload.jti)
    if (!record || record.requestId !== payload.r || record.stepId !== payload.s || record.role !== payload.role) return { ok: false as const, problem: 'invalid' as TokenProblem }
    if (record.usedAt !== null) return { ok: false as const, problem: 'used' as TokenProblem }
    const request = await this.repo.getRequest(payload.r)
    const steps = request ? await this.repo.getSteps(request.id) : []
    const step = steps.find((x) => x.id === payload.s)
    if (!request || request.status !== 'pending' || !step || step.state !== 'current' || step.role !== payload.role) return { ok: false as const, problem: 'wrong_stage' as TokenProblem }
    return { ok: true as const, payload, request, steps }
  }

  private tokenFailure(problem: TokenProblem) {
    const text: Record<TokenProblem, string> = {
      invalid: 'This link is not valid.',
      expired: 'This link has expired. Ask the club to send a reminder, or use the booking portal.',
      used: 'This link was already used.',
      wrong_stage: 'This request is no longer waiting for your office.',
    }
    return fail(problem === 'invalid' ? 403 : 409, text[problem], { reason: problem })
  }

  /** What the confirmation page shows. Read only: opening a link never changes anything. */
  async previewApproval(token: string, secret: string): Promise<Result<ApprovalSummary>> {
    const checked = await this.checkToken(token, secret)
    if (!checked.ok) return this.tokenFailure(checked.problem)
    const after = checked.steps.filter((x) => x.position > (checked.steps.find((y) => y.id === checked.payload.s)?.position ?? -1)).map((x) => x.role)
    return { ok: true, data: { request: checked.request, role: checked.payload.role, expiresAt: new Date(checked.payload.exp).toISOString(), remainingRoles: after } }
  }

  /** The POST behind the confirmation page. The link is spent only if the decision goes through. */
  async actViaToken(token: string, secret: string, decision: 'approve' | 'reject', reason?: string): Promise<Result<RequestDetail>> {
    const checked = await this.checkToken(token, secret)
    if (!checked.ok) return this.tokenFailure(checked.problem)
    if (decision === 'reject' && !reason?.trim()) return fail(400, 'A reason is needed to not approve a request.')
    const by = `${checked.payload.role} (email link)`
    const guard = { stepId: checked.payload.s, role: checked.payload.role, jti: checked.payload.jti }
    return decision === 'approve' ? this.recordDecision(checked.request.id, { decision, by }, guard) : this.recordDecision(checked.request.id, { decision, by, reason: reason ?? '' }, guard)
  }
}
