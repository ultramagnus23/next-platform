import type { AutoApprovalRule, BookingRequest, BookingSettings, Room } from '../../types'
import { hoursUntilStart, isoWeekKey } from '../../utils'
import { conflictsFor, warningsFor } from './conflicts'

export interface AutoApprovalContext {
  settings: BookingSettings
  rooms: Room[]
  /** Every request, including the one being evaluated. */
  requests: BookingRequest[]
}

export interface AutoApprovalResult {
  ruleId: string
  ruleName: string
  effect: AutoApprovalRule['effect']
}

function ruleMatches(
  rule: AutoApprovalRule,
  request: BookingRequest,
  room: Room,
  ctx: AutoApprovalContext,
  now: string,
): boolean {
  const c = rule.conditions
  if (c.categories && c.categories.length > 0 && !c.categories.includes(request.category)) return false
  if (c.startAtOrAfterMin !== undefined && request.startMin < c.startAtOrAfterMin) return false
  if (c.endAtOrBeforeMin !== undefined && request.endMin > c.endAtOrBeforeMin) return false
  if (c.maxAttendance !== undefined && request.expectedAttendance > c.maxAttendance) return false
  if (c.buildings && c.buildings.length > 0 && !c.buildings.includes(room.building)) return false
  if (c.minLeadTimeHours !== undefined && hoursUntilStart(request.date, request.startMin, now) < c.minLeadTimeHours) {
    return false
  }
  if (c.maxPerOrgPerWeek !== undefined) {
    const week = isoWeekKey(request.date)
    const used = ctx.requests.filter(
      (r) =>
        r.id !== request.id &&
        r.organisationId === request.organisationId &&
        r.autoApprovedBy !== null &&
        isoWeekKey(r.date) === week,
    ).length
    if (used >= c.maxPerOrgPerWeek) return false
  }
  return true
}

/**
 * First enabled rule whose every condition holds. Hard guards apply whatever
 * the rule says: no conflict of any kind, no over-capacity, no out-of-hours.
 */
export function evaluateAutoApproval(
  request: BookingRequest,
  rules: AutoApprovalRule[],
  ctx: AutoApprovalContext,
  now: string,
): AutoApprovalResult | null {
  const room = ctx.rooms.find((r) => r.id === request.roomId)
  if (!room) return null
  if (conflictsFor(request.id, ctx.requests, ctx.settings).length > 0) return null
  const blockers = warningsFor(request, room).filter(
    (w) => w.code === 'over_capacity' || w.code === 'outside_room_hours',
  )
  if (blockers.length > 0) return null
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (ruleMatches(rule, request, room, ctx, now)) {
      return { ruleId: rule.id, ruleName: rule.name, effect: rule.effect }
    }
  }
  return null
}
