import type { BookingRequest, RequestStatus } from '../../types'

export interface Slot {
  roomId: string
  date: string
  startMin: number
  endMin: number
}

/** Statuses that take part in conflict checks. */
export const ACTIVE_STATUSES: readonly RequestStatus[] = ['pending', 'changes_requested', 'confirmed']

export function isActive(status: RequestStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

/** Pending and changes_requested are soft: they compete but do not block. */
export function isSoft(status: RequestStatus): boolean {
  return status === 'pending' || status === 'changes_requested'
}

/** Confirmed bookings are hard: they block the slot. */
export function isHard(status: RequestStatus): boolean {
  return status === 'confirmed'
}

/**
 * Same room, same date, and the half-open intervals overlap once the changeover
 * buffer is added. 18:00 to 20:00 and 20:00 to 21:00 do not overlap at buffer 0.
 */
export function overlaps(a: Slot, b: Slot, bufferMin: number): boolean {
  if (a.roomId !== b.roomId || a.date !== b.date) return false
  return a.startMin < b.endMin + bufferMin && b.startMin < a.endMin + bufferMin
}

export function slotOf(request: BookingRequest): Slot {
  return { roomId: request.roomId, date: request.date, startMin: request.startMin, endMin: request.endMin }
}

export function requestsOverlap(a: BookingRequest, b: BookingRequest, bufferMin: number): boolean {
  return overlaps(slotOf(a), slotOf(b), bufferMin)
}
