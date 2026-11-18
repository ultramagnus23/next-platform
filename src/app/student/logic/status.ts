import type { ApprovalStep, BookingConfig, RequestClock, ShownStatus, StatusIcon, StatusTone, StoredStatus } from '../types'
import { addDays, latestOf, MS_PER_DAY } from '../utils'

export interface DerivedStatus {
  stored: StoredStatus
  shown: ShownStatus
  label: string
  icon: StatusIcon
  tone: StatusTone
  /** When the request became "taking longer than usual", or null. */
  stagnantSince: string | null
  /** Whole days since the later of submission and last approver activity. Null unless pending. */
  daysWaiting: number | null
}

const LABEL: Record<ShownStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  taking_longer: 'Taking longer than usual',
  approved: 'Approved',
  not_approved: 'Not approved',
  cancelled: 'Cancelled',
}

const ICON: Record<ShownStatus, StatusIcon> = {
  draft: 'pencil',
  pending: 'hourglass',
  taking_longer: 'clock',
  approved: 'check',
  not_approved: 'x',
  cancelled: 'ban',
}

const TONE: Record<ShownStatus, StatusTone> = {
  draft: 'muted',
  pending: 'slate',
  taking_longer: 'amber',
  approved: 'green',
  not_approved: 'red',
  cancelled: 'muted',
}

/**
 * The word, icon and colour a student sees. "Taking longer than usual" is computed here and never stored:
 * the request is pending and the wait has reached followupWaitDays since the later of submission and the
 * last approver activity. Nothing auto-approves.
 */
export function deriveStatus(req: Pick<RequestClock, 'status' | 'submittedAt' | 'lastApproverActivityAt'>, config: BookingConfig, now: Date): DerivedStatus {
  let shown: ShownStatus
  let stagnantSince: string | null = null
  let daysWaiting: number | null = null

  if (req.status === 'pending') {
    const anchor = latestOf([req.submittedAt, req.lastApproverActivityAt])
    if (anchor) {
      daysWaiting = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY))
      const since = addDays(anchor, config.followupWaitDays)
      if (now.getTime() >= since.getTime()) {
        stagnantSince = since.toISOString()
        shown = 'taking_longer'
      } else shown = 'pending'
    } else shown = 'pending'
  } else if (req.status === 'rejected') shown = 'not_approved'
  else shown = req.status

  return { stored: req.status, shown, label: LABEL[shown], icon: ICON[shown], tone: TONE[shown], stagnantSince, daysWaiting }
}

/**
 * Overall status from the required stages. Rejected as soon as any stage rejects. Approved only when every
 * stage approved. Otherwise pending. An empty list is pending, never approved.
 */
export function overallFromSteps(steps: ApprovalStep[]): StoredStatus {
  if (steps.some((s) => s.state === 'rejected')) return 'rejected'
  if (steps.length > 0 && steps.every((s) => s.state === 'approved')) return 'approved'
  return 'pending'
}
