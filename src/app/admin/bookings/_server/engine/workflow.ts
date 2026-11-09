import type {
  Actor,
  ActionAvailability,
  ActionInput,
  ApprovalLog,
  AuthorityId,
  BookingRequest,
  BookingSettings,
  CategoryId,
  EmailDraft,
  EngineContext,
  LogAction,
  LogActorAuthority,
  Organisation,
  OutboxEmail,
  RequestDraft,
  RequestStatus,
  Room,
  SlotChange,
  SubmitSuccess,
  TransitionError,
  TransitionOptions,
  TransitionResult,
  WorkflowTemplate,
} from '../../types'
import { DAY_MIN, isOnSlotGrid, isValidDate } from '../../utils'
import { evaluateAutoApproval } from './auto-approval'
import { conflictsFor, findGroupContaining } from './conflicts'
import {
  autoApprovedEmails,
  cancelledEmails,
  changesRequestedEmails,
  conflictDetectedEmails,
  displacedEmails,
  escalatedEmails,
  finalApprovalEmails,
  forwardedEmails,
  rejectedEmails,
  submittedEmails,
  type MailContext,
} from './notifications'

export const MIN_REASON_LENGTH = 10

const STALE_MESSAGE = 'This request changed while you were looking at it. Reloaded with the latest version.'

function fail(code: TransitionError['code'], error: string, blocking?: BookingRequest[]): TransitionError {
  return blocking ? { error, code, blocking } : { error, code }
}

/* ------------------------------------------------------------------ */
/* Stage resolution                                                    */
/* ------------------------------------------------------------------ */

/**
 * Most specific template wins: authority + category, then category, then
 * authority, then an empty-match template. With no template the chain is the
 * organisation's governing authority, then Academic Booking.
 */
export function resolveStages(
  org: Pick<Organisation, 'authorityId'>,
  category: CategoryId,
  templates: WorkflowTemplate[],
): AuthorityId[] {
  let best: { score: number; template: WorkflowTemplate } | null = null
  for (const template of templates) {
    const { authorityId, categories } = template.match
    const hasCategories = categories !== undefined && categories.length > 0
    if (authorityId !== undefined && authorityId !== org.authorityId) continue
    if (hasCategories && !categories.includes(category)) continue
    const score = (authorityId !== undefined ? 1 : 0) + (hasCategories ? 2 : 0)
    if (!best || score > best.score) best = { score, template }
  }
  const raw: AuthorityId[] = best ? [...best.template.stages] : [org.authorityId, 'acad']
  return raw.filter((id, i) => i === 0 || id !== raw[i - 1])
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function authorityLabel(settings: BookingSettings, id: AuthorityId | undefined): string {
  if (!id) return 'the next office'
  return settings.authorities.find((a) => a.id === id)?.shortLabel ?? id.toUpperCase()
}

function finalIds(settings: BookingSettings): AuthorityId[] {
  return settings.authorities.filter((a) => a.isFinal).map((a) => a.id)
}

function lastIndex(r: BookingRequest): number {
  return Math.max(r.stages.length - 1, 0)
}

function isLastStage(r: BookingRequest): boolean {
  return r.stageIndex >= lastIndex(r)
}

function actsAtStage(actor: Actor, r: BookingRequest): boolean {
  if (actor.isSuperAdmin) return true
  const stage = r.stages[r.stageIndex]
  return stage !== undefined && actor.authorities.includes(stage)
}

function actsForFinal(actor: Actor, settings: BookingSettings): boolean {
  if (actor.isSuperAdmin) return true
  const finals = finalIds(settings)
  return actor.authorities.some((a) => finals.includes(a))
}

function logActorFor(actor: Actor, r: BookingRequest, settings: BookingSettings): LogActorAuthority {
  if (actor.isSuperAdmin) return 'superadmin'
  const stage = r.stages[r.stageIndex]
  if (stage && actor.authorities.includes(stage)) return stage
  const finals = finalIds(settings)
  const final = actor.authorities.find((a) => finals.includes(a))
  return final ?? actor.authorities[0] ?? 'organisation'
}

function mailContextFor(r: BookingRequest, ctx: EngineContext): MailContext | null {
  const organisation = ctx.organisations.find((o) => o.id === r.organisationId)
  const room = ctx.rooms.find((x) => x.id === r.roomId)
  if (!organisation || !room) return null
  return { request: r, organisation, room, authorities: ctx.settings.authorities }
}

function blockingFor(r: BookingRequest, ctx: EngineContext): BookingRequest[] {
  return conflictsFor(r.id, ctx.requests, ctx.settings)
    .filter((c) => c.kind === 'confirmed_booking')
    .map((c) => c.request)
}

function competingFor(r: BookingRequest, ctx: EngineContext): BookingRequest[] {
  return conflictsFor(r.id, ctx.requests, ctx.settings)
    .filter((c) => c.kind === 'competing_request')
    .map((c) => c.request)
}

function bump(r: BookingRequest, patch: Partial<BookingRequest>, now: string): BookingRequest {
  return { ...r, ...patch, version: r.version + 1, updatedAt: now }
}

function makeLog(
  ctx: EngineContext,
  request: BookingRequest,
  who: { email: string; authority: LogActorAuthority },
  action: LogAction,
  from: RequestStatus | null,
  to: RequestStatus,
  stageLabel: string | null,
  reason: string | null,
  now: string,
  internal = false,
): ApprovalLog {
  return {
    id: ctx.newId('log'),
    requestId: request.id,
    at: now,
    actorEmail: who.email,
    actorAuthority: who.authority,
    action,
    fromStatus: from,
    toStatus: to,
    stageLabel,
    reason,
    internal,
  }
}

function finalize(drafts: EmailDraft[], ctx: EngineContext, now: string): OutboxEmail[] {
  return drafts.map((d) => ({ ...d, id: ctx.newId('email'), at: now, status: 'simulated' }))
}

function validateSlot(
  slot: { roomId: string; date: string; startMin: number; endMin: number },
  ctx: EngineContext,
): string | null {
  if (!ctx.rooms.some((r) => r.id === slot.roomId)) return 'Unknown room.'
  if (!isValidDate(slot.date)) return 'Date must be in YYYY-MM-DD format.'
  if (!isOnSlotGrid(slot.startMin) || !isOnSlotGrid(slot.endMin)) return 'Times must fall on 15 minute slots.'
  if (slot.startMin < 0 || slot.endMin > DAY_MIN || slot.startMin >= slot.endMin) {
    return 'End time must be after start time.'
  }
  return null
}

function lookupAlternative(id: string | null | undefined, request: BookingRequest, ctx: EngineContext): Room | null | 'invalid' {
  if (!id) return null
  const room = ctx.rooms.find((r) => r.id === id)
  if (!room || room.id === request.roomId) return 'invalid'
  return room
}

/** Authorities that currently hold a member of the group, for conflict emails. */
function conflictEmailsFor(updated: BookingRequest, requestsAfter: BookingRequest[], ctx: EngineContext): EmailDraft[] {
  const group = findGroupContaining(updated.id, requestsAfter, ctx.settings)
  if (!group) return []
  const mail = mailContextFor(updated, ctx)
  if (!mail) return []
  const holders: AuthorityId[] = []
  for (const member of group.members) {
    const holder = member.status === 'confirmed' ? member.stages[lastIndex(member)] : member.stages[member.stageIndex]
    if (holder && !holders.includes(holder)) holders.push(holder)
  }
  return conflictDetectedEmails(
    mail,
    holders,
    group.members.filter((m) => m.id !== updated.id),
  )
}

/* ------------------------------------------------------------------ */
/* What the UI may show                                                */
/* ------------------------------------------------------------------ */

export function availableActions(request: BookingRequest, actor: Actor, ctx: EngineContext): ActionAvailability[] {
  const { settings } = ctx
  const stageId = request.stages[request.stageIndex]
  const stageName = authorityLabel(settings, stageId)
  const pending = request.status === 'pending'
  const last = isLastStage(request)
  const acting = actsAtStage(actor, request)
  const conflicts = conflictsFor(request.id, ctx.requests, settings)
  const inConflict = conflicts.length > 0
  const blocking = conflicts.filter((c) => c.kind === 'confirmed_booking')
  const canDecide = acting || (actsForFinal(actor, settings) && inConflict)

  const nextLabel = authorityLabel(settings, request.stages[request.stageIndex + 1])
  const approveLabel = last ? 'Give final approval' : `Approve and forward to ${nextLabel}`
  let approveReason: string | null = null
  if (!acting) approveReason = `Waiting on ${stageName}`
  else if (last && blocking.length > 0) approveReason = 'Blocked by a confirmed booking'

  const finalLabel = authorityLabel(settings, request.stages[lastIndex(request)])
  const decidable = request.status === 'pending' || request.status === 'changes_requested'

  return [
    {
      action: 'approve',
      label: approveLabel,
      visible: pending,
      enabled: pending && approveReason === null,
      disabledReason: pending ? approveReason : null,
    },
    {
      action: 'escalate',
      label: `Escalate to ${finalLabel}`,
      visible: pending && !last && inConflict && acting,
      enabled: pending && !last && inConflict && acting,
      disabledReason: null,
    },
    {
      action: 'request_changes',
      label: 'Request changes',
      visible: pending && canDecide,
      enabled: pending && canDecide,
      disabledReason: null,
    },
    {
      action: 'reject',
      label: 'Reject',
      visible: decidable && canDecide,
      enabled: decidable && canDecide,
      disabledReason: null,
    },
    {
      action: 'override_confirm',
      label: 'Override and confirm',
      visible: pending && last && actor.canOverride && blocking.length > 0,
      enabled: pending && last && actor.canOverride && blocking.length > 0,
      disabledReason: null,
    },
    {
      action: 'cancel',
      label: 'Cancel booking',
      visible: request.status === 'confirmed' && actor.canOverride,
      enabled: request.status === 'confirmed' && actor.canOverride,
      disabledReason: null,
    },
    {
      action: 'resubmit',
      label: 'Simulate resubmission',
      visible: request.status === 'changes_requested',
      enabled: request.status === 'changes_requested',
      disabledReason: null,
    },
    {
      action: 'remark',
      label: 'Add internal remark',
      visible: true,
      enabled: true,
      disabledReason: null,
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

export function transition(
  request: BookingRequest,
  input: ActionInput,
  actor: Actor,
  ctx: EngineContext,
  now: string,
  options: TransitionOptions = {},
): TransitionResult {
  const { settings } = ctx
  const who = { email: actor.email, authority: logActorFor(actor, request, settings) }
  const reason = (input.reason ?? '').trim()

  if (input.action !== 'remark') {
    if (input.version === undefined) return fail(400, 'A version is required.')
    if (input.version !== request.version) return fail(409, STALE_MESSAGE)
  }
  const mail = mailContextFor(request, ctx)
  if (!mail) return fail(400, 'This request points to an unknown organisation or room.')
  const mailFor = (r: BookingRequest): MailContext => ({ ...mail, request: r })
  const stageName = authorityLabel(settings, request.stages[request.stageIndex])
  const resolving = options.resolveGroup === true && actsForFinal(actor, settings)

  switch (input.action) {
    case 'approve': {
      if (request.status !== 'pending') return fail(400, 'Only pending requests can be approved.')
      if (!actsAtStage(actor, request) && !resolving) {
        return fail(403, `Waiting on ${stageName}. You cannot approve at this stage.`)
      }
      if (!isLastStage(request) && !resolving) {
        const nextId = request.stages[request.stageIndex + 1]
        if (!nextId) return fail(400, 'This request has no next stage.')
        const updated = bump(request, { stageIndex: request.stageIndex + 1 }, now)
        return {
          request: updated,
          others: [],
          logs: [makeLog(ctx, request, who, 'forwarded', 'pending', 'pending', stageName, null, now)],
          emails: finalize(forwardedEmails(mailFor(updated), stageName, nextId), ctx, now),
        }
      }
      const blocking = blockingFor(request, ctx)
      if (blocking.length > 0) return fail(409, 'A confirmed booking already holds this slot.', blocking)
      const updated = bump(request, { status: 'confirmed', stageIndex: lastIndex(request), amsSyncedAt: now }, now)
      const finalName = authorityLabel(settings, request.stages[lastIndex(request)])
      return {
        request: updated,
        others: [],
        logs: [
          makeLog(
            ctx,
            request,
            who,
            'confirmed',
            'pending',
            'confirmed',
            finalName,
            resolving && !isLastStage(request) ? 'Decided in conflict resolution' : null,
            now,
          ),
        ],
        emails: finalize(finalApprovalEmails(mailFor(updated)), ctx, now),
      }
    }

    case 'escalate': {
      if (request.status !== 'pending') return fail(400, 'Only pending requests can be escalated.')
      if (!actsAtStage(actor, request)) return fail(403, `Waiting on ${stageName}.`)
      if (isLastStage(request)) return fail(400, 'This request is already at the final stage.')
      if (conflictsFor(request.id, ctx.requests, settings).length === 0) {
        return fail(400, 'Only requests in a conflict can be escalated.')
      }
      const finalId = request.stages[lastIndex(request)]
      if (!finalId) return fail(400, 'This request has no final stage.')
      const updated = bump(request, { stageIndex: lastIndex(request), escalated: true }, now)
      return {
        request: updated,
        others: [],
        logs: [makeLog(ctx, request, who, 'escalated', 'pending', 'pending', stageName, null, now)],
        emails: finalize(escalatedEmails(mailFor(updated), stageName, finalId), ctx, now),
      }
    }

    case 'reject':
    case 'request_changes': {
      const rejecting = input.action === 'reject'
      const allowedStatus = rejecting
        ? request.status === 'pending' || request.status === 'changes_requested'
        : request.status === 'pending'
      if (!allowedStatus) {
        return fail(400, rejecting ? 'This request is already closed.' : 'Only pending requests can have changes requested.')
      }
      const permitted =
        actsAtStage(actor, request) ||
        resolving ||
        (actsForFinal(actor, settings) && conflictsFor(request.id, ctx.requests, settings).length > 0)
      if (!permitted) return fail(403, `Waiting on ${stageName}. You cannot decide this request.`)
      if (reason.length < MIN_REASON_LENGTH) {
        return fail(400, `A reason of at least ${MIN_REASON_LENGTH} characters is required.`)
      }
      const alternative = lookupAlternative(input.alternativeRoomId, request, ctx)
      if (alternative === 'invalid') return fail(400, 'The suggested room is not valid for this request.')
      const to: RequestStatus = rejecting ? 'rejected' : 'changes_requested'
      const updated = bump(request, { status: to }, now)
      const drafts = rejecting
        ? rejectedEmails(mailFor(updated), reason, alternative)
        : changesRequestedEmails(mailFor(updated), reason, alternative)
      return {
        request: updated,
        others: [],
        logs: [
          makeLog(ctx, request, who, rejecting ? 'rejected' : 'changes_requested', request.status, to, stageName, reason, now),
        ],
        emails: finalize(drafts, ctx, now),
      }
    }

    case 'resubmit': {
      if (request.status !== 'changes_requested') return fail(400, 'Only requests with changes requested can be resubmitted.')
      const inChain = request.stages.some((s) => actor.authorities.includes(s))
      if (!actor.isSuperAdmin && !inChain) return fail(403, 'You cannot resubmit this request.')
      const changes: SlotChange = input.changes ?? {}
      const slot = {
        roomId: changes.roomId ?? request.roomId,
        date: changes.date ?? request.date,
        startMin: changes.startMin ?? request.startMin,
        endMin: changes.endMin ?? request.endMin,
      }
      const invalid = validateSlot(slot, ctx)
      if (invalid) return fail(400, invalid)
      const changed =
        slot.roomId !== request.roomId ||
        slot.date !== request.date ||
        slot.startMin !== request.startMin ||
        slot.endMin !== request.endMin
      const updated = bump(
        request,
        { ...slot, status: 'pending', stageIndex: changed ? 0 : request.stageIndex, escalated: changed ? false : request.escalated },
        now,
      )
      const requestsAfter = ctx.requests.map((r) => (r.id === updated.id ? updated : r))
      return {
        request: updated,
        others: [],
        logs: [
          makeLog(
            ctx,
            request,
            { email: request.submittedBy, authority: 'organisation' },
            'resubmitted',
            'changes_requested',
            'pending',
            authorityLabel(settings, updated.stages[updated.stageIndex]),
            changed ? 'Room, date or time changed. Restarted at the first stage.' : null,
            now,
          ),
        ],
        emails: finalize([...submittedEmails(mailFor(updated)), ...conflictEmailsFor(updated, requestsAfter, ctx)], ctx, now),
      }
    }

    case 'override_confirm': {
      if (request.status !== 'pending') return fail(400, 'Only pending requests can be confirmed.')
      if (!actor.canOverride) return fail(403, 'Only Academic Booking or a super admin can override a confirmed booking.')
      if (!isLastStage(request)) return fail(400, 'Override is only available at the final stage.')
      if (reason.length < MIN_REASON_LENGTH) {
        return fail(400, `A reason of at least ${MIN_REASON_LENGTH} characters is required.`)
      }
      const blocking = blockingFor(request, ctx)
      if (blocking.length === 0) return fail(400, 'No confirmed booking blocks this request.')
      const finalName = authorityLabel(settings, request.stages[lastIndex(request)])
      const updated = bump(request, { status: 'confirmed', amsSyncedAt: now }, now)
      const displaced = blocking.map((b) => bump(b, { status: 'displaced' }, now))
      const logs: ApprovalLog[] = [
        makeLog(ctx, request, who, 'override_confirmed', 'pending', 'confirmed', finalName, reason, now),
        ...blocking.map((b) => makeLog(ctx, b, who, 'displaced', 'confirmed', 'displaced', finalName, reason, now)),
      ]
      const drafts: EmailDraft[] = [...finalApprovalEmails(mailFor(updated))]
      for (const d of displaced) {
        const dMail = mailContextFor(d, ctx)
        if (dMail) drafts.push(...displacedEmails(dMail, reason, request.eventName))
      }
      return { request: updated, others: displaced, logs, emails: finalize(drafts, ctx, now) }
    }

    case 'cancel': {
      if (request.status !== 'confirmed') return fail(400, 'Only confirmed bookings can be cancelled.')
      if (!actor.canOverride) return fail(403, 'Only Academic Booking or a super admin can cancel a confirmed booking.')
      if (reason.length < MIN_REASON_LENGTH) {
        return fail(400, `A reason of at least ${MIN_REASON_LENGTH} characters is required.`)
      }
      const updated = bump(request, { status: 'cancelled' }, now)
      return {
        request: updated,
        others: [],
        logs: [makeLog(ctx, request, who, 'cancelled', 'confirmed', 'cancelled', stageName, reason, now)],
        emails: finalize(cancelledEmails(mailFor(updated), reason), ctx, now),
      }
    }

    case 'remark': {
      if (reason.length === 0) return fail(400, 'A remark cannot be empty.')
      return {
        request,
        others: [],
        logs: [makeLog(ctx, request, who, 'remark', request.status, request.status, stageName, reason, now, true)],
        emails: [],
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Submission                                                          */
/* ------------------------------------------------------------------ */

/**
 * Creates a request, snapshots its approval chain, queues the notifications
 * and, when a rule allows it, auto-approves. `ctx.requests` must not contain
 * the new request yet.
 */
export function submitRequest(
  draft: RequestDraft,
  ctx: EngineContext,
  now: string,
): SubmitSuccess | TransitionError {
  const { settings } = ctx
  const organisation = ctx.organisations.find((o) => o.id === draft.organisationId)
  if (!organisation) return fail(400, 'Unknown organisation.')
  const invalid = validateSlot(draft, ctx)
  if (invalid) return fail(400, invalid)
  if (!Number.isInteger(draft.expectedAttendance) || draft.expectedAttendance < 1) {
    return fail(400, 'Expected attendance must be at least 1.')
  }
  if (draft.eventName.trim().length === 0) return fail(400, 'Event name is required.')

  const stages = resolveStages(organisation, draft.category, settings.workflows)
  const created: BookingRequest = {
    id: ctx.newId('request'),
    ...draft,
    eventName: draft.eventName.trim(),
    status: 'pending',
    stages,
    stageIndex: 0,
    escalated: false,
    autoApprovedBy: null,
    amsSyncedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
  const all = [...ctx.requests, created]
  const allCtx: EngineContext = { ...ctx, requests: all }
  const mail = mailContextFor(created, allCtx)
  if (!mail) return fail(400, 'Unknown room.')

  const submitter = { email: draft.submittedBy, authority: 'organisation' as const }
  const logs: ApprovalLog[] = [
    makeLog(ctx, created, submitter, 'submitted', null, 'pending', authorityLabel(settings, stages[0]), null, now),
  ]
  const conflictDrafts = conflictEmailsFor(created, all, allCtx)

  const auto = evaluateAutoApproval(created, settings.autoApproval, { settings, rooms: ctx.rooms, requests: all }, now)
  if (auto) {
    const systemWho = { email: 'system', authority: 'system' as const }
    const note = `Rule: ${auto.ruleName} (${auto.ruleId})`
    if (auto.effect === 'confirm') {
      const confirmed = bump(
        created,
        { status: 'confirmed', stageIndex: lastIndex(created), autoApprovedBy: auto.ruleId, amsSyncedAt: now },
        now,
      )
      logs.push(makeLog(ctx, created, systemWho, 'auto_approved', 'pending', 'confirmed', null, note, now))
      return {
        request: confirmed,
        logs,
        emails: finalize(autoApprovedEmails({ ...mail, request: confirmed }, auto.ruleName), ctx, now),
      }
    }
    const skipped = bump(created, { stageIndex: lastIndex(created), autoApprovedBy: auto.ruleId }, now)
    logs.push(makeLog(ctx, created, systemWho, 'auto_approved', 'pending', 'pending', null, note, now))
    return {
      request: skipped,
      logs,
      emails: finalize(submittedEmails({ ...mail, request: skipped }), ctx, now),
    }
  }

  return {
    request: created,
    logs,
    emails: finalize([...submittedEmails(mail), ...conflictDrafts], ctx, now),
  }
}

/** Competing requests, exposed for callers that only need the list. */
export { competingFor }
