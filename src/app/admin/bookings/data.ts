import type { ActionId, AuthorityId, PersonaId, RequestStatus, RequestTab } from './types'

/** Static labels and options shared by the booking pages. */

export const PERSONAS: ReadonlyArray<{ id: PersonaId; label: string; description: string }> = [
  { id: 'slo_approver', label: 'SLO approver', description: 'Acts for the Student Life Office.' },
  { id: 'oa_approver', label: 'OA approver', description: 'Acts for OA.' },
  { id: 'cfe_approver', label: 'CFE approver', description: 'Acts for the Centre for Entrepreneurship.' },
  { id: 'acad_approver', label: 'Academic Booking', description: 'Final authority. Decides conflicts.' },
  { id: 'super_admin', label: 'Super admin', description: 'Acts for every authority and edits settings.' },
]

export const TAB_LABELS: Record<RequestTab, string> = {
  needs_action: 'Needs my action',
  others: 'With other authorities',
  confirmed: 'Confirmed',
  closed: 'Closed',
  all: 'All',
}

export const STATUS_OPTIONS: ReadonlyArray<{ value: RequestStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'displaced', label: 'Displaced' },
]

export const STAGE_OPTIONS: ReadonlyArray<{ value: AuthorityId; label: string }> = [
  { value: 'slo', label: 'SLO' },
  { value: 'oa', label: 'OA' },
  { value: 'cfe', label: 'CFE' },
  { value: 'acad', label: 'Academic Booking' },
]

export const QUICK_REASONS: ReadonlyArray<string> = [
  'Room unavailable at this time',
  'Higher-priority academic booking',
  'Expected attendance exceeds capacity',
  'Missing event details',
]

export const ACTION_PAST_TENSE: Record<ActionId, string> = {
  approve: 'Approved',
  escalate: 'Escalated',
  reject: 'Rejected',
  request_changes: 'Changes requested',
  resubmit: 'Resubmitted',
  override_confirm: 'Booking confirmed by override',
  cancel: 'Cancelled',
  remark: 'Remark added',
}

export const DEMO_BANNER = 'Demo mode: data is simulated and resets on restart. No emails are sent.'
export const BOOKINGS_BASE = '/admin/bookings'
export const API_BASE = '/api/admin/bookings'
