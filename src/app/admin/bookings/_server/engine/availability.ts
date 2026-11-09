import type { BookingRequest, FreeRoomQuery, Room, TimelineBlock } from '../../types'
import { findConflictGroups } from './conflicts'
import { isActive, overlaps } from './overlap'
import type { BookingSettings } from '../../types'

/** Blocks for one room on one date, soonest first. */
export function roomDaySchedule(
  roomId: string,
  date: string,
  requests: BookingRequest[],
  settings?: BookingSettings,
): TimelineBlock[] {
  const inConflict = new Set<string>()
  if (settings) {
    for (const group of findConflictGroups(requests, settings)) {
      if (group.roomId !== roomId || group.date !== date) continue
      for (const m of group.members) inConflict.add(m.id)
    }
  }
  return requests
    .filter((r) => r.roomId === roomId && r.date === date && isActive(r.status))
    .sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id))
    .map((r) => ({
      requestId: r.id,
      eventName: r.eventName,
      organisationId: r.organisationId,
      status: r.status,
      startMin: r.startMin,
      endMin: r.endMin,
      inConflict: inConflict.has(r.id),
    }))
}

/**
 * Rooms with no confirmed or pending overlap and enough capacity.
 * Same building first, then closest capacity.
 */
export function freeRooms(
  query: FreeRoomQuery,
  rooms: Room[],
  requests: BookingRequest[],
  bufferMin: number,
): Room[] {
  const slot = { date: query.date, startMin: query.startMin, endMin: query.endMin }
  const free = rooms.filter((room) => {
    if (room.id === query.excludeRoomId) return false
    if (room.capacity < query.minCapacity) return false
    if (query.startMin < room.openFromMin || query.endMin > room.openUntilMin) return false
    return !requests.some(
      (r) =>
        r.id !== query.excludeRequestId &&
        (r.status === 'confirmed' || r.status === 'pending') &&
        overlaps({ roomId: room.id, ...slot }, r, bufferMin),
    )
  })
  return free.sort((a, b) => {
    const aSame = a.building === query.preferBuilding ? 0 : 1
    const bSame = b.building === query.preferBuilding ? 0 : 1
    if (aSame !== bSame) return aSame - bSame
    const capDiff = a.capacity - query.minCapacity - (b.capacity - query.minCapacity)
    if (capDiff !== 0) return capDiff
    return a.id.localeCompare(b.id)
  })
}
