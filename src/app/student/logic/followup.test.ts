import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../data'
import type { RequestClock } from '../types'
import { eventInstant } from '../utils'
import { followupEligibility } from './followup'

const SUBMITTED = '2026-11-10T04:30:00.000Z'
const DAY = 86_400_000
const at = (ms: number) => new Date(Date.parse(SUBMITTED) + ms)

// Fri 5 Dec 2026, 6:30pm IST. Far enough away that the urgency rule stays off.
const FAR_EVENT = eventInstant('2026-12-05', 18 * 60 + 30).toISOString()

function req(patch: Partial<RequestClock> = {}): RequestClock {
  return {
    status: 'pending',
    submittedAt: SUBMITTED,
    lastApproverActivityAt: null,
    lastFollowupAt: null,
    urgencyFollowupUsed: false,
    eventStartAt: FAR_EVENT,
    ...patch,
  }
}

describe('followupEligibility', () => {
  it('is locked one second before 7 days and gives the exact unlock time', () => {
    const r = followupEligibility(req(), DEFAULT_CONFIG, at(7 * DAY - 1000))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('locked')
    expect(r.unlockAt).toBe(at(7 * DAY).toISOString())
  })

  it('opens at exactly 7 days', () => {
    const r = followupEligibility(req(), DEFAULT_CONFIG, at(7 * DAY))
    expect(r).toMatchObject({ eligible: true, reason: 'window_open', urgencyOverride: false })
  })

  it('counts from submission when no approver has acted', () => {
    const r = followupEligibility(req({ lastApproverActivityAt: null }), DEFAULT_CONFIG, at(3 * DAY))
    expect(r.unlockAt).toBe(at(7 * DAY).toISOString())
    expect(r.eligible).toBe(false)
  })

  it('restarts the window when an approver acts', () => {
    const acted = at(5 * DAY).toISOString()
    const r = followupEligibility(req({ lastApproverActivityAt: acted }), DEFAULT_CONFIG, at(8 * DAY))
    expect(r.eligible).toBe(false)
    expect(r.unlockAt).toBe(at(12 * DAY).toISOString())
  })

  it('restarts the window after a follow-up was sent', () => {
    const sent = at(7 * DAY).toISOString()
    const r = followupEligibility(req({ lastFollowupAt: sent }), DEFAULT_CONFIG, at(10 * DAY))
    expect(r.eligible).toBe(false)
    expect(r.unlockAt).toBe(at(14 * DAY).toISOString())
  })

  it('allows exactly one early follow-up when the event is under 7 days away', () => {
    const soon = new Date(at(2 * DAY).getTime() + 6 * DAY).toISOString()
    const first = followupEligibility(req({ eventStartAt: soon }), DEFAULT_CONFIG, at(2 * DAY))
    expect(first).toMatchObject({ eligible: true, reason: 'urgency_override', urgencyOverride: true })
    const second = followupEligibility(req({ eventStartAt: soon, urgencyFollowupUsed: true }), DEFAULT_CONFIG, at(2 * DAY))
    expect(second).toMatchObject({ eligible: false, reason: 'urgency_used' })
  })

  it('does not use the urgency rule when the event is exactly 7 days away', () => {
    const sevenOut = new Date(at(2 * DAY).getTime() + 7 * DAY).toISOString()
    const r = followupEligibility(req({ eventStartAt: sevenOut }), DEFAULT_CONFIG, at(2 * DAY))
    expect(r.reason).toBe('locked')
  })

  it('refuses when the request is not pending', () => {
    for (const status of ['draft', 'approved', 'rejected', 'cancelled'] as const) {
      const r = followupEligibility(req({ status }), DEFAULT_CONFIG, at(30 * DAY))
      expect(r).toMatchObject({ eligible: false, reason: 'not_pending', unlockAt: null })
    }
  })

  it('refuses once the event has started', () => {
    const r = followupEligibility(req({ eventStartAt: at(8 * DAY).toISOString() }), DEFAULT_CONFIG, at(9 * DAY))
    expect(r.reason).toBe('event_passed')
  })

  it('respects the daily cap only when one is configured', () => {
    const capped = { ...DEFAULT_CONFIG, orgDailyFollowupCap: 2 }
    expect(followupEligibility(req(), capped, at(8 * DAY), 2).reason).toBe('org_daily_cap')
    expect(followupEligibility(req(), capped, at(8 * DAY), 1).eligible).toBe(true)
    expect(followupEligibility(req(), DEFAULT_CONFIG, at(8 * DAY), 99).eligible).toBe(true)
  })

  it('reads the wait from config, not a literal', () => {
    const shorter = { ...DEFAULT_CONFIG, followupWaitDays: 3 }
    expect(followupEligibility(req(), shorter, at(3 * DAY)).eligible).toBe(true)
  })

  it('handles a resubmitted version as a new request', () => {
    // A rejected request is closed. Its linked resubmission starts a fresh clock.
    expect(followupEligibility(req({ status: 'rejected' }), DEFAULT_CONFIG, at(20 * DAY)).reason).toBe('not_pending')
    const resubmitted = req({ submittedAt: at(20 * DAY).toISOString(), eventStartAt: eventInstant('2027-01-20', 18 * 60).toISOString() })
    expect(followupEligibility(resubmitted, DEFAULT_CONFIG, at(22 * DAY)).reason).toBe('locked')
    expect(followupEligibility(resubmitted, DEFAULT_CONFIG, at(27 * DAY)).eligible).toBe(true)
  })
})
