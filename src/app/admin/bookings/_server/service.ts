import type {
  Actor,
  ActionInput,
  AgendaFilters,
  AgendaRow,
  ApprovalLog,
  BatchSnapshot,
  Blocker,
  BookingRequest,
  BookingSettings,
  BulkResult,
  ClashGroupView,
  ClashMemberView,
  ClockState,
  EngineContext,
  FreeRoom,
  FreeRoomQuery,
  InboxData,
  InboxFilters,
  InboxRow,
  Lane,
  MonthDay,
  MutationOutcome,
  Organisation,
  OrgRow,
  OutboxEmail,
  RequestDetail,
  RequestDraft,
  ResolveInput,
  Room,
  RoomsDayData,
  RoomsDayQuery,
  ServiceResult,
  TransitionError,
  TimelineBlock,
  TransitionSuccess,
} from '../types'
import { addDays, endOfMonth, startOfMonth, startOfWeek, todayIST } from '../utils'
import { canResolveClashes, visibilityOf, waitingOnMe } from './access'
import { freeRooms, roomDay, roomsDay } from './engine/availability'
import { chipFor, flagsFor, laneFor, orgStanding, overdueHours } from './engine/flags'
import { allClashGroups, clashesFor, clashGroupContaining, findClashGroup } from './engine/occupancy'
import { rankGroup } from './engine/priority'
import { availableActions, directBooking, submitRequest, sweep, transition, undoBatch } from './engine/workflow'
import { KeyedMutex, lockKey } from './lock'
import { getBookingRepository, type BookingRepository } from './repo'

/**
 * The only caller of the repository. Every mutation runs the sweep, takes the
 * room-date locks, loads fresh data, runs the engine, checks versions, then
 * saves requests, logs, outbox and an undo snapshot together.
 */

const ID_LOCK = '__ids__'
const MAX_LOCK_RETRIES = 3
const PAGE_SIZE = 50
const LANE_ORDER: Record<Lane, number> = { clash: 0, look: 1, clear: 2 }

function failure(code: 400 | 403 | 404 | 409, error: string, blockers?: Blocker[]): ServiceResult<never> {
  return blockers && blockers.length > 0 ? { ok: false, code, error, blockers } : { ok: false, code, error }
}

function fromEngineError(e: TransitionError): ServiceResult<never> {
  return failure(e.code, e.error, e.blockers)
}

let idCounter = 0
function runtimeId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`
}

function nextRequestId(requests: BookingRequest[]): string {
  let max = 1000
  for (const r of requests) {
    const match = /^BK-(\d+)$/.exec(r.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `BK-${max + 1}`
}

export class BookingService {
  private readonly mutex = new KeyedMutex()
  private offsetMs = 0

  constructor(
    private readonly repo: BookingRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  /** The service's idea of now. The demo can move it forward. */
  now(): string {
    return new Date(Date.parse(this.clock()) + this.offsetMs).toISOString()
  }

  clockState(): ClockState {
    return { now: this.now(), offsetDays: Math.round(this.offsetMs / 86_400_000) }
  }

  /* ---------------- Context ---------------- */

  private async loadContext(): Promise<EngineContext> {
    const [settings, rooms, organisations, requests, timetable] = await Promise.all([
      this.repo.getSettings(),
      this.repo.listRooms(),
      this.repo.listOrganisations(),
      this.repo.listRequests(),
      this.repo.listTimetable(),
    ])
    return {
      settings,
      rooms,
      organisations,
      timetable,
      requests,
      newId: (kind) => (kind === 'request' ? nextRequestId(requests) : runtimeId(kind === 'log' ? 'LOG' : 'EM')),
    }
  }

  /** Lapses offers, expires started events and sends overdue notices. Cheap when nothing is due. */
  private async sweepNow(): Promise<void> {
    const ctx = await this.loadContext()
    const result = sweep(ctx, this.now())
    if (result.requests.length === 0 && result.logs.length === 0 && result.emails.length === 0) return
    await this.repo.saveRequests(result.requests)
    await this.repo.appendLogs(result.logs)
    await this.repo.appendOutbox(result.emails)
  }

  private async fresh(): Promise<EngineContext> {
    await this.sweepNow()
    return this.loadContext()
  }

  /** Saves a mutation and an undo snapshot, tagging logs and emails with one batch id. */
  private async commit(
    actor: Actor,
    kind: BatchSnapshot['kind'],
    ctx: EngineContext,
    changed: BookingRequest[],
    logs: ApprovalLog[],
    emails: OutboxEmail[],
  ): Promise<MutationOutcome> {
    const batchId = runtimeId('BATCH')
    const tagLogs = logs.map((l) => ({ ...l, batchId }))
    const tagEmails = emails.map((e) => ({ ...e, batchId }))
    const before = changed.map((c) => ctx.requests.find((r) => r.id === c.id)).filter((r): r is BookingRequest => r !== undefined)
    const afterVersions: Record<string, number> = {}
    for (const c of changed) afterVersions[c.id] = c.version
    await this.repo.saveRequests(changed)
    await this.repo.appendLogs(tagLogs)
    await this.repo.appendOutbox(tagEmails)
    await this.repo.saveBatch({ id: batchId, actorEmail: actor.email, at: this.now(), kind, before, afterVersions, undone: false })
    return { requests: changed, logs: tagLogs, emails: tagEmails, batchId }
  }

  private async withRequestLock<T>(requestId: string, extraKeys: string[], task: () => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
    for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
      const before = await this.repo.getRequest(requestId)
      if (!before) return failure(404, 'Request not found.')
      const keys = [lockKey(before.roomId, before.date), ...extraKeys]
      if (before.offer) keys.push(lockKey(before.offer.roomId, before.date))
      const release = await this.mutex.acquire(keys)
      try {
        const after = await this.repo.getRequest(requestId)
        if (!after) return failure(404, 'Request not found.')
        if (after.roomId !== before.roomId || after.date !== before.date) continue
        return await task()
      } finally {
        release()
      }
    }
    return failure(409, 'This request changed while you were looking at it. Reloaded.')
  }

  /* ---------------- Mutations ---------------- */

  async submit(draft: RequestDraft): Promise<ServiceResult<MutationOutcome>> {
    const release = await this.mutex.acquire([lockKey(draft.roomId, draft.date), ID_LOCK])
    try {
      const ctx = await this.fresh()
      const result = submitRequest(draft, ctx, this.now())
      if ('error' in result) return fromEngineError(result)
      const outcome = await this.commit({ email: draft.submittedBy } as Actor, 'single', ctx, [result.request], result.logs, result.emails)
      return { ok: true, data: outcome }
    } finally {
      release()
    }
  }

  async createDirectBooking(actor: Actor, draft: RequestDraft): Promise<ServiceResult<MutationOutcome>> {
    const release = await this.mutex.acquire([lockKey(draft.roomId, draft.date), ID_LOCK])
    try {
      const ctx = await this.fresh()
      const result = directBooking(draft, actor, ctx, this.now())
      if ('error' in result) return fromEngineError(result)
      return { ok: true, data: await this.commit(actor, 'single', ctx, [result.request], result.logs, result.emails) }
    } finally {
      release()
    }
  }

  async performAction(actor: Actor, requestId: string, input: ActionInput): Promise<ServiceResult<MutationOutcome>> {
    const extra: string[] = []
    const pre = await this.repo.getRequest(requestId)
    if (pre && input.action === 'offer_room' && input.roomId) extra.push(lockKey(input.roomId, pre.date))
    if (pre && input.action === 'resubmit' && input.changes) extra.push(lockKey(input.changes.roomId ?? pre.roomId, input.changes.date ?? pre.date))
    return this.withRequestLock(requestId, extra, async () => {
      const ctx = await this.fresh()
      const request = ctx.requests.find((r) => r.id === requestId)
      if (!request) return failure(404, 'Request not found.')
      if (visibilityOf(actor, request, ctx) === 'none') return failure(403, 'You cannot act on this request.')
      const result = transition(request, input, actor, ctx, this.now())
      if ('error' in result) return fromEngineError(result)
      if (input.action === 'note') {
        await this.repo.appendLogs(result.logs)
        return { ok: true, data: { requests: [], logs: result.logs, emails: [], batchId: '' } }
      }
      return { ok: true, data: await this.commit(actor, 'single', ctx, result.requests, result.logs, result.emails) }
    })
  }

  /** Approves only Clear requests, re-checking each one at action time (D11). */
  async bulkApprove(actor: Actor, items: Array<{ id: string; version: number }>): Promise<ServiceResult<BulkResult>> {
    const pre = await this.loadContext()
    const keys = new Set<string>()
    for (const item of items) {
      const r = pre.requests.find((x) => x.id === item.id)
      if (r) keys.add(lockKey(r.roomId, r.date))
    }
    const release = await this.mutex.acquire([...keys])
    try {
      const ctx = await this.fresh()
      let working = ctx.requests
      const approved: string[] = []
      const skipped: BulkResult['skipped'] = []
      const changed = new Map<string, BookingRequest>()
      const logs: ApprovalLog[] = []
      const emails: OutboxEmail[] = []
      const now = this.now()
      for (const item of items) {
        const wctx: EngineContext = { ...ctx, requests: working }
        const request = working.find((r) => r.id === item.id)
        if (!request) {
          skipped.push({ id: item.id, why: 'It no longer exists.' })
          continue
        }
        if (request.version !== item.version) {
          skipped.push({ id: item.id, why: 'It changed while you were looking.' })
          continue
        }
        const room = ctx.rooms.find((r) => r.id === request.roomId)
        const lane = room ? laneFor(wctx, request, flagsFor(wctx, request, room, now)) : 'look'
        if (lane !== 'clear') {
          skipped.push({ id: item.id, why: lane === 'clash' ? 'It now clashes with another request.' : 'It now needs a look.' })
          continue
        }
        const result = transition(request, { action: 'approve', version: request.version }, actor, wctx, now)
        if ('error' in result) {
          skipped.push({ id: item.id, why: result.error })
          continue
        }
        for (const c of result.requests) changed.set(c.id, c)
        working = working.map((r) => result.requests.find((c) => c.id === r.id) ?? r)
        logs.push(...result.logs)
        emails.push(...result.emails)
        approved.push(item.id)
      }
      if (approved.length === 0) return { ok: true, data: { approved, skipped, batchId: null } }
      const outcome = await this.commit(actor, 'bulk_approve', ctx, [...changed.values()], logs, emails)
      return { ok: true, data: { approved, skipped, batchId: outcome.batchId } }
    } finally {
      release()
    }
  }

  async undo(actor: Actor, batchId: string): Promise<ServiceResult<{ restored: number }>> {
    const batch = await this.repo.getBatch(batchId)
    if (!batch) return failure(404, 'Nothing to undo.')
    const keys = batch.before.map((r) => lockKey(r.roomId, r.date))
    const release = await this.mutex.acquire(keys)
    try {
      const ctx = await this.loadContext()
      const result = undoBatch(batch, actor, ctx, this.now())
      if ('error' in result) return fromEngineError(result)
      await this.repo.saveRequests(result.requests)
      await this.repo.appendLogs(result.logs)
      await this.repo.voidOutboxByBatch(batchId, 'Undone')
      await this.repo.saveBatch({ ...batch, undone: true })
      return { ok: true, data: { restored: result.requests.length } }
    } finally {
      release()
    }
  }

  /** Decide a whole clash at once. All or nothing, one batch. */
  async resolveClash(actor: Actor, groupId: string, input: ResolveInput, dryRun = false): Promise<ServiceResult<MutationOutcome>> {
    const pre = await this.loadContext()
    if (!canResolveClashes(actor, pre)) return failure(403, 'Only Academic Booking or a super admin can decide a clash.')
    const preGroup = findClashGroup(pre, groupId)
    if (!preGroup) return failure(404, 'This clash no longer exists.')
    const keys = [lockKey(preGroup.roomId, preGroup.date)]
    for (const d of input.others) {
      if (d.roomId) keys.push(lockKey(d.roomId, preGroup.date))
    }
    const release = await this.mutex.acquire(keys)
    try {
      const ctx = await this.fresh()
      const now = this.now()
      const stale = 'This clash changed while you were looking at it. Reloaded.'
      const group = clashGroupContaining(ctx, input.winnerId)
      if (!group) return failure(409, stale)
      const memberIds = new Set(group.members.map((m) => m.id))
      const decided = [input.winnerId, ...input.others.map((o) => o.id)]
      if (new Set(decided).size !== decided.length) return failure(400, 'Each request can be decided once.')
      if (decided.some((id) => !memberIds.has(id))) return failure(409, stale)
      for (const id of decided) {
        const member = group.members.find((m) => m.id === id)
        if (!member || input.versions[id] !== member.version) return failure(409, stale)
      }
      const uncovered = group.members.filter((m) => m.status === 'pending' && !decided.includes(m.id))
      if (uncovered.length > 0) return failure(400, 'Every other pending request in the clash needs a decision.')

      let working = ctx.requests
      const changed = new Map<string, BookingRequest>()
      const logs: ApprovalLog[] = []
      const emails: OutboxEmail[] = []
      const apply = (result: TransitionSuccess) => {
        for (const c of result.requests) changed.set(c.id, c)
        working = working.map((r) => result.requests.find((c) => c.id === r.id) ?? r)
        logs.push(...result.logs)
        emails.push(...result.emails)
      }
      for (const d of input.others) {
        const target = working.find((r) => r.id === d.id)
        if (!target) return failure(409, stale)
        const result = transition(
          target,
          { action: d.action, version: target.version, reason: d.reason, roomId: d.roomId },
          actor,
          { ...ctx, requests: working },
          now,
          { resolveGroup: true },
        )
        if ('error' in result) return fromEngineError(result)
        apply(result)
      }
      const winner = working.find((r) => r.id === input.winnerId)
      if (!winner) return failure(409, stale)
      const won = transition(winner, { action: 'approve', version: winner.version }, actor, { ...ctx, requests: working }, now, { resolveGroup: true })
      if ('error' in won) return fromEngineError(won)
      apply(won)

      if (dryRun) return { ok: true, data: { requests: [...changed.values()], logs, emails, batchId: '' } }
      return { ok: true, data: await this.commit(actor, 'resolve', ctx, [...changed.values()], logs, emails) }
    } finally {
      release()
    }
  }

  async saveSettings(actor: Actor, settings: BookingSettings): Promise<ServiceResult<BookingSettings>> {
    if (!actor.canEditRules) return failure(403, 'Only a super admin can change rules.')
    await this.repo.saveSettings(settings)
    return { ok: true, data: settings }
  }

  /* ---------------- Demo helpers ---------------- */

  async reset(): Promise<void> {
    this.offsetMs = 0
    await this.repo.reset()
  }

  async advanceDays(days: number): Promise<ClockState> {
    this.offsetMs += days * 86_400_000
    await this.sweepNow()
    return this.clockState()
  }

  /* ---------------- Reads ---------------- */

  async getSettings(): Promise<BookingSettings> {
    return this.repo.getSettings()
  }

  async listRooms(): Promise<Room[]> {
    return this.repo.listRooms()
  }

  async listOrganisations(): Promise<Organisation[]> {
    return this.repo.listOrganisations()
  }

  async getOutbox(actor: Actor, filter: { trigger?: string; requestId?: string } = {}): Promise<OutboxEmail[]> {
    const ctx = await this.fresh()
    const emails = await this.repo.listOutbox()
    const visible = new Set(ctx.requests.filter((r) => visibilityOf(actor, r, ctx) === 'full').map((r) => r.id))
    return emails.filter(
      (e) => visible.has(e.requestId) && (!filter.trigger || e.trigger === filter.trigger) && (!filter.requestId || e.requestId === filter.requestId),
    )
  }

  async getRoomsDay(query: RoomsDayQuery): Promise<RoomsDayData> {
    const ctx = await this.fresh()
    return roomsDay(ctx, query)
  }

  async findFree(query: FreeRoomQuery): Promise<FreeRoom[]> {
    const ctx = await this.fresh()
    const anchor = query.excludeRoomId ? ctx.rooms.find((r) => r.id === query.excludeRoomId) : undefined
    return freeRooms(ctx, query, anchor).slice(0, 12)
  }

  async getInbox(actor: Actor, f: InboxFilters): Promise<InboxData> {
    const ctx = await this.fresh()
    const now = this.now()
    const { settings, rooms, organisations, requests } = ctx
    const officeName = settings.offices.find((o) => o.id === actor.actingFor)?.label ?? 'you'
    const q = f.q?.trim().toLowerCase() ?? ''

    const rows: InboxRow[] = []
    let elsewhere = 0
    for (const request of requests) {
      if (request.status === 'pending' && !waitingOnMe(actor, request)) {
        const idx = request.stages.indexOf(actor.actingFor)
        if (idx >= 0 && idx < request.stageIndex) elsewhere += 1
        continue
      }
      if (!waitingOnMe(actor, request)) continue
      if (visibilityOf(actor, request, ctx) !== 'full') continue
      const organisation = organisations.find((o) => o.id === request.organisationId)
      const room = rooms.find((r) => r.id === request.roomId)
      if (!organisation || !room) continue
      if (f.office && organisation.officeId !== f.office) continue
      if (f.building && room.building !== f.building) continue
      if (f.category && request.category !== f.category) continue
      if (f.organisationId && request.organisationId !== f.organisationId) continue
      if (q) {
        const hay = `${request.id} ${request.eventName} ${organisation.name} ${room.building} ${room.name}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      const flags = flagsFor(ctx, request, room, now)
      const lane = laneFor(ctx, request, flags)
      const category = settings.categories.find((c) => c.id === request.category)
      rows.push({
        request,
        organisationName: organisation.name,
        kind: organisation.kind,
        categoryLabel: category?.label ?? request.category,
        tier: category?.tier ?? 99,
        roomLabel: `${room.building} ${room.name}`,
        lane,
        flags,
        overdueDays: Math.floor(overdueHours(ctx, request, now) / 24),
        chip: chipFor(lane, flags),
      })
    }
    rows.sort(
      (a, b) =>
        LANE_ORDER[a.lane] - LANE_ORDER[b.lane] ||
        (b.overdueDays > 0 ? 1 : 0) - (a.overdueDays > 0 ? 1 : 0) ||
        a.request.date.localeCompare(b.request.date) ||
        a.request.createdAt.localeCompare(b.request.createdAt),
    )
    const counts: Record<Lane, number> = { clash: 0, look: 0, clear: 0 }
    for (const r of rows) counts[r.lane] += 1
    const filtered = f.lane ? rows.filter((r) => r.lane === f.lane) : rows
    const page = Math.max(1, f.page ?? 1)
    const total = rows.length
    return {
      rows: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      counts,
      elsewhere,
      page,
      pageSize: PAGE_SIZE,
      total: filtered.length,
      summary: `${total} ${total === 1 ? 'request is' : 'requests are'} waiting on ${officeName}. ${counts.clear} ${counts.clear === 1 ? 'has' : 'have'} nothing to check.`,
    }
  }

  async getRequestDetail(actor: Actor, id: string): Promise<ServiceResult<RequestDetail>> {
    const ctx = await this.fresh()
    const now = this.now()
    const request = ctx.requests.find((r) => r.id === id)
    if (!request) return failure(404, 'Request not found.')
    const visibility = visibilityOf(actor, request, ctx)
    if (visibility === 'none') return failure(404, 'Request not found.')
    const organisation = ctx.organisations.find((o) => o.id === request.organisationId)
    const room = ctx.rooms.find((r) => r.id === request.roomId)
    if (!organisation || !room) return failure(404, 'This request points to missing data.')
    const flags = flagsFor(ctx, request, room, now)
    const group = clashGroupContaining(ctx, id)
    const category = ctx.settings.categories.find((c) => c.id === request.category)
    const logs = await this.repo.listLogs(id)
    return {
      ok: true,
      data: {
        request,
        organisation,
        standing: orgStanding(ctx, organisation, now),
        room,
        categoryLabel: category?.label ?? request.category,
        tier: category?.tier ?? 99,
        lane: laneFor(ctx, request, flags),
        flags,
        clashes: clashesFor(ctx, id),
        groupId: group?.id ?? null,
        ranks: group ? rankGroup(group.members, ctx.settings.categories) : [],
        roomDay: roomDay(ctx, request.roomId, request.date),
        alternatives: freeRooms(
          ctx,
          {
            date: request.date,
            startMin: request.startMin,
            endMin: request.endMin,
            minSeats: request.expectedAttendance,
            needs: request.needs,
            forClubs: organisation.kind === 'club' || organisation.kind === 'society',
            excludeRoomId: room.id,
            excludeRequestId: request.id,
          },
          room,
        ).slice(0, 3),
        actions: visibility === 'full' ? availableActions(ctx, request, actor, now) : [],
        logs: visibility === 'full' ? logs : logs.filter((l) => !l.internal),
        offices: ctx.settings.offices,
        clashOrgs: Object.fromEntries(
          clashesFor(ctx, id)
            .filter((c) => c.item.request !== null)
            .map((c) => [
              c.item.request?.id ?? '',
              ctx.organisations.find((o) => o.id === c.item.request?.organisationId)?.name ?? '',
            ]),
        ),
        visibility,
      },
    }
  }

  async listClashes(actor: Actor): Promise<ClashGroupView[]> {
    const ctx = await this.fresh()
    const views: ClashGroupView[] = []
    for (const group of allClashGroups(ctx)) {
      if (!group.members.some((m) => m.status === 'pending')) continue
      const view = this.buildClashView(actor, group.id, ctx)
      if (view) views.push(view)
    }
    return views
  }

  async getClash(actor: Actor, groupId: string): Promise<ServiceResult<ClashGroupView>> {
    const ctx = await this.fresh()
    const view = this.buildClashView(actor, groupId, ctx)
    return view ? { ok: true, data: view } : failure(404, 'This clash no longer exists.')
  }

  private buildClashView(actor: Actor, groupId: string, ctx: EngineContext): ClashGroupView | null {
    const group = findClashGroup(ctx, groupId)
    if (!group) return null
    const now = this.now()
    const room = ctx.rooms.find((r) => r.id === group.roomId)
    if (!room) return null
    const visibilities = group.members.map((m) => visibilityOf(actor, m, ctx))
    if (visibilities.every((v) => v === 'none')) return null
    const ranks = rankGroup(group.members, ctx.settings.categories)
    const members: ClashMemberView[] = []
    for (const member of group.members) {
      const organisation = ctx.organisations.find((o) => o.id === member.organisationId)
      const rank = ranks.find((r) => r.requestId === member.id)
      const visibility = visibilityOf(actor, member, ctx)
      if (!organisation || !rank || visibility === 'none') continue
      const category = ctx.settings.categories.find((c) => c.id === member.category)
      members.push({
        request: member,
        organisation,
        standing: orgStanding(ctx, organisation, now),
        categoryLabel: category?.label ?? member.category,
        tier: category?.tier ?? 99,
        rank,
        flags: flagsFor(ctx, member, room, now),
        alternatives: freeRooms(
          ctx,
          {
            date: member.date,
            startMin: member.startMin,
            endMin: member.endMin,
            minSeats: member.expectedAttendance,
            forClubs: organisation.kind === 'club' || organisation.kind === 'society',
            excludeRoomId: room.id,
            excludeRequestId: member.id,
          },
          room,
        ).slice(0, 6),
        visibility,
        actions: visibility === 'full' ? availableActions(ctx, member, actor, now) : [],
      })
    }
    const pending = group.members.filter((m) => m.status === 'pending')
    const oldest = Math.min(...group.members.map((m) => Date.parse(m.createdAt)))
    return {
      group,
      room,
      members,
      blockers: group.blockedBy.map((b) => ({
        kind: b.kind === 'class' ? 'class' : b.effect === 'held' ? 'held' : 'booked',
        label: b.block ? `${b.block.courseCode} ${b.block.title}` : (b.request?.eventName ?? b.id),
        requestId: b.request?.id ?? null,
        startMin: b.startMin,
        endMin: b.endMin,
      })),
      suggestedWinnerId: rankGroup(pending, ctx.settings.categories)[0]?.requestId ?? null,
      canResolve: canResolveClashes(actor, ctx),
      openHours: Math.max(0, Math.round((Date.parse(now) - oldest) / 3_600_000)),
      offices: ctx.settings.offices,
    }
  }

  async getOrganisations(actor: Actor): Promise<OrgRow[]> {
    const ctx = await this.fresh()
    const now = this.now()
    void actor
    return ctx.organisations.map((organisation) => {
      const standing = orgStanding(ctx, organisation, now)
      const room = ctx.rooms.find((r) => r.id === standing.mostUsedRoomId)
      return { organisation, standing, mostUsedRoom: room ? `${room.building} ${room.name}` : 'None' }
    })
  }

  /** For the sidebar badges. */
  async counts(actor: Actor): Promise<{ inbox: number; clashes: number }> {
    const inbox = await this.getInbox(actor, { page: 1 })
    const clashes = await this.listClashes(actor)
    return { inbox: inbox.counts.clash + inbox.counts.look + inbox.counts.clear, clashes: clashes.length }
  }

  /** Seven days of one room, Monday first. */
  async getRoomWeek(roomId: string, anchorDate: string): Promise<Array<{ date: string; blocks: TimelineBlock[] }>> {
    const ctx = await this.fresh()
    const monday = startOfWeek(anchorDate)
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i)
      return { date, blocks: roomDay(ctx, roomId, date) }
    })
  }

  /** Counts per day for a month grid. */
  async getMonth(anchorDate: string, building?: string): Promise<MonthDay[]> {
    const ctx = await this.fresh()
    const from = startOfMonth(anchorDate)
    const to = endOfMonth(anchorDate)
    const inBuilding = (roomId: string) => !building || ctx.rooms.find((r) => r.id === roomId)?.building === building
    const days = new Map<string, MonthDay>()
    for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, { date: d, confirmed: 0, waiting: 0, clashes: 0 })
    for (const r of ctx.requests) {
      const day = days.get(r.date)
      if (!day || !inBuilding(r.roomId)) continue
      if (r.status === 'confirmed') day.confirmed += 1
      else if (r.status === 'pending' || r.status === 'changes_requested' || r.status === 'offered') day.waiting += 1
    }
    for (const g of allClashGroups(ctx)) {
      const day = days.get(g.date)
      if (day && inBuilding(g.roomId) && g.members.some((m) => m.status === 'pending')) day.clashes += 1
    }
    return [...days.values()]
  }

  /** A day-by-day list of events in the next couple of weeks. */
  async getAgenda(actor: Actor, f: AgendaFilters): Promise<AgendaRow[]> {
    const ctx = await this.fresh()
    const from = todayIST(this.now())
    const to = addDays(from, f.days ?? 14)
    const q = f.q?.trim().toLowerCase() ?? ''
    const rows: AgendaRow[] = []
    for (const request of ctx.requests) {
      if (!['pending', 'changes_requested', 'offered', 'confirmed'].includes(request.status)) continue
      if (request.date < from || request.date > to) continue
      if (f.status && request.status !== f.status) continue
      if (f.category && request.category !== f.category) continue
      if (visibilityOf(actor, request, ctx) === 'none') continue
      const org = ctx.organisations.find((o) => o.id === request.organisationId)
      const room = ctx.rooms.find((r) => r.id === request.roomId)
      if (!org || !room) continue
      if (f.building && room.building !== f.building) continue
      if (q && !`${request.eventName} ${org.name} ${room.name} ${request.id}`.toLowerCase().includes(q)) continue
      rows.push({
        request,
        organisationName: org.name,
        roomLabel: `${room.building} ${room.name}`,
        categoryLabel: ctx.settings.categories.find((c) => c.id === request.category)?.label ?? request.category,
      })
    }
    return rows.sort((a, b) => a.request.date.localeCompare(b.request.date) || a.request.startMin - b.request.startMin).slice(0, 400)
  }

  today(): string {
    return todayIST(this.now())
  }

  daysFromToday(n: number): string {
    return addDays(this.today(), n)
  }
}

/* ---------------- Singleton for the app ---------------- */

const GLOBAL_KEY = '__bookingServiceV2__'
type GlobalWithService = typeof globalThis & { [GLOBAL_KEY]?: BookingService }

export function getBookingService(): BookingService {
  const holder = globalThis as GlobalWithService
  const existing = holder[GLOBAL_KEY]
  if (existing) return existing
  const created = new BookingService(getBookingRepository())
  holder[GLOBAL_KEY] = created
  return created
}
