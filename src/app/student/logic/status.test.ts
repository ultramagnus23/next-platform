import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../data'
import type { ApprovalStep } from '../types'
import { deriveStatus, overallFromSteps } from './status'

const SUBMITTED = '2026-11-10T04:30:00.000Z'
const DAY = 86_400_000
const at = (ms: number) => new Date(Date.parse(SUBMITTED) + ms)

const pending = { status: 'pending' as const, submittedAt: SUBMITTED, lastApproverActivityAt: null }

describe('deriveStatus', () => {
  it('is Pending before 7 days and Taking longer than usual at exactly 7 days', () => {
    expect(deriveStatus(pending, DEFAULT_CONFIG, at(7 * DAY - 1000)).label).toBe('Pending')
    const late = deriveStatus(pending, DEFAULT_CONFIG, at(7 * DAY))
    expect(late.label).toBe('Taking longer than usual')
    expect(late.shown).toBe('taking_longer')
    expect(late.stagnantSince).toBe(at(7 * DAY).toISOString())
  })

  it('counts from submission when no approver has acted', () => {
    expect(deriveStatus(pending, DEFAULT_CONFIG, at(6 * DAY)).daysWaiting).toBe(6)
  })

  it('resets the wait when an approver acts', () => {
    const acted = { ...pending, lastApproverActivityAt: at(6 * DAY).toISOString() }
    expect(deriveStatus(acted, DEFAULT_CONFIG, at(10 * DAY)).shown).toBe('pending')
    expect(deriveStatus(acted, DEFAULT_CONFIG, at(13 * DAY)).shown).toBe('taking_longer')
  })

  it('never marks a non-pending request as taking longer', () => {
    for (const status of ['draft', 'approved', 'rejected', 'cancelled'] as const) {
      expect(deriveStatus({ ...pending, status }, DEFAULT_CONFIG, at(90 * DAY)).shown).not.toBe('taking_longer')
    }
  })

  it('shows Not approved for a rejected request', () => {
    const r = deriveStatus({ ...pending, status: 'rejected' }, DEFAULT_CONFIG, at(DAY))
    expect(r).toMatchObject({ label: 'Not approved', icon: 'x', tone: 'red', stored: 'rejected' })
  })

  it('gives every shown status an icon and a text label, never colour alone', () => {
    for (const status of ['draft', 'pending', 'approved', 'rejected', 'cancelled'] as const) {
      const r = deriveStatus({ ...pending, status }, DEFAULT_CONFIG, at(DAY))
      expect(r.label.length).toBeGreaterThan(0)
      expect(r.icon).toBeTruthy()
    }
  })

  it('reads the wait from config', () => {
    expect(deriveStatus(pending, { ...DEFAULT_CONFIG, stagnantAfterDays: 2 }, at(2 * DAY)).shown).toBe('taking_longer')
  })
})

describe('overallFromSteps', () => {
  const step = (state: ApprovalStep['state']): ApprovalStep => ({ role: 'Office', state })

  it('stays pending until every required stage approves', () => {
    expect(overallFromSteps([step('approved'), step('current')])).toBe('pending')
    expect(overallFromSteps([step('approved'), step('approved')])).toBe('approved')
  })

  it('is rejected as soon as any stage rejects, even with others open', () => {
    expect(overallFromSteps([step('approved'), step('rejected'), step('not_started')])).toBe('rejected')
  })

  it('never approves an empty path', () => {
    expect(overallFromSteps([])).toBe('pending')
  })

  it('treats a resubmission as a new path that starts pending', () => {
    expect(overallFromSteps([step('rejected')])).toBe('rejected')
    expect(overallFromSteps([step('current'), step('not_started')])).toBe('pending')
  })
})
