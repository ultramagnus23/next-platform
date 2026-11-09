import type {
  Authority,
  AuthorityId,
  BookingRequest,
  EmailDraft,
  NotificationTrigger,
  Organisation,
  Room,
} from '../../types'
import { formatDate, formatDateTime, formatVenue } from '../../utils'

/**
 * One template function per trigger. All pure. The UI also calls these to
 * preview the email an organisation will receive before an admin decides.
 */

export interface MailContext {
  request: BookingRequest
  organisation: Organisation
  room: Room
  authorities: Authority[]
}

interface Body {
  statusWord: string
  intro: string
  reason?: string | null
  alternative?: Room | null
  next: string
  extraLines?: string[]
}

function inboxesOf(authorities: Authority[], ids: AuthorityId[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const authority = authorities.find((a) => a.id === id)
    for (const email of authority?.inboxEmails ?? []) if (!out.includes(email)) out.push(email)
  }
  return out
}

function labelOf(authorities: Authority[], id: AuthorityId): string {
  return authorities.find((a) => a.id === id)?.shortLabel ?? id.toUpperCase()
}

function compose(m: MailContext, trigger: NotificationTrigger, to: string[], cc: string[], body: Body): EmailDraft {
  const { request, organisation, room } = m
  const lines = [
    body.intro,
    '',
    `Event: ${request.eventName}`,
    `Organisation: ${organisation.name}`,
    `Date and time: ${formatDateTime(request.date, request.startMin, request.endMin)}`,
    `Venue: ${formatVenue(room)}`,
    `Status: ${body.statusWord}`,
  ]
  if (body.reason) lines.push(`Reason: ${body.reason}`)
  if (body.alternative) {
    lines.push(`Suggested alternative: ${formatVenue(body.alternative)} (capacity ${body.alternative.capacity})`)
  }
  for (const extra of body.extraLines ?? []) lines.push(extra)
  lines.push('', `What happens next: ${body.next}`)
  return {
    trigger,
    requestId: request.id,
    to,
    cc,
    subject: `[Room booking] ${body.statusWord}: ${request.eventName} (${formatDate(request.date)})`,
    text: lines.join('\n'),
  }
}

function chainLabel(m: MailContext): string {
  return m.request.stages.map((s) => labelOf(m.authorities, s)).join(', then ')
}

export function submittedEmails(m: MailContext): EmailDraft[] {
  const first = m.request.stages[m.request.stageIndex]
  if (!first) return []
  const firstLabel = labelOf(m.authorities, first)
  return [
    compose(m, 'request_submitted', inboxesOf(m.authorities, [first]), [], {
      statusWord: 'New request',
      intro: `${m.organisation.name} has submitted a room booking request that needs your review.`,
      next: 'Open the request in the admin portal and approve, request changes or reject it.',
    }),
    compose(m, 'request_submitted', [m.organisation.contactEmail], [], {
      statusWord: 'Submitted',
      intro: 'We have received your room booking request.',
      next: `It goes through this approval chain: ${chainLabel(m)}. It is with ${firstLabel} now. You will get an email at each step.`,
    }),
  ]
}

export function forwardedEmails(m: MailContext, clearedLabel: string, nextId: AuthorityId): EmailDraft[] {
  const nextLabel = labelOf(m.authorities, nextId)
  return [
    compose(m, 'request_forwarded', inboxesOf(m.authorities, [nextId]), [], {
      statusWord: 'Forwarded',
      intro: `${clearedLabel} has cleared a room booking request from ${m.organisation.name}. It now needs your review.`,
      next: 'Open the request in the admin portal and make the next decision.',
    }),
    compose(m, 'request_forwarded', [m.organisation.contactEmail], [], {
      statusWord: 'Forwarded',
      intro: `Your room booking request has cleared ${clearedLabel} and is now with ${nextLabel}.`,
      next: `${nextLabel} will review it. You will get an email when there is a decision.`,
    }),
  ]
}

export function escalatedEmails(m: MailContext, fromLabel: string, finalId: AuthorityId): EmailDraft[] {
  const finalLabel = labelOf(m.authorities, finalId)
  return [
    compose(m, 'request_forwarded', inboxesOf(m.authorities, [finalId]), [], {
      statusWord: 'Escalated',
      intro: `${fromLabel} has escalated a conflicted request from ${m.organisation.name}. This is not an endorsement. ${finalLabel} decides between the competing requests.`,
      next: 'Open the conflict in the admin portal and compare the competing requests.',
    }),
  ]
}

export function finalApprovalEmails(m: MailContext): EmailDraft[] {
  return [
    compose(m, 'request_approved_final', [m.organisation.contactEmail], inboxesOf(m.authorities, m.request.stages), {
      statusWord: 'Confirmed',
      intro: 'Your room booking is confirmed.',
      next: 'The booking is ready to be entered in AMS. No further action is needed from you.',
    }),
  ]
}

export function autoApprovedEmails(m: MailContext, ruleName: string): EmailDraft[] {
  return [
    compose(m, 'auto_approved', [m.organisation.contactEmail], inboxesOf(m.authorities, m.request.stages), {
      statusWord: 'Auto-approved',
      intro: `Your room booking was approved automatically under the rule "${ruleName}".`,
      next: 'The booking is ready to be entered in AMS. No further action is needed from you.',
    }),
  ]
}

export function rejectedEmails(m: MailContext, reason: string, alternative: Room | null): EmailDraft[] {
  return [
    compose(m, 'request_rejected', [m.organisation.contactEmail], [], {
      statusWord: 'Rejected',
      intro: 'Your room booking request was not approved.',
      reason,
      alternative,
      next: alternative
        ? 'You can submit a new request for the suggested room.'
        : 'You can submit a new request for a different room, date or time.',
    }),
  ]
}

export function changesRequestedEmails(m: MailContext, reason: string, alternative: Room | null): EmailDraft[] {
  return [
    compose(m, 'changes_requested', [m.organisation.contactEmail], [], {
      statusWord: 'Changes requested',
      intro: 'Your room booking request needs changes before it can go ahead.',
      reason,
      alternative,
      next: 'Update the request and resubmit it. If you change the room, date or time it restarts at the first approval stage.',
    }),
  ]
}

export function conflictDetectedEmails(
  m: MailContext,
  holdingAuthorities: AuthorityId[],
  competitors: BookingRequest[],
): EmailDraft[] {
  const to = inboxesOf(m.authorities, holdingAuthorities)
  if (to.length === 0) return []
  const lines = competitors.map(
    (c) => `Competing: ${c.eventName} (${c.id}, ${formatDateTime(c.date, c.startMin, c.endMin)})`,
  )
  return [
    compose(m, 'conflict_detected', to, [], {
      statusWord: 'Conflict detected',
      intro: `A request from ${m.organisation.name} overlaps with ${competitors.length} other booking${competitors.length === 1 ? '' : 's'} in the same room.`,
      extraLines: lines,
      next: 'Open the conflict in the admin portal. Academic Booking decides between requests from different offices.',
    }),
  ]
}

export function displacedEmails(m: MailContext, reason: string, byEventName: string): EmailDraft[] {
  return [
    compose(
      m,
      'booking_displaced',
      [m.organisation.contactEmail],
      inboxesOf(m.authorities, [m.organisation.authorityId]),
      {
        statusWord: 'Displaced',
        intro: `Your confirmed booking was replaced by another booking ("${byEventName}") that Academic Booking approved for the same slot.`,
        reason,
        next: 'Submit a new request for another room or time. Your governing office has been told.',
      },
    ),
  ]
}

export function cancelledEmails(m: MailContext, reason: string): EmailDraft[] {
  return [
    compose(m, 'booking_modified', [m.organisation.contactEmail], inboxesOf(m.authorities, m.request.stages), {
      statusWord: 'Cancelled',
      intro: 'Your confirmed booking was cancelled.',
      reason,
      next: 'Submit a new request if you still need a room.',
    }),
  ]
}
