import type {
  Actor,
  ActionAvailability,
  ActionInput,
  ApprovalLog,
  BatchSnapshot,
  Blocker,
  BookingRequest,
  BookingSettings,
  CategoryId,
  EmailDraft,
  EngineContext,
  LogAction,
  LogRole,
  OccupancyItem,
  OfficeId,
  Organisation,
  OutboxEmail,
  RequestDraft,
  RequestStatus,
  Room,
  SubmitSuccess,
  TransitionError,
  TransitionOptions,
  TransitionResult,
  TransitionSuccess,
  WorkflowTemplate,
} from '../../types'
import { addHours, DAY_MIN, eventStartMs, isOnSlotGrid, isValidDate } from '../../utils'
import { evaluateAutoApproval } from './auto-approval'
import { flagsFor, laneFor, overdueHours } from './flags'
import {
  autoApprovedEmails,
  changesRequestedEmails,
  clashDetectedEmails,
  confirmedEmails,
  displacedEmails,
  escalatedEmails,
  expiredEmails,
  forwardedEmails,
  offerLapsedEmails,
  offeredEmails,
  overdueEmails,
  rejectedEmails,
  submittedEmails,
  type MailContext,
} from './notifications'
import { blockersIn, clashesFor, clashGroupContaining } from './occupancy'

export const MIN_REASON_LENGTH = 10

const STALE = 'This request changed while you were looking at it. Reloaded.'

function fail(code: TransitionError['code'], error: string, blockers?: Blocker[]): TransitionError {
  return blockers && blockers.length > 0 ? { error, code, blockers } : { error, code }
}

/* ------------------------------------------------------------------ */
/* Stage resolution                                                    */
/* ------------------------------------------------------------------ */

/**
 * Most specific template wins: office plus category, then category, then
 * office. With no template the chain is the governing office, then ACAD.
 */
export function resolveStages(org: Pick<Organisation, 'officeId'>, category: CategoryId, templates: WorkflowTemplate[]): OfficeId[] {
  let best: { score: number; template: WorkflowTemplate } | null = null
  for (const template of templates) {
    const { officeId, categories } = template.match
    const hasCategories = categories !== undefined && categories.length > 0
    if (officeId !== undefined && officeId !== org.officeId) continue
    if (hasCategories && !categories.includes(category)) continue
    const score = (officeId !== undefined ? 1 : 0) + (hasCategories ? 2 : 0)
    if (!best || score > best.score) best = { score, template }
  }
  const raw: OfficeId[] = best ? [...best.template.stages] : [org.officeId, 'acad']
  return raw.filter((id, i) => i === 0 || id !== raw[i - 1])
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function officeLabel(settings: BookingSettings, id: OfficeId | undefined): string {
  if (!id) return 'the next office'
  return settings.offices.find((o) => o.id === id)?.shortLabel ?? id.toUpperCase()
}

function lastIndex(r: BookingRequest): number {
  return Math.max(r.stages.length - 1, 0)
}

function isLastStage(r: BookingRequest): boolean {
  return r.stageIndex >= lastIndex(r)
}

export function actsAtStage(actor: Actor, r: BookingRequest): boolean {
  return actor.isSuperAdmin || r.stages[r.stageIndex] === actor.actingFor
}

export function actsForFinal(actor: Actor, settings: BookingSettings): boolean {
  if (actor.isSuperAdmin) return true
  return settings.offices.some((o) => o.isFinal && o.id === actor.actingFor)
}

function logRole(actor: Actor): LogRole {
  return actor.isSuperAdmin ? 'superadmin' : actor.actingFor
}

function mailContext(r: BookingRequest, ctx: EngineContext): MailContext | null {
  const organisation = ctx.organisations.find((o) => o.id === r.organisationId)
  const room = ctx.rooms.find((x) => x.id === r.roomId)
  if (!organisation || !room) return null
  return { request: r, organisation, room, offices: ctx.settings.offices }
}

function bump(r: BookingRequest, patch: Partial<BookingRequest>, now: string): BookingRequest {
  return { ...r, ...patch, version: r.version + 1, updatedAt: now }
}

function makeLog(
  ctx: EngineContext,
  request: BookingRequest,
  who: { email: string; role: LogRole },
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
    actorRole: who.role,
    action,
    fromStatus: from,
    toStatus: to,
    stageLabel,
    reason,
    internal,
    batchId: null,
  }
}

function finalize(drafts: EmailDraft[], ctx: EngineContext, now: string): OutboxEmail[] {
  return drafts.map((d) => ({ ...d, id: ctx.newId('email'), at: now, status: 'simulated', failReason: null, batchId: null }))
}

function validateSlot(slot: { roomId: string; date: string; startMin: number; endMin: number }, ctx: EngineContext): string | null {
  if (!ctx.rooms.some((r) => r.id === slot.roomId)) return 'Unknown room.'
  if (!isValidDate(slot.date)) return 'Date must be in YYYY-MM-DD format.'
  if (!isOnSlotGrid(slot.startMin) || !isOnSlotGrid(slot.endMin)) return 'Times must fall on 15 minute slots.'
  if (slot.startMin < 0 || slot.endMin > DAY_MIN || slot.startMin >= slot.endMin) return 'End time must be after start time.'
  return null
}

function describeBlocker(item: OccupancyItem, ctx: EngineContext): Blocker {
  if (item.kind === 'class' && item.block) {
    return { kind: 'class', label: `${item.block.courseCode} ${item.block.title}`, requestId: null, startMin: item.startMin, endMin: item.endMin }
  }
  const name = item.request?.eventName ?? item.id
  void ctx
  return {
    kind: item.effect === 'held' ? 'held' : 'booked',
    label: name,
    requestId: item.request?.id ?? null,
    startMin: item.startMin,
    endMin: item.endMin,
  }
}

export function blockersFor(ctx: EngineContext, r: BookingRequest): Blocker[] {
  return blockersIn(ctx, r.roomId, r.date, r.startMin, r.endMin, r.id).map((i) => describeBlocker(i, ctx))
}

function blockedMessage(blockers: Blocker[]): string {
  const first = blockers[0]
  if (!first) return 'The room is not free.'
  if (first.kind === 'class') return 'A class is booked here at this time.'
  if (first.kind === 'held') return 'The room is held for an offer to another club.'
  return `Already booked by ${first.label}.`
}

function isSelfApproval(actor: Actor, ctx: EngineContext, r: BookingRequest): boolean {
  const org = ctx.organisations.find((o) => o.id === r.organisationId)
  return org !== undefined && org.contactEmail.toLowerCase() === actor.email.toLowerCase()
}

/** Offices holding a member of a clash, for notification. */
function clashHolders(ctx: EngineContext, request: BookingRequest): { holders: OfficeId[]; names: string[] } | null {
  const group = clashGroupContaining(ctx, request.id)
  if (!group) return null
  const holders: OfficeId[] = []
  const add = (id: OfficeId | undefined) => {
    if (id && !holders.includes(id)) holders.push(id)
  }
  for (const m of group.members) add(m.stages[m.stageIndex])
  for (const b of group.blockedBy) add(b.request ? b.request.stages[lastIndex(b.request)] : 'acad')
  const names = [
    ...group.members.filter((m) => m.id !== request.id).map((m) => `${m.eventName} (${m.id})`),
    ...group.blockedBy.map((b) => (b.block ? `${b.block.courseCode} class` : `${b.request?.eventName ?? b.id} (booked)`)),
  ]
  return { holders, names }
}

function clashEmails(ctx: EngineContext, request: BookingRequest): EmailDraft[] {
  const mail = mailContext(request, ctx)
  const info = clashHolders(ctx, request)
  if (!mail || !info) return []
  return clashDetectedEmails(mail, info.holders, info.names)
}

/* ------------------------------------------------------------------ */
/* What the UI may show                                                */
/* ------------------------------------------------------------------ */

export function availableActions(ctx: EngineContext, request: BookingRequest, actor: Actor, now: string): ActionAvailability[] {
  const { settings } = ctx
  const stageName = officeLabel(settings, request.stages[request.stageIndex])
  const pending = request.status === 'pending'
  const decidable = pending || request.status === 'changes_requested'
  const last = isLastStage(request)
  const acting = actsAtStage(actor, request)
  const inClash = clashesFor(ctx, request.id).length > 0
  const canDecide = acting || (actsForFinal(actor, settings) && inClash)
  const blockers = blockersFor(ctx, request)
  const overridable = blockers.length > 0 && blockers.every((b) => b.kind === 'booked')
  const room = ctx.rooms.find((r) => r.id === request.roomId)
  const flagged = room ? flagsFor(ctx, request, room, now).some((f) => f.kind !== 'overdue') || inClash : inClash

  const nextName = officeLabel(settings, request.stages[request.stageIndex + 1])
  let approveLabel = last ? 'Give final approval' : `Approve and send to ${nextName}`
  if (flagged) approveLabel = 'Approve anyway'
  let approveReason: string | null = null
  if (!acting) approveReason = `Waiting on ${stageName}`
  else if (last && blockers.length > 0) approveReason = blockedMessage(blockers)

  const off = (action: ActionAvailability['action'], label: string, visible: boolean, enabled = visible, why: string | null = null): ActionAvailability => ({
    action,
    label,
    visible,
    enabled,
    disabledReason: why,
  })
  return [
    off('approve', approveLabel, pending, pending && approveReason === null, pending ? approveReason : null),
    off('offer_room', 'Offer a room', decidable && canDecide),
    off('request_changes', 'Ask for changes', pending && canDecide),
    off('reject', 'Decline', decidable && canDecide),
    off('escalate', `Escalate to ${officeLabel(settings, request.stages[lastIndex(request)])}`, pending && !last && inClash && acting),
    off('override_confirm', 'Override and confirm', pending && last && actor.canOverride && overridable),
    off('cancel', 'Cancel booking', request.status === 'confirmed' && actor.canOverride),
    off('accept_offer', 'Accept offer (demo)', request.status === 'offered'),
    off('resubmit', 'Send again (demo)', request.status === 'changes_requested'),
    off('note', 'Add note', true),
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
  const who = { email: actor.email, role: logRole(actor) }
  const reason = (input.reason ?? '').trim()

  if (input.action !== 'note') {
    if (input.version === undefined) return fail(400, 'A version is required.')
    if (input.version !== request.version) return fail(409, STALE)
  }
  const mail = mailContext(request, ctx)
  if (!mail) return fail(400, 'This request points to an unknown organisation or room.')
  const mailFor = (r: BookingRequest): MailContext => ({ ...mail, request: r })
  const stageName = officeLabel(settings, request.stages[request.stageIndex])
  const resolving = options.resolveGroup === true && actsForFinal(actor, settings)
  const done = (requests: BookingRequest[], logs: ApprovalLog[], drafts: EmailDraft[]): TransitionSuccess => ({
    requests,
    logs,
    emails: finalize(drafts, ctx, now),
  })

  if (input.action !== 'note' && input.action !== 'accept_offer' && input.action !== 'resubmit' && isSelfApproval(actor, ctx, request)) {
    return fail(403, 'You cannot decide a request from your own organisation.')
  }

  switch (input.action) {
    case 'approve': {
      if (request.status !== 'pending') return fail(400, 'Only pending requests can be approved.')
      if (!actsAtStage(actor, request) && !resolving) return fail(403, `Waiting on ${stageName}. You cannot approve at this step.`)
      if (!isLastStage(request) && !resolving) {
        const nextId = request.stages[request.stageIndex + 1]
        if (!nextId) return fail(400, 'This request has no next step.')
        const updated = bump(request, { stageIndex: request.stageIndex + 1, stageEnteredAt: now }, now)
        return done(
          [updated],
          [makeLog(ctx, request, who, 'forwarded', 'pending', 'pending', stageName, null, now)],
          forwardedEmails(mailFor(updated), stageName, nextId),
        )
      }
      const blockers = blockersFor(ctx, request)
      if (blockers.length > 0) return fail(409, blockedMessage(blockers), blockers)
      const updated = bump(request, { status: 'confirmed', stageIndex: lastIndex(request), stageEnteredAt: now, amsSyncedAt: now }, now)
      const finalName = officeLabel(settings, request.stages[lastIndex(request)])
      return done(
        [updated],
        [makeLog(ctx, request, who, 'confirmed', 'pending', 'confirmed', finalName, resolving && !isLastStage(request) ? 'Decided as part of a clash' : null, now)],
        confirmedEmails(mailFor(updated)),
      )
    }

    case 'offer_room': {
      if (request.status !== 'pending' && request.status !== 'changes_requested') return fail(400, 'This request is closed.')
      if (!actsAtStage(actor, request) && !resolving) return fail(403, `Waiting on ${stageName}. You cannot decide this request.`)
      const target = ctx.rooms.find((r) => r.id === input.roomId)
      if (!target) return fail(400, 'Choose a room to offer.')
      if (target.id === request.roomId) return fail(400, 'Offer a different room.')
      if (target.capacity < request.expectedAttendance) {
        return fail(400, `${target.name} seats ${target.capacity}, but ${request.expectedAttendance} people are expected.`)
      }
      if (request.startMin < target.openFromMin || request.endMin > target.openUntilMin) return fail(400, 'That room is closed at this time.')
      if (!target.bookableByClubs && mail.organisation.kind !== 'department' && mail.organisation.kind !== 'office' && mail.organisation.kind !== 'ministry') {
        return fail(400, 'That room is for classes only.')
      }
      const blockers = blockersIn(ctx, target.id, request.date, request.startMin, request.endMin, request.id).map((i) => describeBlocker(i, ctx))
      if (blockers.length > 0) return fail(400, `That room is not free: ${blockedMessage(blockers)}`, blockers)
      const holdUntil = addHours(now, settings.offerHoldHours)
      const updated = bump(
        request,
        {
          status: 'offered',
          offer: {
            roomId: target.id,
            offeredBy: actor.isSuperAdmin ? 'superadmin' : actor.actingFor,
            offeredAt: now,
            holdUntil,
            stageIndexOnAccept: request.stageIndex + 1,
          },
        },
        now,
      )
      return done(
        [updated],
        [makeLog(ctx, request, who, 'offered', request.status, 'offered', stageName, reason || `Offered ${target.building} ${target.name}`, now)],
        offeredEmails(mailFor(request), target, holdUntil, reason || null, stageName),
      )
    }

    case 'accept_offer': {
      if (request.status !== 'offered' || !request.offer) return fail(400, 'There is no offer to accept.')
      const inChain = request.stages.some((s) => actor.offices.includes(s))
      if (!actor.isSuperAdmin && !inChain) return fail(403, 'You cannot accept this offer.')
      if (Date.parse(now) >= Date.parse(request.offer.holdUntil)) return fail(409, 'The hold on this room has ended.')
      const offer = request.offer
      const stillFree = blockersIn(ctx, offer.roomId, request.date, request.startMin, request.endMin, request.id)
      if (stillFree.length > 0) return fail(409, 'The offered room is no longer free.')
      const orgWho = { email: request.submittedBy, role: 'organisation' as const }
      if (offer.stageIndexOnAccept >= request.stages.length) {
        const updated = bump(
          request,
          { roomId: offer.roomId, offer: null, status: 'confirmed', stageIndex: lastIndex(request), stageEnteredAt: now, amsSyncedAt: now },
          now,
        )
        return done([updated], [makeLog(ctx, request, orgWho, 'offer_accepted', 'offered', 'confirmed', stageName, null, now)], confirmedEmails(mailFor(updated)))
      }
      const nextIndex = offer.stageIndexOnAccept
      const nextId = request.stages[nextIndex]
      const clearedLabel = officeLabel(settings, request.stages[nextIndex - 1])
      const updated = bump(request, { roomId: offer.roomId, offer: null, status: 'pending', stageIndex: nextIndex, stageEnteredAt: now }, now)
      return done(
        [updated],
        [makeLog(ctx, request, orgWho, 'offer_accepted', 'offered', 'pending', officeLabel(settings, nextId), null, now)],
        nextId ? forwardedEmails(mailFor(updated), clearedLabel, nextId) : [],
      )
    }

    case 'escalate': {
      if (request.status !== 'pending') return fail(400, 'Only pending requests can be escalated.')
      if (!actsAtStage(actor, request)) return fail(403, `Waiting on ${stageName}.`)
      if (isLastStage(request)) return fail(400, 'This request is already at the final step.')
      if (clashesFor(ctx, request.id).length === 0) return fail(400, 'Only requests in a clash can be escalated.')
      const finalId = request.stages[lastIndex(request)]
      if (!finalId) return fail(400, 'This request has no final step.')
      const updated = bump(request, { stageIndex: lastIndex(request), stageEnteredAt: now, escalated: true }, now)
      return done(
        [updated],
        [makeLog(ctx, request, who, 'escalated', 'pending', 'pending', stageName, null, now)],
        escalatedEmails(mailFor(updated), stageName, finalId),
      )
    }

    case 'reject':
    case 'request_changes': {
      const rejecting = input.action === 'reject'
      const allowed = rejecting ? request.status === 'pending' || request.status === 'changes_requested' : request.status === 'pending'
      if (!allowed) return fail(400, rejecting ? 'This request is already closed.' : 'Only pending requests can have changes requested.')
      const permitted =
        actsAtStage(actor, request) || resolving || (actsForFinal(actor, settings) && clashesFor(ctx, request.id).length > 0)
      if (!permitted) return fail(403, `Waiting on ${stageName}. You cannot decide this request.`)
      if (reason.length < MIN_REASON_LENGTH) return fail(400, `A reason of at least ${MIN_REASON_LENGTH} characters is required.`)
      const to: RequestStatus = rejecting ? 'rejected' : 'changes_requested'
      const updated = bump(request, { status: to }, now)
      return done(
        [updated],
        [makeLog(ctx, request, who, rejecting ? 'rejected' : 'changes_requested', request.status, to, stageName, reason, now)],
        rejecting ? rejectedEmails(mailFor(updated), reason) : changesRequestedEmails(mailFor(updated), reason),
      )
    }

    case 'resubmit': {
      if (request.status !== 'changes_requested') return fail(400, 'Only requests with changes requested can be sent again.')
      const inChain = request.stages.some((s) => actor.offices.includes(s))
      if (!actor.isSuperAdmin && !inChain) return fail(403, 'You cannot send this request again.')
      const c = input.changes ?? {}
      const slot = {
        roomId: c.roomId ?? request.roomId,
        date: c.date ?? request.date,
        startMin: c.startMin ?? request.startMin,
        endMin: c.endMin ?? request.endMin,
      }
      const attendance = c.expectedAttendance ?? request.expectedAttendance
      const invalid = validateSlot(slot, ctx)
      if (invalid) return fail(400, invalid)
      const moved = slot.roomId !== request.roomId || slot.date !== request.date || slot.startMin !== request.startMin || slot.endMin !== request.endMin
      const bigChange = Math.abs(attendance - request.expectedAttendance) > request.expectedAttendance * 0.2
      const reopened = moved || bigChange
      const updated = bump(
        request,
        {
          ...slot,
          expectedAttendance: attendance,
          status: 'pending',
          stageIndex: reopened ? 0 : request.stageIndex,
          stageEnteredAt: now,
          escalated: reopened ? false : request.escalated,
          previous: reopened
            ? { roomId: request.roomId, date: request.date, startMin: request.startMin, endMin: request.endMin, expectedAttendance: request.expectedAttendance }
            : request.previous,
        },
        now,
      )
      const after: EngineContext = { ...ctx, requests: ctx.requests.map((r) => (r.id === updated.id ? updated : r)) }
      return done(
        [updated],
        [
          makeLog(
            ctx,
            request,
            { email: request.submittedBy, role: 'organisation' },
            reopened ? 'reopened' : 'resubmitted',
            'changes_requested',
            'pending',
            officeLabel(settings, updated.stages[updated.stageIndex]),
            reopened ? 'Room, time or numbers changed. Started again at the first step.' : null,
            now,
          ),
        ],
        [...submittedEmails(mailFor(updated)), ...clashEmails(after, updated)],
      )
    }

    case 'override_confirm': {
      if (request.status !== 'pending') return fail(400, 'Only pending requests can be confirmed.')
      if (!actor.canOverride) return fail(403, 'Only Academic Booking or a super admin can override a booking.')
      if (!isLastStage(request)) return fail(400, 'Override is only available at the final step.')
      if (reason.length < MIN_REASON_LENGTH) return fail(400, `A reason of at least ${MIN_REASON_LENGTH} characters is required.`)
      const blockers = blockersFor(ctx, request)
      if (blockers.length === 0) return fail(400, 'Nothing is booked here, so there is nothing to override.')
      if (blockers.some((b) => b.kind !== 'booked')) return fail(409, blockedMessage(blockers.filter((b) => b.kind !== 'booked')), blockers)
      const finalName = officeLabel(settings, request.stages[lastIndex(request)])
      const updated = bump(request, { status: 'confirmed', stageEnteredAt: now, amsSyncedAt: now }, now)
      const displaced: BookingRequest[] = []
      const logs: ApprovalLog[] = [makeLog(ctx, request, who, 'override_confirmed', 'pending', 'confirmed', finalName, reason, now)]
      const drafts: EmailDraft[] = [...confirmedEmails(mailFor(updated))]
      for (const b of blockers) {
        const target = ctx.requests.find((r) => r.id === b.requestId)
        if (!target) continue
        const d = bump(target, { status: 'displaced' }, now)
        displaced.push(d)
        logs.push(makeLog(ctx, target, who, 'displaced', 'confirmed', 'displaced', finalName, reason, now))
        const dMail = mailContext(d, ctx)
        if (dMail) drafts.push(...displacedEmails(dMail, reason, request.eventName))
      }
      return done([updated, ...displaced], logs, drafts)
    }

    case 'cancel': {
      if (request.status !== 'confirmed') return fail(400, 'Only confirmed bookings can be cancelled.')
      if (!actor.canOverride) return fail(403, 'Only Academic Booking or a super admin can cancel a booking.')
      if (reason.length < MIN_REASON_LENGTH) return fail(400, `A reason of at least ${MIN_REASON_LENGTH} characters is required.`)
      const updated = bump(request, { status: 'cancelled' }, now)
      return done(
        [updated],
        [makeLog(ctx, request, who, 'cancelled', 'confirmed', 'cancelled', stageName, reason, now)],
        rejectedEmails(mailFor(updated), reason, 'Cancelled'),
      )
    }

    case 'note': {
      if (reason.length === 0) return fail(400, 'A note cannot be empty.')
      return done([], [makeLog(ctx, request, who, 'note', request.status, request.status, stageName, reason, now, true)], [])
    }
  }
}

/* ------------------------------------------------------------------ */
/* Sweep: lapsed offers, overdue steps, expiry                         */
/* ------------------------------------------------------------------ */

/**
 * Runs at the start of every service read. Lapses offers whose hold has
 * passed, expires undecided requests once their event has started, and sends
 * one overdue email per request per step.
 */
export function sweep(ctx: EngineContext, now: string): TransitionSuccess {
  const requests: BookingRequest[] = []
  const logs: ApprovalLog[] = []
  const drafts: EmailDraft[] = []
  const system = { email: 'system', role: 'system' as const }
  const nowMs = Date.parse(now)

  for (const r of ctx.requests) {
    const open = r.status === 'pending' || r.status === 'changes_requested' || r.status === 'offered'
    if (!open) continue
    const mail = mailContext(r, ctx)
    if (!mail) continue

    if (eventStartMs(r.date, r.startMin) <= nowMs) {
      const updated = bump(r, { status: 'expired', offer: null }, now)
      requests.push(updated)
      logs.push(makeLog(ctx, r, system, 'expired', r.status, 'expired', null, 'The event started before a decision was made.', now))
      drafts.push(...expiredEmails({ ...mail, request: updated }))
      continue
    }
    if (r.status === 'offered' && r.offer && Date.parse(r.offer.holdUntil) <= nowMs) {
      const updated = bump(r, { status: 'changes_requested', offer: null }, now)
      requests.push(updated)
      logs.push(makeLog(ctx, r, system, 'offer_lapsed', 'offered', 'changes_requested', null, 'The hold ended before the offer was accepted.', now))
      drafts.push(...offerLapsedEmails({ ...mail, request: updated }))
      continue
    }
    if (r.status === 'pending' && r.overdueNotified !== r.stageIndex && overdueHours(ctx, r, now) > 0) {
      const stage = r.stages[r.stageIndex]
      requests.push({ ...r, overdueNotified: r.stageIndex })
      if (stage) {
        drafts.push(...overdueEmails(mail, stage, officeLabel(ctx.settings, stage)))
        logs.push(makeLog(ctx, r, system, 'auto_checked', 'pending', 'pending', officeLabel(ctx.settings, stage), 'Overdue notice sent.', now, true))
      }
    }
  }
  return { requests, logs, emails: finalize(drafts, ctx, now) }
}

/* ------------------------------------------------------------------ */
/* Submission and direct booking                                       */
/* ------------------------------------------------------------------ */

function baseRequest(draft: RequestDraft, ctx: EngineContext, now: string, stages: OfficeId[], source: 'request' | 'direct'): BookingRequest {
  return {
    id: ctx.newId('request'),
    organisationId: draft.organisationId,
    submittedBy: draft.submittedBy,
    eventName: draft.eventName.trim(),
    category: draft.category,
    description: draft.description,
    roomId: draft.roomId,
    date: draft.date,
    startMin: draft.startMin,
    endMin: draft.endMin,
    expectedAttendance: draft.expectedAttendance,
    needs: draft.needs ?? [],
    status: 'pending',
    source,
    stages,
    stageIndex: 0,
    stageEnteredAt: now,
    offer: null,
    escalated: false,
    autoApprovedBy: null,
    amsSyncedAt: null,
    previous: null,
    overdueNotified: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function checkDraft(draft: RequestDraft, ctx: EngineContext): TransitionError | null {
  if (!ctx.organisations.some((o) => o.id === draft.organisationId)) return fail(400, 'Unknown organisation.')
  const invalid = validateSlot(draft, ctx)
  if (invalid) return fail(400, invalid)
  if (!Number.isInteger(draft.expectedAttendance) || draft.expectedAttendance < 1) return fail(400, 'Expected attendance must be at least 1.')
  if (draft.eventName.trim().length === 0) return fail(400, 'Event name is required.')
  return null
}

/**
 * Creates a request, snapshots its chain, runs the automatic checks, queues
 * emails and auto-approves when a rule allows it. `ctx.requests` must not
 * contain the new request yet.
 */
export function submitRequest(draft: RequestDraft, ctx: EngineContext, now: string): SubmitSuccess | TransitionError {
  const bad = checkDraft(draft, ctx)
  if (bad) return bad
  const organisation = ctx.organisations.find((o) => o.id === draft.organisationId)
  if (!organisation) return fail(400, 'Unknown organisation.')
  const stages = resolveStages(organisation, draft.category, ctx.settings.workflows)
  const created = baseRequest(draft, ctx, now, stages, 'request')
  const all: EngineContext = { ...ctx, requests: [...ctx.requests, created] }
  const mail = mailContext(created, all)
  if (!mail) return fail(400, 'Unknown room.')

  const submitter = { email: draft.submittedBy, role: 'organisation' as const }
  const logs: ApprovalLog[] = [makeLog(ctx, created, submitter, 'submitted', null, 'pending', officeLabel(ctx.settings, stages[0]), null, now)]
  const flags = flagsFor(all, created, mail.room, now)
  const lane = laneFor(all, created, flags)
  logs.push(makeLog(ctx, created, { email: 'system', role: 'system' }, 'auto_checked', 'pending', 'pending', null, `Lane: ${lane}. ${flags.map((f) => f.title).join('; ') || 'Nothing to check.'}`, now, true))

  const auto = evaluateAutoApproval(all, created, now)
  if (auto) {
    const systemWho = { email: 'system', role: 'system' as const }
    const note = `Rule: ${auto.ruleName} (${auto.ruleId})`
    if (auto.effect === 'confirm') {
      const confirmed = bump(created, { status: 'confirmed', stageIndex: stages.length - 1, autoApprovedBy: auto.ruleId, amsSyncedAt: now }, now)
      logs.push(makeLog(ctx, created, systemWho, 'auto_approved', 'pending', 'confirmed', null, note, now))
      return { request: confirmed, logs, emails: finalize(autoApprovedEmails({ ...mail, request: confirmed }, auto.ruleName), ctx, now) }
    }
    const skipped = bump(created, { stageIndex: stages.length - 1, autoApprovedBy: auto.ruleId }, now)
    logs.push(makeLog(ctx, created, systemWho, 'auto_approved', 'pending', 'pending', null, note, now))
    return { request: skipped, logs, emails: finalize(submittedEmails({ ...mail, request: skipped }), ctx, now) }
  }
  return { request: created, logs, emails: finalize([...submittedEmails(mail), ...clashEmails(all, created)], ctx, now) }
}

/** Academic Booking or a super admin books a room for a non-club body (D18). */
export function directBooking(draft: RequestDraft, actor: Actor, ctx: EngineContext, now: string): SubmitSuccess | TransitionError {
  if (!actor.canOverride) return fail(403, 'Only Academic Booking or a super admin can book directly.')
  const bad = checkDraft(draft, ctx)
  if (bad) return bad
  const blockers = blockersIn(ctx, draft.roomId, draft.date, draft.startMin, draft.endMin).map((i) => describeBlocker(i, ctx))
  if (blockers.length > 0) return fail(409, blockedMessage(blockers), blockers)
  const created = { ...baseRequest(draft, ctx, now, ['acad'], 'direct'), status: 'confirmed' as const, amsSyncedAt: now }
  const mail = mailContext(created, { ...ctx, requests: [...ctx.requests, created] })
  if (!mail) return fail(400, 'Unknown room.')
  const who = { email: actor.email, role: logRole(actor) }
  return {
    request: created,
    logs: [makeLog(ctx, created, who, 'direct_booked', null, 'confirmed', 'Academic Booking', null, now)],
    emails: finalize(confirmedEmails(mail), ctx, now),
  }
}

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */

export function undoBatch(batch: BatchSnapshot, actor: Actor, ctx: EngineContext, now: string): TransitionResult {
  if (batch.undone) return fail(409, 'This was already undone.')
  if (batch.actorEmail !== actor.email) return fail(403, 'Only the person who made the change can undo it.')
  if (Date.parse(now) - Date.parse(batch.at) > ctx.settings.undoSeconds * 1000) return fail(409, 'The undo window has passed.')
  const restored: BookingRequest[] = []
  const logs: ApprovalLog[] = []
  for (const before of batch.before) {
    const current = ctx.requests.find((r) => r.id === before.id)
    if (!current) return fail(409, 'A request in this batch no longer exists.')
    if (current.version !== batch.afterVersions[before.id]) return fail(409, 'A request in this batch changed since, so it cannot be undone.')
    const back = { ...before, version: current.version + 1, updatedAt: now }
    restored.push(back)
    logs.push(makeLog(ctx, current, { email: actor.email, role: logRole(actor) }, 'undone', current.status, back.status, null, 'Change undone within the undo window.', now))
  }
  return { requests: restored, logs, emails: [] }
}
