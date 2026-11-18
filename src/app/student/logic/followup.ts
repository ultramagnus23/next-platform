import type { BookingConfig, RequestClock } from '../types'
import { addDays, latestOf, MS_PER_DAY } from '../utils'

export type FollowupReason = 'window_open' | 'urgency_override' | 'locked' | 'not_pending' | 'event_passed' | 'urgency_used' | 'org_daily_cap'

export interface FollowupResult {
  eligible: boolean
  reason: FollowupReason
  /** When the normal window opens, or null when the request is not pending. */
  unlockAt: string | null
  /** True when sending is allowed early because the event is close. */
  urgencyOverride: boolean
}

/**
 * Whether a club may send a follow-up now. The window starts at the latest of submission, last approver
 * activity and the last follow-up, plus followupWaitDays, so any approver activity or a sent follow-up
 * restarts it. If the event is under urgencyDays away and the request is still pending, exactly one early
 * follow-up is allowed. The server runs this inside the same atomic update that records the follow-up.
 */
export function followupEligibility(req: RequestClock, config: BookingConfig, now: Date, orgFollowupsToday = 0): FollowupResult {
  if (req.status !== 'pending') return { eligible: false, reason: 'not_pending', unlockAt: null, urgencyOverride: false }

  const anchor = latestOf([req.submittedAt, req.lastApproverActivityAt, req.lastFollowupAt])
  const unlock = anchor ? addDays(anchor, config.followupWaitDays) : null
  const unlockAt = unlock ? unlock.toISOString() : null
  const eventStart = new Date(req.eventStartAt)

  if (eventStart.getTime() <= now.getTime()) return { eligible: false, reason: 'event_passed', unlockAt, urgencyOverride: false }
  if (config.orgDailyFollowupCap !== null && orgFollowupsToday >= config.orgDailyFollowupCap) {
    return { eligible: false, reason: 'org_daily_cap', unlockAt, urgencyOverride: false }
  }
  if (unlock === null || now.getTime() >= unlock.getTime()) return { eligible: true, reason: 'window_open', unlockAt, urgencyOverride: false }

  const daysToEvent = (eventStart.getTime() - now.getTime()) / MS_PER_DAY
  if (daysToEvent < config.urgencyDays) {
    return req.urgencyFollowupUsed
      ? { eligible: false, reason: 'urgency_used', unlockAt, urgencyOverride: false }
      : { eligible: true, reason: 'urgency_override', unlockAt, urgencyOverride: true }
  }
  return { eligible: false, reason: 'locked', unlockAt, urgencyOverride: false }
}
