import type { AutoApprovalRule, BookingRequest, EngineContext } from '../../types'
import { eventStartMs, isoWeekKey } from '../../utils'
import { flagsFor, laneFor } from './flags'

export interface AutoApprovalResult {
  ruleId: string
  ruleName: string
  effect: AutoApprovalRule['effect']
}

function matches(rule: AutoApprovalRule, request: BookingRequest, building: string, ctx: EngineContext, now: string): boolean {
  const c = rule.conditions
  if (c.categories && c.categories.length > 0 && !c.categories.includes(request.category)) return false
  if (c.startAtOrAfterMin !== undefined && request.startMin < c.startAtOrAfterMin) return false
  if (c.endAtOrBeforeMin !== undefined && request.endMin > c.endAtOrBeforeMin) return false
  if (c.maxAttendance !== undefined && request.expectedAttendance > c.maxAttendance) return false
  if (c.buildings && c.buildings.length > 0 && !c.buildings.includes(building)) return false
  if (c.minNoticeHours !== undefined) {
    const hours = (eventStartMs(request.date, request.startMin) - Date.parse(now)) / 3_600_000
    if (hours < c.minNoticeHours) return false
  }
  if (c.maxPerOrgPerWeek !== undefined) {
    const week = isoWeekKey(request.date)
    const used = ctx.requests.filter(
      (r) => r.id !== request.id && r.organisationId === request.organisationId && r.autoApprovedBy !== null && isoWeekKey(r.date) === week,
    ).length
    if (used >= c.maxPerOrgPerWeek) return false
  }
  return true
}

/**
 * First enabled rule whose conditions all hold, but only for a request in the
 * Clear lane (decision D14). `ctx.requests` must include the request.
 */
export function evaluateAutoApproval(ctx: EngineContext, request: BookingRequest, now: string): AutoApprovalResult | null {
  const room = ctx.rooms.find((r) => r.id === request.roomId)
  if (!room) return null
  const flags = flagsFor(ctx, request, room, now)
  if (laneFor(ctx, request, flags) !== 'clear') return null
  for (const rule of ctx.settings.autoApproval) {
    if (!rule.enabled) continue
    if (matches(rule, request, room.building, ctx, now)) return { ruleId: rule.id, ruleName: rule.name, effect: rule.effect }
  }
  return null
}
