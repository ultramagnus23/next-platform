import type { Lane, PersonaId } from './types'

/** Static labels and options shared by the booking pages. */

export const API_BASE = '/api/admin/bookings'
export const BOOKINGS_BASE = '/admin/bookings'
export const DEMO_BANNER = 'Demo mode: data is simulated and resets on restart. No emails are sent.'

export const PERSONAS: ReadonlyArray<{ id: PersonaId; label: string }> = [
  { id: 'slo_approver', label: 'SLO approver' },
  { id: 'oa_approver', label: 'OA approver' },
  { id: 'cfe_approver', label: 'CFE approver' },
  { id: 'acad_approver', label: 'Academic Booking' },
  { id: 'super_admin', label: 'Super admin' },
]

export const LANE_TEXT: Record<Lane, { title: string; blurb: string }> = {
  clash: { title: 'Clashes', blurb: 'Someone else wants the same room and time.' },
  look: { title: 'Needs a look', blurb: 'Has a warning, such as too many people or short notice.' },
  clear: { title: 'Clear to approve', blurb: 'Nothing to check. Safe to approve together.' },
}

export const QUICK_REASONS: ReadonlyArray<string> = [
  'Room is booked for a class',
  'Higher-priority event at the same time',
  'More people than seats',
  'Missing event details',
]
