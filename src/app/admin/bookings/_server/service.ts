import type {
  Actor,
  ActionInput,
  ActionOutcome,
  ActivityItem,
  ApprovalLog,
  BookingRequest,
  BookingSettings,
  CalendarData,
  CalendarFilters,
  CalendarItem,
  ConflictGroupView,
  ConflictMemberView,
  EngineContext,
  FreeRoomQuery,
  Organisation,
  OrganisationRecord,
  OrganisationStats,
  OverviewData,
  RoomUsageItem,
  OutboxEmail,
  RequestDetail,
  RequestDraft,
  RequestFilters,
  RequestRow,
  ResolveInput,
  ResolveOutcome,
  Room,
  ServiceResult,
  TimelineBlock,
  TransitionError,
} from '../types'
import { actsForFinalAuthority, canResolveConflicts, needsMyAction, visibilityOf } from './access'
import { freeRooms, roomDaySchedule } from './engine/availability'
import { conflictsFor, findConflictGroups, findGroupById, findGroupContaining, warningsFor } from './engine/conflicts'
import { rankGroup } from './engine/priority'
import { availableActions, submitRequest, transition } from './engine/workflow'
import { addDays, endOfMonth, IST_OFFSET_MIN, startOfMonth, startOfWeek, todayIST } from '../utils'
import { KeyedMutex, lockKey } from './lock'
import { getBookingRepository, type BookingRepository } from './repo'

/**
 * The only caller of the repository. Every mutation takes the room-date lock,
 * loads fresh data, runs the engine, checks versions, then saves requests,
 * logs and outbox together.
 */

const ID_LOCK = '__ids__'
const MAX_LOCK_RETRIES = 3

function failure(code: 400 | 403 | 404 | 409, error: string, blocking?: BookingRequest[]): ServiceResult<never> {
  return blocking ? { ok: false, code, error, blocking } : { ok: false, code, error }
}

function fromEngineError(e: TransitionError): ServiceResult<never> {
  return failure(e.code, e.error, e.blocking)
}

let idCounter = 0
function runtimeId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`
}

function nextRequestId(requests: BookingRequest[], nowIso: string): string {
  let max = 0
  for (const r of requests) {
    const match = /^BK-\d{4}-(\d+)$/.exec(r.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `BK-${nowIso.slice(0, 4)}-${String(max + 1).padStart(4, '0')}`
}

export class BookingService {
  private readonly mutex = new KeyedMutex()

  constructor(
    private readonly repo: BookingRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  /* ---------------- Context ---------------- */

  private async loadContext(): Promise<EngineContext> {
    const [settings, rooms, organisations, requests] = await Promise.all([
      this.repo.getSettings(),
      this.repo.listRooms(),
      this.repo.listOrganisations(),
      this.repo.listRequests(),
    ])
    const now = this.clock()
    return {
      settings,
      rooms,
      organisations,
      requests,
      newId: (kind) => (kind === 'request' ? nextRequestId(requests, now) : runtimeId(kind === 'log' ? 'LOG' : 'EM')),
    }
  }

  private async persist(
    requests: BookingRequest[],
    logs: ApprovalLog[],
    emails: OutboxEmail[],
  ): Promise<void> {
    if (requests.length > 0) await this.repo.saveRequests(requests)
    if (logs.length > 0) await this.repo.appendLogs(logs)
    if (emails.length > 0) await this.repo.appendOutbox(emails)
  }

  /**
   * Locks the request's room and date, plus any extra keys, then runs `task`.
   * If the request moved between the first read and the lock, tries again with
   * the right keys.
   */
  private async withRequestLock<T>(
    requestId: string,
    extraKeys: string[],
    task: () => Promise<ServiceResult<T>>,
  ): Promise<ServiceResult<T>> {
    for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
      const before = await this.repo.getRequest(requestId)
      if (!before) return failure(404, 'Request not found.')
      const keys = [lockKey(before.roomId, before.date), ...extraKeys]
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
    return failure(409, 'This request changed while you were looking at it. Reloaded with the latest version.')
  }

  /* ---------------- Mutations ---------------- */

  async submit(draft: RequestDraft): Promise<ServiceResult<ActionOutcome>> {
    const release = await this.mutex.acquire([lockKey(draft.roomId, draft.date), ID_LOCK])
    try {
      const ctx = await this.loadContext()
      const result = submitRequest(draft, ctx, this.clock())
      if ('error' in result) return fromEngineError(result)
      await this.persist([result.request], result.logs, result.emails)
      return { ok: true, data: { request: result.request, logs: result.logs, emails: result.emails } }
    } finally {
      release()
    }
  }

  async performAction(actor: Actor, requestId: string, input: ActionInput): Promise<ServiceResult<ActionOutcome>> {
    const extraKeys: string[] = []
    if (input.action === 'resubmit' && input.changes) {
      const current = await this.repo.getRequest(requestId)
      if (current) {
        extraKeys.push(lockKey(input.changes.roomId ?? current.roomId, input.changes.date ?? current.date))
      }
    }
    return this.withRequestLock(requestId, extraKeys, async () => {
      const ctx = await this.loadContext()
      const request = ctx.requests.find((r) => r.id === requestId)
      if (!request) return failure(404, 'Request not found.')
      if (visibilityOf(actor, request, ctx.requests, ctx.settings) === 'none') {
        return failure(403, 'You cannot act on this request.')
      }
      const result = transition(request, input, actor, ctx, this.clock())
      if ('error' in result) return fromEngineError(result)
      const changed = input.action === 'remark' ? [] : [result.request, ...result.others]
      await this.persist(changed, result.logs, result.emails)
      return { ok: true, data: { request: result.request, logs: result.logs, emails: result.emails } }
    })
  }

  /** Decide a whole conflict group at once. All or nothing. */
  async resolveConflict(
    actor: Actor,
    groupId: string,
    input: ResolveInput,
    dryRun = false,
  ): Promise<ServiceResult<ResolveOutcome>> {
    const pre = await this.loadContext()
    if (!canResolveConflicts(actor, pre.settings)) {
      return failure(403, 'Only Academic Booking or a super admin can decide a conflict.')
    }
    const preGroup = findGroupById(groupId, pre.requests, pre.settings)
    if (!preGroup) return failure(404, 'This conflict no longer exists.')
    const keys = [...new Set(preGroup.members.map((m) => lockKey(m.roomId, m.date)))]

    const release = await this.mutex.acquire(keys)
    try {
      const ctx = await this.loadContext()
      const now = this.clock()
      const group = findGroupContaining(input.winnerId, ctx.requests, ctx.settings)
      const stale = 'This conflict changed while you were looking at it. Reloaded with the latest version.'
      if (!group) return failure(409, stale)

      const memberIds = new Set(group.members.map((m) => m.id))
      const decided = [input.winnerId, ...input.others.map((o) => o.id)]
      if (new Set(decided).size !== decided.length) return failure(400, 'Each request can be decided once.')
      if (decided.some((id) => !memberIds.has(id))) return failure(409, stale)

      for (const id of decided) {
        const member = group.members.find((m) => m.id === id)
        if (!member || input.versions[id] !== member.version) return failure(409, stale)
      }
      const uncovered = group.members.filter(
        (m) => m.status === 'pending' && m.id !== input.winnerId && !decided.includes(m.id),
      )
      if (uncovered.length > 0) {
        return failure(400, 'Every other pending request in the group needs a decision.')
      }

      let working = ctx.requests
      const logs: ApprovalLog[] = []
      const emails: OutboxEmail[] = []
      const changed = new Map<string, BookingRequest>()
      const apply = (updated: BookingRequest[]) => {
        for (const u of updated) changed.set(u.id, u)
        working = working.map((r) => updated.find((u) => u.id === r.id) ?? r)
      }

      for (const decision of input.others) {
        const target = working.find((r) => r.id === decision.id)
        if (!target) return failure(409, stale)
        const result = transition(
          target,
          {
            action: decision.action,
            version: target.version,
            reason: decision.reason,
            alternativeRoomId: decision.alternativeRoomId ?? null,
          },
          actor,
          { ...ctx, requests: working },
          now,
          { resolveGroup: true },
        )
        if ('error' in result) return fromEngineError(result)
        apply([result.request, ...result.others])
        logs.push(...result.logs)
        emails.push(...result.emails)
      }

      const winner = working.find((r) => r.id === input.winnerId)
      if (!winner) return failure(409, stale)
      const won = transition(
        winner,
        { action: 'approve', version: winner.version },
        actor,
        { ...ctx, requests: working },
        now,
        { resolveGroup: true },
      )
      if ('error' in won) return fromEngineError(won)
      apply([won.request, ...won.others])
      logs.push(...won.logs)
      emails.push(...won.emails)

      const outcome: ResolveOutcome = { requests: [...changed.values()], logs, emails }
      if (!dryRun) await this.persist(outcome.requests, logs, emails)
      return { ok: true, data: outcome }
    } finally {
      release()
    }
  }

  async saveSettings(actor: Actor, settings: BookingSettings): Promise<ServiceResult<BookingSettings>> {
    if (!actor.canEditSettings) return failure(403, 'Only a super admin can change settings.')
    await this.repo.saveSettings(settings)
    return { ok: true, data: settings }
  }

  async reset(): Promise<void> {
    await this.repo.reset()
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

  async getOutbox(
    actor: Actor,
    filter: { trigger?: string; requestId?: string } = {},
  ): Promise<OutboxEmail[]> {
    const [emails, ctx] = await Promise.all([this.repo.listOutbox(), this.loadContext()])
    const visible = new Set(
      ctx.requests
        .filter((r) => visibilityOf(actor, r, ctx.requests, ctx.settings) === 'full')
        .map((r) => r.id),
    )
    return emails.filter(
      (e) =>
        visible.has(e.requestId) &&
        (!filter.trigger || e.trigger === filter.trigger) &&
        (!filter.requestId || e.requestId === filter.requestId),
    )
  }

  async daySchedule(roomId: string, date: string): Promise<TimelineBlock[]> {
    const ctx = await this.loadContext()
    return roomDaySchedule(roomId, date, ctx.requests, ctx.settings)
  }

  async findFreeRooms(query: FreeRoomQuery): Promise<Room[]> {
    const ctx = await this.loadContext()
    return freeRooms(query, ctx.rooms, ctx.requests, ctx.settings.changeoverBufferMin)
  }

  async listRequests(
    actor: Actor,
    filters: RequestFilters,
  ): Promise<{ rows: RequestRow[]; counts: Record<RequestFilters['tab'], number> }> {
    const ctx = await this.loadContext()
    const { settings, rooms, organisations, requests } = ctx
    const rows: Array<RequestRow & { tab: Set<RequestFilters['tab']> }> = []

    for (const request of requests) {
      if (visibilityOf(actor, request, requests, settings) !== 'full') continue
      const org = organisations.find((o) => o.id === request.organisationId)
      const room = rooms.find((r) => r.id === request.roomId)
      if (!org || !room) continue
      if (filters.dateFrom && request.date < filters.dateFrom) continue
      if (filters.dateTo && request.date > filters.dateTo) continue
      if (filters.organisationId && request.organisationId !== filters.organisationId) continue
      if (filters.building && room.building !== filters.building) continue
      if (filters.roomId && request.roomId !== filters.roomId) continue
      if (filters.category && request.category !== filters.category) continue
      if (filters.status && request.status !== filters.status) continue
      if (filters.stage && request.stages[request.stageIndex] !== filters.stage) continue
      const conflictCount = conflictsFor(request.id, requests, settings).length
      if (filters.conflictsOnly && conflictCount === 0) continue

      const mine = needsMyAction(actor, request)
      const tabs = new Set<RequestFilters['tab']>(['all'])
      if (mine) tabs.add('needs_action')
      if ((request.status === 'pending' && !mine) || request.status === 'changes_requested') tabs.add('others')
      if (request.status === 'confirmed') tabs.add('confirmed')
      if (['rejected', 'withdrawn', 'cancelled', 'displaced'].includes(request.status)) tabs.add('closed')

      const category = settings.categories.find((c) => c.id === request.category)
      const stage = request.stages[request.stageIndex]
      const stageName = settings.authorities.find((a) => a.id === stage)?.shortLabel ?? ''
      rows.push({
        request,
        organisationName: org.name,
        authorityId: org.authorityId,
        roomLabel: `${room.building} · ${room.name}`,
        building: room.building,
        categoryLabel: category?.label ?? request.category,
        tier: category?.tier ?? 99,
        stageLabel:
          request.status === 'pending'
            ? `${request.stageIndex + 1} of ${request.stages.length} · ${stageName}`
            : request.status === 'confirmed'
              ? 'Complete'
              : '',
        conflictCount,
        needsMyAction: mine,
        tab: tabs,
      })
    }

    const counts: Record<RequestFilters['tab'], number> = {
      needs_action: 0,
      others: 0,
      confirmed: 0,
      closed: 0,
      all: 0,
    }
    for (const row of rows) for (const t of row.tab) counts[t] += 1

    const selected = rows
      .filter((row) => row.tab.has(filters.tab))
      .sort(
        (a, b) =>
          a.request.date.localeCompare(b.request.date) ||
          a.request.startMin - b.request.startMin ||
          a.request.id.localeCompare(b.request.id),
      )
      .map(({ tab: _tab, ...row }) => row)
    return { rows: selected, counts }
  }

  async getDetail(actor: Actor, id: string): Promise<ServiceResult<RequestDetail>> {
    const ctx = await this.loadContext()
    const { settings, rooms, organisations, requests } = ctx
    const request = requests.find((r) => r.id === id)
    if (!request) return failure(404, 'Request not found.')
    const visibility = visibilityOf(actor, request, requests, settings)
    if (visibility === 'none') return failure(404, 'Request not found.')
    const organisation = organisations.find((o) => o.id === request.organisationId)
    const room = rooms.find((r) => r.id === request.roomId)
    if (!organisation || !room) return failure(404, 'This request points to missing data.')

    const group = findGroupContaining(id, requests, settings)
    const allLogs = await this.repo.listLogs(id)
    const category = settings.categories.find((c) => c.id === request.category)
    return {
      ok: true,
      data: {
        request,
        visibility,
        organisation,
        room,
        categoryLabel: category?.label ?? request.category,
        logs: visibility === 'full' ? allLogs : allLogs.filter((l) => !l.internal),
        conflicts: conflictsFor(id, requests, settings),
        groupId: group?.id ?? null,
        ranks: group ? rankGroup(group.members.filter((m) => m.status !== 'confirmed'), settings.categories) : [],
        warnings: warningsFor(request, room),
        alternatives: freeRooms(
          {
            date: request.date,
            startMin: request.startMin,
            endMin: request.endMin,
            minCapacity: request.expectedAttendance,
            preferBuilding: room.building,
            excludeRoomId: room.id,
            excludeRequestId: request.id,
          },
          rooms,
          requests,
          settings.changeoverBufferMin,
        ).slice(0, 5),
        schedule: roomDaySchedule(request.roomId, request.date, requests, settings),
        actions: visibility === 'full' ? availableActions(request, actor, ctx) : [],
        lookups: {
          organisations,
          authorities: settings.authorities,
          categories: settings.categories,
          rooms,
        },
      },
    }
  }

  async getOrganisationStats(actor: Actor): Promise<OrganisationStats[]> {
    const ctx = await this.loadContext()
    const { settings, organisations, requests } = ctx
    const visible = requests.filter((r) => visibilityOf(actor, r, requests, settings) === 'full')
    return organisations.map((organisation) => {
      const own = visible.filter((r) => r.organisationId === organisation.id)
      const uses = new Map<string, number>()
      for (const r of own) uses.set(r.roomId, (uses.get(r.roomId) ?? 0) + 1)
      const top = [...uses.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      return {
        organisation,
        requests: own.length,
        confirmed: own.filter((r) => r.status === 'confirmed').length,
        rejected: own.filter((r) => r.status === 'rejected').length,
        cancellations: own.filter((r) => r.status === 'cancelled').length,
        displaced: own.filter((r) => r.status === 'displaced').length,
        autoApproved: own.filter((r) => r.autoApprovedBy !== null).length,
        mostUsedRoomId: top ? top[0] : null,
        lastRequestAt: own.map((r) => r.createdAt).sort().pop() ?? null,
      }
    })
  }

  async getOverview(actor: Actor): Promise<OverviewData> {
    const ctx = await this.loadContext()
    const { settings, rooms, organisations, requests } = ctx
    const nowIso = this.clock()
    const today = todayIST(nowIso)
    const nowLocal = new Date(Date.parse(nowIso) + IST_OFFSET_MIN * 60_000)
    const nowMin = nowLocal.getUTCHours() * 60 + nowLocal.getUTCMinutes()

    const { rows, counts } = await this.listRequests(actor, { tab: 'needs_action' })
    const conflictGroups = await this.listConflictGroups(actor)
    const visible = requests.filter((r) => visibilityOf(actor, r, requests, settings) === 'full')
    const weekEnd = addDays(today, 7)
    const monthAgo = Date.parse(nowIso) - 30 * 86_400_000

    const usage = (r: BookingRequest): RoomUsageItem => {
      const room = rooms.find((x) => x.id === r.roomId)
      return {
        roomLabel: room ? `${room.building} · ${room.name}` : r.roomId,
        eventName: r.eventName,
        startMin: r.startMin,
        endMin: r.endMin,
        requestId: r.id,
      }
    }
    const todays = requests.filter((r) => r.status === 'confirmed' && r.date === today)
    const bookedMin = todays.reduce((sum, r) => sum + (r.endMin - r.startMin), 0)
    const openMin = rooms.reduce((sum, r) => sum + (r.openUntilMin - r.openFromMin), 0)

    const logs = await this.repo.listLogs()
    const visibleIds = new Set(visible.map((r) => r.id))
    const activity: ActivityItem[] = logs
      .filter((l) => visibleIds.has(l.requestId))
      .slice(-10)
      .reverse()
      .map((l) => {
        const request = requests.find((r) => r.id === l.requestId)
        const who =
          l.actorAuthority === 'system'
            ? 'System'
            : l.actorAuthority === 'organisation'
              ? (organisations.find((o) => o.id === request?.organisationId)?.name ?? 'Organisation')
              : l.actorAuthority === 'superadmin'
                ? 'Super admin'
                : (settings.authorities.find((a) => a.id === l.actorAuthority)?.shortLabel ?? l.actorAuthority)
        const name = `"${request?.eventName ?? l.requestId}"`
        let text: string
        switch (l.action) {
          case 'submitted':
            text = `${who} submitted ${name}`
            break
          case 'forwarded': {
            const idx = request?.stages.findIndex((s) => settings.authorities.find((a) => a.id === s)?.shortLabel === l.stageLabel) ?? -1
            const next = idx >= 0 ? request?.stages[idx + 1] : undefined
            const nextLabel = settings.authorities.find((a) => a.id === next)?.shortLabel
            text = `${who} forwarded ${name}${nextLabel ? ` to ${nextLabel}` : ''}`
            break
          }
          case 'escalated':
            text = `${who} escalated ${name}`
            break
          case 'confirmed':
            text = `${who} confirmed ${name}`
            break
          case 'override_confirmed':
            text = `${who} confirmed ${name} by override`
            break
          case 'auto_approved':
            text = `${name} was auto-approved`
            break
          case 'rejected':
            text = `${who} rejected ${name}`
            break
          case 'changes_requested':
            text = `${who} requested changes to ${name}`
            break
          case 'resubmitted':
            text = `${who} resubmitted ${name}`
            break
          case 'cancelled':
            text = `${who} cancelled ${name}`
            break
          case 'displaced':
            text = `${name} was displaced`
            break
          case 'withdrawn':
            text = `${who} withdrew ${name}`
            break
          default:
            text = `${who} added a remark on ${name}`
        }
        return { id: l.id, text, at: l.at, requestId: l.requestId, internal: l.internal }
      })

    return {
      today,
      needsAction: counts.needs_action,
      openConflicts: conflictGroups.length,
      confirmedNext7Days: visible.filter((r) => r.status === 'confirmed' && r.date >= today && r.date <= weekEnd).length,
      rejectedLast30Days: visible.filter((r) => r.status === 'rejected' && Date.parse(r.updatedAt) >= monthAgo).length,
      needsActionRows: rows.slice(0, 6),
      conflictGroups: conflictGroups.slice(0, 3),
      inUseNow: todays.filter((r) => r.startMin <= nowMin && nowMin < r.endMin).map(usage),
      nextUp: todays
        .filter((r) => r.startMin > nowMin)
        .sort((a, b) => a.startMin - b.startMin)
        .slice(0, 5)
        .map(usage),
      utilisationPercent: openMin === 0 ? 0 : Math.round((bookedMin / openMin) * 100),
      activity,
    }
  }

  async getCalendar(actor: Actor, f: CalendarFilters): Promise<CalendarData> {
    const ctx = await this.loadContext()
    const { settings, rooms, organisations, requests } = ctx
    const rangeFrom = f.view === 'day' ? f.date : f.view === 'week' ? startOfWeek(f.date) : startOfMonth(f.date)
    const rangeTo = f.view === 'day' ? f.date : f.view === 'week' ? addDays(rangeFrom, 6) : endOfMonth(f.date)

    const shownRooms = rooms.filter(
      (r) =>
        (!f.building || r.building === f.building) &&
        (!f.floor || r.floor === f.floor) &&
        (!f.roomId || r.id === f.roomId),
    )
    const roomIds = new Set(shownRooms.map((r) => r.id))
    const groups = findConflictGroups(requests, settings)
    const inConflict = new Set<string>()
    const conflictDates = new Set<string>()
    for (const g of groups) {
      for (const m of g.members) inConflict.add(m.id)
      if (g.isOpen && g.date >= rangeFrom && g.date <= rangeTo) conflictDates.add(g.date)
    }

    const items: CalendarItem[] = []
    for (const r of requests) {
      if (!roomIds.has(r.roomId) || r.date < rangeFrom || r.date > rangeTo) continue
      if (!['pending', 'changes_requested', 'confirmed'].includes(r.status)) continue
      if (f.status && r.status !== f.status) continue
      if (f.organisationId && r.organisationId !== f.organisationId) continue
      if (f.category && r.category !== f.category) continue
      items.push({
        id: r.id,
        eventName: r.eventName,
        organisationName: organisations.find((o) => o.id === r.organisationId)?.name ?? r.organisationId,
        roomId: r.roomId,
        date: r.date,
        startMin: r.startMin,
        endMin: r.endMin,
        status: r.status,
        inConflict: inConflict.has(r.id),
        canOpen: visibilityOf(actor, r, requests, settings) !== 'none',
      })
    }
    return { rooms: shownRooms, items, rangeFrom, rangeTo, conflictDates: [...conflictDates] }
  }

  async listConflictGroups(actor: Actor): Promise<ConflictGroupView[]> {
    const ctx = await this.loadContext()
    const views: ConflictGroupView[] = []
    for (const group of findConflictGroups(ctx.requests, ctx.settings)) {
      if (!group.isOpen) continue
      const view = this.buildGroupView(actor, group.id, ctx)
      if (view) views.push(view)
    }
    return views
  }

  async getConflictGroup(actor: Actor, groupId: string): Promise<ServiceResult<ConflictGroupView>> {
    const ctx = await this.loadContext()
    const view = this.buildGroupView(actor, groupId, ctx)
    return view ? { ok: true, data: view } : failure(404, 'This conflict no longer exists.')
  }

  private buildGroupView(actor: Actor, groupId: string, ctx: EngineContext): ConflictGroupView | null {
    const { settings, rooms, organisations, requests } = ctx
    const group = findGroupById(groupId, requests, settings)
    if (!group) return null
    const visibilities = group.members.map((m) => visibilityOf(actor, m, requests, settings))
    if (visibilities.every((v) => v === 'none')) return null
    const room = rooms.find((r) => r.id === group.roomId)
    if (!room) return null

    const ranks = rankGroup(group.members, settings.categories)
    const members: ConflictMemberView[] = []
    for (const member of group.members) {
      const organisation = organisations.find((o) => o.id === member.organisationId)
      const rank = ranks.find((r) => r.requestId === member.id)
      if (!organisation || !rank) continue
      const visibility = visibilityOf(actor, member, requests, settings)
      const category = settings.categories.find((c) => c.id === member.category)
      const stage = member.stages[member.stageIndex]
      const own = requests.filter((r) => r.organisationId === member.organisationId)
      const record: OrganisationRecord = {
        requests: own.length,
        confirmed: own.filter((r) => r.status === 'confirmed').length,
        rejected: own.filter((r) => r.status === 'rejected').length,
        cancelled: own.filter((r) => r.status === 'cancelled').length,
      }
      members.push({
        request: member,
        organisation,
        categoryLabel: category?.label ?? member.category,
        rank,
        stageLabel:
          member.status === 'pending'
            ? (settings.authorities.find((a) => a.id === stage)?.shortLabel ?? '')
            : member.status === 'confirmed'
              ? 'Confirmed'
              : '',
        record,
        alternatives: freeRooms(
          {
            date: member.date,
            startMin: member.startMin,
            endMin: member.endMin,
            minCapacity: member.expectedAttendance,
            preferBuilding: room.building,
            excludeRoomId: room.id,
            excludeRequestId: member.id,
          },
          rooms,
          requests,
          settings.changeoverBufferMin,
        ).slice(0, 8),
        visibility,
        actions: visibility === 'full' ? availableActions(member, actor, ctx) : [],
      })
    }

    const softRanks = rankGroup(
      group.members.filter((m) => m.status === 'pending'),
      settings.categories,
    )
    return {
      group,
      room,
      members,
      suggestedWinnerId: softRanks[0]?.requestId ?? null,
      canResolve: actsForFinalAuthority(actor, settings),
    }
  }
}

/* ---------------- Singleton for the app ---------------- */

const GLOBAL_KEY = '__bookingService__'
type GlobalWithService = typeof globalThis & { [GLOBAL_KEY]?: BookingService }

export function getBookingService(): BookingService {
  const holder = globalThis as GlobalWithService
  const existing = holder[GLOBAL_KEY]
  if (existing) return existing
  const created = new BookingService(getBookingRepository())
  holder[GLOBAL_KEY] = created
  return created
}
