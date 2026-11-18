import type { EmailTemplate, StudentRequest } from '../../types'
import { formatDay, formatInstant, formatTime } from '../../utils'

export interface TemplateContext {
  request: StudentRequest
  /** The office the email is about, when there is one. */
  role?: string
  reason?: string | null
  /** Offices still to come after the current one. */
  remainingRoles?: string[]
  /** Link that opens the confirmation page. Absent when email approvals are off. */
  approveUrl?: string | null
  unlockNote?: string | null
  previousRequestId?: string | null
}

/**
 * Every email about one request has the same subject, so mail clients group them even before the
 * In-Reply-To and References headers are read. The status goes in the first line of the body.
 */
export function subjectFor(r: StudentRequest): string {
  return `Booking request ${r.id}: ${r.eventName}, ${formatDay(r.date)}`
}

function details(r: StudentRequest): string {
  return [
    `Event: ${r.eventName}`,
    `Club: ${r.organisationName}`,
    `Space: ${r.venueLabel}`,
    `When: ${formatDay(r.date)}, ${formatTime(r.startMin)} to ${formatTime(r.endMin)}`,
    `People: ${r.attendance}`,
  ].join('\n')
}

function actionBlock(url: string | null | undefined): string {
  return url
    ? `\nOpen the request to approve or not approve it:\n${url}\nThe link opens a confirmation page first. Nothing changes until you confirm there. It works once and expires in 24 hours.\n`
    : '\nReply in the booking portal to decide.\n'
}

const BODY: Record<EmailTemplate, (c: TemplateContext) => string> = {
  submitted: (c) =>
    `Status: Pending with ${c.role ?? 'the first office'}.\n\n${details(c.request)}\n${c.previousRequestId ? `\nThis resubmits ${c.previousRequestId}.\n` : ''}${actionBlock(c.approveUrl)}`,
  forwarded: (c) => `Status: Pending with ${c.role ?? 'the next office'}. The earlier office approved.\n\n${details(c.request)}\n${actionBlock(c.approveUrl)}`,
  approved: (c) => `Status: Approved. Every office on the path approved this request.\n\n${details(c.request)}\n`,
  not_approved: (c) => `Status: Not approved by ${c.role ?? 'an office'}.\n\nReason:\n${c.reason ?? 'No reason was recorded.'}\n\n${details(c.request)}\n\nYou can edit the request and resubmit it from the booking portal.\n`,
  followup: (c) => `Status: Pending with ${c.role ?? 'an office'}. The club sent a reminder.\n\n${details(c.request)}\n${actionBlock(c.approveUrl)}`,
  cancelled: (c) => `Status: Cancelled by the club. No action is needed.\n\n${details(c.request)}\n`,
  reminder: (c) => `Status: Pending with ${c.role ?? 'an office'}, waiting on you.\n\n${details(c.request)}\n${actionBlock(c.approveUrl)}`,
  escalation: (c) =>
    `Status: Pending with ${c.role ?? 'an office'} for longer than expected${c.request.submittedAt ? ` (sent ${formatInstant(c.request.submittedAt)})` : ''}. You are the backup contact.\n\n${details(c.request)}\n${actionBlock(c.approveUrl)}`,
  admin_flag: (c) => `Status: Flagged. This request has been pending with ${c.role ?? 'an office'} for a long time.\n\n${details(c.request)}\n`,
}

export function renderEmail(template: EmailTemplate, ctx: TemplateContext): { subject: string; text: string } {
  return { subject: subjectFor(ctx.request), text: BODY[template](ctx) }
}
