import { describe, expect, it } from 'vitest'
import { ROUTE_RULES } from '../data'
import type { PathInput } from '../types'
import { eventInstant, istDateOf, istMinuteOf } from '../utils'
import { approvalPath } from './approval-path'

const NOW = new Date('2026-11-18T05:00:00.000Z')

function input(patch: Partial<PathInput> = {}): PathInput {
  return {
    venueId: 'dr-reddys-auditorium',
    category: 'extracurricular',
    eventStartAt: eventInstant('2026-12-05', 18 * 60 + 30).toISOString(),
    eventEndAt: eventInstant('2026-12-05', 20 * 60 + 30).toISOString(),
    needsAv: false,
    guestSpeaker: false,
    ...patch,
  }
}

describe('approvalPath', () => {
  it('routes a critical space through SLO and an additional review', () => {
    const p = approvalPath(input(), ROUTE_RULES, NOW)
    expect(p.stages.map((s) => s.role)).toEqual(['Student Life Office', 'Additional review'])
    expect(p.routeConfirmed).toBe(false)
  })

  it('adds a stage when a guest speaker is toggled, and removes it again', () => {
    const without = approvalPath(input({ guestSpeaker: false }), ROUTE_RULES, NOW)
    const withGuest = approvalPath(input({ guestSpeaker: true }), ROUTE_RULES, NOW)
    expect(withGuest.stages.length).toBe(without.stages.length + 1)
    expect(withGuest.stages.at(-1)?.confirmed).toBe(false)
  })

  it('sends academic society events to OAA with 10 days notice', () => {
    const p = approvalPath(input({ venueId: 'lh-sample', category: 'academic_society' }), ROUTE_RULES, NOW)
    expect(p.stages.map((s) => s.role)).toEqual(['Office of Academic Affairs'])
    expect(p.noticeDays).toBe(10)
    expect(p.routeConfirmed).toBe(true)
  })

  it('computes the latest submit date from the event start', () => {
    const p = approvalPath(input({ venueId: 'lh-sample', category: 'academic_society' }), ROUTE_RULES, NOW)
    expect(p.latestSubmitAt).toBe('2026-11-25T13:00:00.000Z')
    expect(p.tooLate).toBe(false)
  })

  it('is too late one second after the latest submit time, not before', () => {
    const rules = ROUTE_RULES
    const base = input({ venueId: 'lh-sample', category: 'academic_society' })
    const latest = new Date('2026-11-25T13:00:00.000Z')
    expect(approvalPath(base, rules, latest).tooLate).toBe(false)
    expect(approvalPath(base, rules, new Date(latest.getTime() + 1000)).tooLate).toBe(true)
  })

  it('adds the Director when late, and suggests the next best date in IST', () => {
    const lateNow = new Date('2026-11-30T05:00:00.000Z')
    const p = approvalPath(input({ venueId: 'lh-sample', category: 'academic_society' }), ROUTE_RULES, lateNow)
    expect(p.tooLate).toBe(true)
    expect(p.flags).toContain('late_needs_director')
    expect(p.stages.at(-1)?.role).toBe('Director, Student Life Office')
    expect(p.nextBestDate).toBe('2026-12-10')
  })

  it('does not guess a late warning when notice is unconfirmed', () => {
    const p = approvalPath(input(), ROUTE_RULES, new Date('2026-12-04T10:00:00.000Z'))
    expect(p.noticeDays).toBeNull()
    expect(p.tooLate).toBe(false)
    expect(p.flags).toContain('notice_unconfirmed')
  })

  it('falls back to SLO and flags an unknown route', () => {
    const p = approvalPath(input({ venueId: 'cafe', category: 'other' }), ROUTE_RULES, NOW)
    expect(p.stages.map((s) => s.role)).toEqual(['Student Life Office'])
    expect(p.flags).toContain('route_unconfirmed')
    expect(p.routeConfirmed).toBe(false)
  })

  it('flags AV outside 8am to 8pm in IST', () => {
    const late = input({
      needsAv: true,
      eventStartAt: eventInstant('2026-12-05', 19 * 60).toISOString(),
      eventEndAt: eventInstant('2026-12-05', 21 * 60).toISOString(),
    })
    expect(approvalPath(late, ROUTE_RULES, NOW).flags).toContain('av_outside_hours')
    const inside = input({ needsAv: true, eventEndAt: eventInstant('2026-12-05', 19 * 60 + 30).toISOString() })
    expect(approvalPath(inside, ROUTE_RULES, NOW).flags).not.toContain('av_outside_hours')
    expect(approvalPath(input({ needsAv: false, eventEndAt: late.eventEndAt }), ROUTE_RULES, NOW).flags).not.toContain('av_outside_hours')
  })

  it('flags the Black Box semester cap at 6 days', () => {
    const box = input({ venueId: 'black-box-theatre', semesterDaysUsed: 6 })
    expect(approvalPath(box, ROUTE_RULES, NOW).flags).toContain('semester_cap_reached')
    expect(approvalPath({ ...box, semesterDaysUsed: 5 }, ROUTE_RULES, NOW).flags).not.toContain('semester_cap_reached')
  })
})

describe('IST helpers at timezone boundaries', () => {
  it('turns an IST evening into the right instant', () => {
    expect(eventInstant('2026-12-05', 18 * 60 + 30).toISOString()).toBe('2026-12-05T13:00:00.000Z')
  })

  it('puts a 00:30 IST event on the previous UTC day but the right IST day', () => {
    const d = eventInstant('2026-12-05', 30)
    expect(d.toISOString()).toBe('2026-12-04T19:00:00.000Z')
    expect(istDateOf(d)).toBe('2026-12-05')
    expect(istMinuteOf(d)).toBe(30)
  })

  it('rolls the IST date at 18:30 UTC', () => {
    expect(istDateOf(new Date('2026-12-04T18:29:59.000Z'))).toBe('2026-12-04')
    expect(istDateOf(new Date('2026-12-04T18:30:00.000Z'))).toBe('2026-12-05')
  })
})
