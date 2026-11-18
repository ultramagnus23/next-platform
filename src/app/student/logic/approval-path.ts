import { AV_HOURS, DIRECTOR_ROLE, FALLBACK_ROLE } from '../data'
import type { ApprovalPath, PathFlag, PathInput, PathStage, RouteRule } from '../types'
import { addDays, istDateOf, istMinuteOf } from '../utils'

/**
 * Every office a request goes through, why, the notice needed and the latest date to submit. Pure, so the
 * form can call it on every change for the live preview. Nothing is invented: a venue and category with no
 * rule falls back to SLO and is flagged "Route unconfirmed, email SLO". Notice stays null where no source
 * gives one, and the late warning then stays off rather than guessing.
 */
export function approvalPath(input: PathInput, rules: RouteRule[], now: Date): ApprovalPath {
  const venueRule = rules.find((r) => r.venueIds.includes(input.venueId))
  const categoryRule = rules.find((r) => r.category !== null && r.category === input.category)
  const matched = [venueRule, categoryRule].filter((r): r is RouteRule => r !== undefined)

  const flags: PathFlag[] = []
  const stages: PathStage[] = []
  const add = (role: string, why: string, confirmed: boolean) => {
    if (!stages.some((s) => s.role === role)) stages.push({ role, why, confirmed })
  }

  for (const rule of matched) {
    for (const s of rule.stages) add(s.role, s.why, rule.confirmed)
    if (input.guestSpeaker && rule.guestSpeakerStage) add(rule.guestSpeakerStage.role, rule.guestSpeakerStage.why, false)
  }

  const routeConfirmed = matched.length > 0 && matched.every((r) => r.confirmed)
  if (matched.length === 0) {
    add(FALLBACK_ROLE, 'No route is confirmed for this space yet', false)
    flags.push('route_unconfirmed')
  }

  const notices = matched.map((r) => r.noticeDays).filter((n): n is number => n !== null)
  const noticeDays = notices.length > 0 ? Math.max(...notices) : null
  if (noticeDays === null) flags.push('notice_unconfirmed')

  const eventStart = new Date(input.eventStartAt)
  const latest = noticeDays === null ? null : addDays(eventStart, -noticeDays)
  const tooLate = latest !== null && now.getTime() > latest.getTime()
  if (tooLate) {
    add(DIRECTOR_ROLE, 'Late requests need special approval', true)
    flags.push('late_needs_director')
  }

  if (input.needsAv) {
    const start = istMinuteOf(eventStart)
    const end = istMinuteOf(new Date(input.eventEndAt))
    if (start < AV_HOURS.fromMin || end > AV_HOURS.toMin) flags.push('av_outside_hours')
  }

  const cap = matched.map((r) => r.maxBookingDaysPerSemester).find((n): n is number => n !== null)
  if (cap !== undefined && (input.semesterDaysUsed ?? 0) >= cap) flags.push('semester_cap_reached')

  return {
    stages,
    noticeDays,
    latestSubmitAt: latest ? latest.toISOString() : null,
    tooLate,
    nextBestDate: tooLate && noticeDays !== null ? istDateOf(addDays(now, noticeDays)) : null,
    routeConfirmed,
    flags,
  }
}
