import type {
  BookingRequest,
  BookingSettings,
  ConflictGroup,
  ConflictItem,
  RequestWarning,
  Room,
} from '../../types'
import { eventStartMs } from '../../utils'
import { isActive, isHard, isSoft, requestsOverlap } from './overlap'

const SHORT_NOTICE_HOURS = 48

export function groupIdFor(members: BookingRequest[]): string {
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id))
  const first = sorted[0]
  if (!first) return ''
  return [first.roomId, first.date, ...sorted.map((m) => m.id)].join('~')
}

/**
 * Connected components of overlapping active requests, per room and date.
 * A group always has two or more members.
 */
export function findConflictGroups(requests: BookingRequest[], settings: BookingSettings): ConflictGroup[] {
  const buffer = settings.changeoverBufferMin
  const active = requests.filter((r) => isActive(r.status))

  const buckets = new Map<string, BookingRequest[]>()
  for (const r of active) {
    const key = `${r.roomId}|${r.date}`
    const list = buckets.get(key)
    if (list) list.push(r)
    else buckets.set(key, [r])
  }

  const groups: ConflictGroup[] = []
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    const parent = list.map((_, i) => i)
    const find = (i: number): number => {
      let root = i
      while (parent[root] !== root) root = parent[root] ?? root
      let cur = i
      while (parent[cur] !== root) {
        const next = parent[cur] ?? root
        parent[cur] = root
        cur = next
      }
      return root
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (a && b && requestsOverlap(a, b, buffer)) parent[find(i)] = find(j)
      }
    }
    const components = new Map<number, BookingRequest[]>()
    list.forEach((r, i) => {
      const root = find(i)
      const comp = components.get(root)
      if (comp) comp.push(r)
      else components.set(root, [r])
    })
    for (const members of components.values()) {
      if (members.length < 2) continue
      groups.push(buildGroup(members, buffer))
    }
  }

  return groups.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.id.localeCompare(b.id),
  )
}

function buildGroup(members: BookingRequest[], buffer: number): ConflictGroup {
  const sorted = [...members].sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id))
  const first = sorted[0] as BookingRequest
  let overlapStart = -1
  let overlapEnd = -1
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      if (!a || !b || !requestsOverlap(a, b, buffer)) continue
      const s = Math.max(a.startMin, b.startMin)
      const e = Math.min(a.endMin, b.endMin)
      overlapStart = overlapStart === -1 ? s : Math.min(overlapStart, s)
      overlapEnd = overlapEnd === -1 ? e : Math.max(overlapEnd, e)
    }
  }
  return {
    id: groupIdFor(sorted),
    roomId: first.roomId,
    date: first.date,
    startMin: Math.min(...sorted.map((m) => m.startMin)),
    endMin: Math.max(...sorted.map((m) => m.endMin)),
    overlapStartMin: overlapStart === -1 ? first.startMin : overlapStart,
    overlapEndMin: overlapEnd === -1 ? first.endMin : overlapEnd,
    members: sorted,
    hasConfirmed: sorted.some((m) => isHard(m.status)),
    isOpen: sorted.some((m) => m.status === 'pending'),
  }
}

export function findGroupById(
  groupId: string,
  requests: BookingRequest[],
  settings: BookingSettings,
): ConflictGroup | null {
  return findConflictGroups(requests, settings).find((g) => g.id === groupId) ?? null
}

export function findGroupContaining(
  requestId: string,
  requests: BookingRequest[],
  settings: BookingSettings,
): ConflictGroup | null {
  return findConflictGroups(requests, settings).find((g) => g.members.some((m) => m.id === requestId)) ?? null
}

/**
 * Items that compete with one request: other pending or changes_requested
 * requests, and confirmed bookings that block it.
 */
export function conflictsFor(
  requestId: string,
  requests: BookingRequest[],
  settings: BookingSettings,
): ConflictItem[] {
  const target = requests.find((r) => r.id === requestId)
  if (!target || !isActive(target.status)) return []
  const buffer = settings.changeoverBufferMin
  const items: ConflictItem[] = []
  for (const other of requests) {
    if (other.id === target.id || !isActive(other.status)) continue
    if (!requestsOverlap(target, other, buffer)) continue
    if (isHard(other.status)) items.push({ kind: 'confirmed_booking', request: other })
    else if (isSoft(other.status)) items.push({ kind: 'competing_request', request: other })
  }
  return items.sort((a, b) => a.request.startMin - b.request.startMin || a.request.id.localeCompare(b.request.id))
}

/** Warnings are not conflicts. They never block a decision. */
export function warningsFor(request: BookingRequest, room: Room): RequestWarning[] {
  const warnings: RequestWarning[] = []
  if (request.expectedAttendance > room.capacity) {
    warnings.push({
      code: 'over_capacity',
      message: `Expected attendance (${request.expectedAttendance}) is above room capacity (${room.capacity}).`,
    })
  }
  if (request.startMin < room.openFromMin || request.endMin > room.openUntilMin) {
    warnings.push({ code: 'outside_room_hours', message: 'The booking falls outside the room opening hours.' })
  }
  const leadHours = (eventStartMs(request.date, request.startMin) - Date.parse(request.createdAt)) / 3_600_000
  if (leadHours < SHORT_NOTICE_HOURS) {
    warnings.push({ code: 'short_notice', message: 'Submitted less than 48 hours before the event.' })
  }
  return warnings
}
