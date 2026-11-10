import type {
  BookingRequest,
  ClashGroup,
  ClashItem,
  EngineContext,
  OccupancyItem,
  RoomEffect,
  TimetableBlock,
} from '../../types'

/**
 * Room effects, overlap and clash groups. Everything here reads the effect of
 * a status, never its label (principle 5):
 *   pending, changes_requested -> competes (no hold)
 *   offered                    -> held (on the offered room)
 *   confirmed                  -> booked
 *   everything else            -> none
 */

export function roomEffect(request: Pick<BookingRequest, 'status'>): RoomEffect {
  switch (request.status) {
    case 'pending':
    case 'changes_requested':
      return 'competes'
    case 'offered':
      return 'held'
    case 'confirmed':
      return 'booked'
    default:
      return 'none'
  }
}

/** Half-open intervals with an optional changeover buffer. */
export function slotsOverlap(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number },
  bufferMin: number,
): boolean {
  return a.startMin < b.endMin + bufferMin && b.startMin < a.endMin + bufferMin
}

export function roomDateKey(roomId: string, date: string): string {
  return `${roomId}|${date}`
}

function requestItem(request: BookingRequest): OccupancyItem | null {
  const effect = roomEffect(request)
  if (effect === 'none') return null
  const roomId = effect === 'held' ? (request.offer?.roomId ?? request.roomId) : request.roomId
  return {
    kind: 'request',
    id: request.id,
    roomId,
    date: request.date,
    startMin: request.startMin,
    endMin: request.endMin,
    effect,
    request,
    block: null,
  }
}

function classItem(block: TimetableBlock): OccupancyItem {
  return {
    kind: 'class',
    id: block.id,
    roomId: block.roomId,
    date: block.date,
    startMin: block.startMin,
    endMin: block.endMin,
    effect: 'booked',
    request: null,
    block,
  }
}

type Buckets = Map<string, OccupancyItem[]>

// Indexes are cached per array, so a service read builds them once.
const requestBuckets = new WeakMap<BookingRequest[], Buckets>()
const timetableBuckets = new WeakMap<readonly TimetableBlock[], Buckets>()
const groupCache = new WeakMap<BookingRequest[], ClashGroup[]>()

function push(map: Buckets, key: string, item: OccupancyItem): void {
  const list = map.get(key)
  if (list) list.push(item)
  else map.set(key, [item])
}

function requestIndex(requests: BookingRequest[]): Buckets {
  const cached = requestBuckets.get(requests)
  if (cached) return cached
  const map: Buckets = new Map()
  for (const r of requests) {
    const item = requestItem(r)
    if (item) push(map, roomDateKey(item.roomId, item.date), item)
  }
  requestBuckets.set(requests, map)
  return map
}

function timetableIndex(timetable: readonly TimetableBlock[]): Buckets {
  const cached = timetableBuckets.get(timetable)
  if (cached) return cached
  const map: Buckets = new Map()
  for (const b of timetable) push(map, roomDateKey(b.roomId, b.date), classItem(b))
  timetableBuckets.set(timetable, map)
  return map
}

/** Every item in one room on one date, classes included, sorted by start. */
export function occupancy(ctx: Pick<EngineContext, 'requests' | 'timetable'>, roomId: string, date: string): OccupancyItem[] {
  const key = roomDateKey(roomId, date)
  const items = [...(timetableIndex(ctx.timetable).get(key) ?? []), ...(requestIndex(ctx.requests).get(key) ?? [])]
  return items.sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id))
}

/** Items that already take the room: booked, held and classes. */
export function blockersIn(
  ctx: Pick<EngineContext, 'requests' | 'timetable' | 'settings'>,
  roomId: string,
  date: string,
  startMin: number,
  endMin: number,
  excludeRequestId?: string,
): OccupancyItem[] {
  const buffer = ctx.settings.changeoverBufferMin
  return occupancy(ctx, roomId, date).filter(
    (i) => i.effect !== 'competes' && i.id !== excludeRequestId && slotsOverlap({ startMin, endMin }, i, buffer),
  )
}

export function groupIdFor(roomId: string, date: string, members: BookingRequest[], blockers: OccupancyItem[]): string {
  const ids = [...members.map((m) => m.id), ...blockers.map((b) => b.id)].sort()
  return `${roomId}:${date}:${ids.join('+')}`
}

function groupsInBucket(ctx: EngineContext, roomId: string, date: string): ClashGroup[] {
  const items = occupancy(ctx, roomId, date)
  if (items.length < 2) return []
  const buffer = ctx.settings.changeoverBufferMin
  const parent = items.map((_, i) => i)
  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root] ?? root
    return root
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      if (!a || !b || !slotsOverlap(a, b, buffer)) continue
      parent[find(i)] = find(j)
    }
  }
  const components = new Map<number, OccupancyItem[]>()
  items.forEach((item, i) => {
    const root = find(i)
    const list = components.get(root)
    if (list) list.push(item)
    else components.set(root, [item])
  })
  const groups: ClashGroup[] = []
  for (const component of components.values()) {
    const competing = component.filter((c) => c.effect === 'competes' && c.request)
    if (competing.length === 0 || component.length < 2) continue
    const members = competing
      .map((c) => c.request as BookingRequest)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    const blockedBy = component.filter((c) => c.effect !== 'competes')
    groups.push({
      id: groupIdFor(roomId, date, members, blockedBy),
      roomId,
      date,
      startMin: Math.min(...component.map((c) => c.startMin)),
      endMin: Math.max(...component.map((c) => c.endMin)),
      members,
      blockedBy,
    })
  }
  return groups
}

/** Every clash group in the window. Cached per requests array. */
export function allClashGroups(ctx: EngineContext): ClashGroup[] {
  const cached = groupCache.get(ctx.requests)
  if (cached) return cached
  const seen = new Set<string>()
  const groups: ClashGroup[] = []
  for (const [key, items] of requestIndex(ctx.requests)) {
    if (!items.some((i) => i.effect === 'competes')) continue
    if (seen.has(key)) continue
    seen.add(key)
    const [roomId, date] = key.split('|')
    if (roomId && date) groups.push(...groupsInBucket(ctx, roomId, date))
  }
  groups.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.id.localeCompare(b.id))
  groupCache.set(ctx.requests, groups)
  return groups
}

export function clashGroupContaining(ctx: EngineContext, requestId: string): ClashGroup | null {
  const request = ctx.requests.find((r) => r.id === requestId)
  if (!request || roomEffect(request) !== 'competes') return null
  return groupsInBucket(ctx, request.roomId, request.date).find((g) => g.members.some((m) => m.id === requestId)) ?? null
}

export function findClashGroup(ctx: EngineContext, groupId: string): ClashGroup | null {
  return allClashGroups(ctx).find((g) => g.id === groupId) ?? null
}

/** What a request competes with: other requests, booked items, held offers and classes. */
export function clashesFor(ctx: EngineContext, requestId: string): ClashItem[] {
  const request = ctx.requests.find((r) => r.id === requestId)
  if (!request) return []
  const own = requestItem(request)
  if (!own || own.effect !== 'competes') return []
  const buffer = ctx.settings.changeoverBufferMin
  const out: ClashItem[] = []
  for (const item of occupancy(ctx, own.roomId, own.date)) {
    if (item.id === request.id || !slotsOverlap(own, item, buffer)) continue
    const kind: ClashItem['kind'] =
      item.kind === 'class' ? 'class' : item.effect === 'competes' ? 'competing_request' : item.effect === 'held' ? 'held' : 'booked'
    out.push({ kind, item })
  }
  return out
}
