import type {
  EngineContext,
  FreeRoom,
  FreeRoomQuery,
  Room,
  RoomsDayData,
  RoomsDayQuery,
  TimelineBlock,
} from '../../types'
import { allClashGroups, occupancy, slotsOverlap } from './occupancy'

/** Blocks for one room on one date, for the timeline strips and the Rooms grid. */
export function roomDay(ctx: EngineContext, roomId: string, date: string): TimelineBlock[] {
  const clashIds = new Set<string>()
  for (const g of allClashGroups(ctx)) {
    if (g.roomId !== roomId || g.date !== date) continue
    for (const m of g.members) clashIds.add(m.id)
  }
  return occupancy(ctx, roomId, date).map((item) => {
    if (item.kind === 'class' && item.block) {
      return {
        id: item.id,
        kind: 'class' as const,
        label: `${item.block.courseCode} ${item.block.title}`,
        startMin: item.startMin,
        endMin: item.endMin,
        requestId: null,
        inClash: false,
      }
    }
    const request = item.request
    return {
      id: item.id,
      kind: item.effect === 'competes' ? ('competes' as const) : item.effect === 'held' ? ('held' as const) : ('booked' as const),
      label: request?.eventName ?? item.id,
      startMin: item.startMin,
      endMin: item.endMin,
      requestId: request?.id ?? null,
      inClash: clashIds.has(item.id),
    }
  })
}

function roomHasNeeds(room: Room, needs: string[] | undefined): boolean {
  if (!needs || needs.length === 0) return true
  const have = room.features.map((f) => f.toLowerCase())
  return needs.every((n) => have.includes(n.toLowerCase()))
}

/**
 * Rooms with no booked, held or class overlap and enough seats. Same building
 * first, then same floor, then the smallest room that fits.
 */
export function freeRooms(ctx: EngineContext, q: FreeRoomQuery, anchor?: Room): FreeRoom[] {
  const buffer = ctx.settings.changeoverBufferMin
  const out: FreeRoom[] = []
  for (const room of ctx.rooms) {
    if (room.id === q.excludeRoomId) continue
    if (room.capacity < q.minSeats) continue
    if (q.building && room.building !== q.building) continue
    if (q.floor && room.floor !== q.floor) continue
    if (q.forClubs && !room.bookableByClubs) continue
    if (q.startMin < room.openFromMin || q.endMin > room.openUntilMin) continue
    if (!roomHasNeeds(room, q.needs)) continue
    let blocked = false
    let competing = 0
    for (const item of occupancy(ctx, room.id, q.date)) {
      if (item.id === q.excludeRequestId || !slotsOverlap({ startMin: q.startMin, endMin: q.endMin }, item, buffer)) continue
      if (item.effect === 'competes') competing += 1
      else {
        blocked = true
        break
      }
    }
    if (!blocked) out.push({ room, competing })
  }
  return out.sort((a, b) => {
    const sameBuilding = (r: Room) => (anchor && r.building === anchor.building ? 0 : 1)
    const sameFloor = (r: Room) => (anchor && r.building === anchor.building && r.floor === anchor.floor ? 0 : 1)
    return (
      sameBuilding(a.room) - sameBuilding(b.room) ||
      sameFloor(a.room) - sameFloor(b.room) ||
      a.room.capacity - b.room.capacity ||
      a.room.id.localeCompare(b.room.id)
    )
  })
}

/** The Rooms grid for one date, with a free-in-window flag per room. */
export function roomsDay(ctx: EngineContext, q: RoomsDayQuery): RoomsDayData {
  const from = q.from ?? 0
  const to = q.to ?? 0
  const hasWindow = to > from
  const clashRooms = new Set(allClashGroups(ctx).filter((g) => g.date === q.date).map((g) => g.roomId))
  const rows = []
  let freeCount = 0
  for (const room of ctx.rooms) {
    if (q.building && room.building !== q.building) continue
    if (q.minSeats && room.capacity < q.minSeats) continue
    if (!roomHasNeeds(room, q.needs)) continue
    let freeInWindow = true
    let competingInWindow = 0
    if (hasWindow) {
      for (const item of occupancy(ctx, room.id, q.date)) {
        if (!slotsOverlap({ startMin: from, endMin: to }, item, ctx.settings.changeoverBufferMin)) continue
        if (item.effect === 'competes') competingInWindow += 1
        else freeInWindow = false
      }
      if (from < room.openFromMin || to > room.openUntilMin) freeInWindow = false
    }
    if (freeInWindow) freeCount += 1
    if (q.freeOnly && !freeInWindow) continue
    rows.push({ room, blocks: roomDay(ctx, room.id, q.date), freeInWindow, competingInWindow })
  }
  return {
    date: q.date,
    rows,
    total: ctx.rooms.length,
    freeCount,
    clashCount: [...clashRooms].length,
  }
}
