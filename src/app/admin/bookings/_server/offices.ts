import { platform } from '@/lib/platform-logger'
import type { OfficeId } from '../types'

/**
 * Office membership from env `BOOKING_OFFICES`, parsed once at module top.
 * Format: `slo:a@x.in,b@x.in;oa:c@x.in;cfe:d@x.in;acad:e@x.in`.
 * Malformed input fails closed: logged, and treated as empty.
 */

const IDS: readonly OfficeId[] = ['slo', 'oa', 'cfe', 'acad']

type Membership = Record<OfficeId, string[]>

function empty(): Membership {
  return { slo: [], oa: [], cfe: [], acad: [] }
}

function isOfficeId(value: string): value is OfficeId {
  return IDS.some((id) => id === value)
}

export function parseBookingOffices(raw: string): Membership {
  const result = empty()
  const trimmed = raw.trim()
  if (trimmed === '') return result
  for (const segment of trimmed.split(';')) {
    const piece = segment.trim()
    if (piece === '') continue
    const colon = piece.indexOf(':')
    if (colon === -1) {
      platform.error('BOOKING_OFFICES is malformed: a segment has no ":". Treating it as empty.')
      return empty()
    }
    const id = piece.slice(0, colon).trim().toLowerCase()
    if (!isOfficeId(id)) {
      platform.error(`BOOKING_OFFICES is malformed: unknown office "${id}". Treating it as empty.`)
      return empty()
    }
    const emails = piece
      .slice(colon + 1)
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    if (emails.some((e) => !e.includes('@'))) {
      platform.error(`BOOKING_OFFICES is malformed: bad email under "${id}". Treating it as empty.`)
      return empty()
    }
    result[id] = [...new Set([...result[id], ...emails])]
  }
  return result
}

const MEMBERSHIP: Membership = parseBookingOffices(process.env.BOOKING_OFFICES ?? '')
const DEMO_MODE: boolean = process.env.BOOKING_DEMO_MODE === 'true'

export function officesForEmail(email: string): OfficeId[] {
  const normalised = email.trim().toLowerCase()
  return IDS.filter((id) => MEMBERSHIP[id].includes(normalised))
}

export function isBookingOfficeMember(email: string): boolean {
  return officesForEmail(email).length > 0
}

export function membersOf(id: OfficeId): string[] {
  return [...MEMBERSHIP[id]]
}

export function isDemoMode(): boolean {
  return DEMO_MODE
}

/** Local demo only: both flags set and not a production build. Skips sign-in for the booking portal. */
export function isDevBypass(): boolean {
  return process.env.NODE_ENV !== 'production' && DEMO_MODE && process.env.BYPASS_AUTH === 'true'
}
