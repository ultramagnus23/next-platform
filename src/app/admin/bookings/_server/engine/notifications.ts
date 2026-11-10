import type {
  BookingRequest,
  EmailDraft,
  NotificationTrigger,
  Office,
  OfficeId,
  Organisation,
  Room,
} from '../../types'
import { formatCompactDateTime, formatDate, formatTimestamp, formatVenue } from '../../utils'

/**
 * One template per trigger. All pure. The UI also calls these to preview the
 * email an organisation will receive before an admin decides.
 * Wording rule: say "confirmed" only when the room is actually booked.
 */

export interface MailContext {
  request: BookingRequest
  organisation: Organisation
  room: Room
  offices: Office[]
}

interface Body {
  statusWord: string
  intro: string
  reason?: string | null
  extraLines?: string[]
  next: string
}

function inboxesOf(offices: Office[], ids: OfficeId[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const office = offices.find((o) => o.id === id)
    for (const email of office?.inboxEmails ?? []) if (!out.includes(email)) out.push(email)
  }
  return out
}

function labelOf(offices: Office[], id: OfficeId): string {
  return offices.find((o) => o.id === id)?.shortLabel ?? id.toUpperCase()
}

function compose(m: MailContext, trigger: NotificationTrigger, to: string[], cc: string[], body: Body): EmailDraft {
  const { request, organisation, room } = m
  const lines = [
    body.intro,
    '',
    `Event: ${request.eventName}`,
    `Organisation: ${organisation.name}`,
    `When: ${formatCompactDateTime(request.date, request.startMin, request.endMin)}`,
    `Room: ${formatVenue(room)}`,
    `Status: ${body.statusWord}`,
  ]
  if (body.reason) lines.push(`Reason: ${body.reason}`)
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

function chain(m: MailContext): string {
  return m.request.stages.map((s) => labelOf(m.offices, s)).join(', then ')
}

export function submittedEmails(m: MailContext): EmailDraft[] {
  const first = m.request.stages[m.request.stageIndex]
  if (!first) return []
  return [
    compose(m, 'request_submitted', inboxesOf(m.offices, [first]), [], {
      statusWord: 'New request',
      intro: `${m.organisation.name} has submitted a room request that needs your review.`,
      next: 'Open it in the Inbox and approve, offer a room, ask for changes or decline.',
    }),
    compose(m, 'request_submitted', [m.organisation.contactEmail], [], {
      statusWord: 'Received',
      intro: 'We have received your room request.',
      next: `It goes through this chain: ${chain(m)}. It is with ${labelOf(m.offices, first)} now. You will get an email at each step.`,
    }),
  ]
}

export function forwardedEmails(m: MailContext, clearedLabel: string, nextId: OfficeId): EmailDraft[] {
  const nextLabel = labelOf(m.offices, nextId)
  return [
    compose(m, 'request_forwarded', inboxesOf(m.offices, [nextId]), [], {
      statusWord: 'Forwarded',
      intro: `${clearedLabel} approved a request from ${m.organisation.name}. It now needs your review.`,
      next: 'Open it in the Inbox and make the next decision.',
    }),
    compose(m, 'request_forwarded', [m.organisation.contactEmail], [], {
      statusWord: 'Approved by ' + clearedLabel,
      intro: `${clearedLabel} approved your request. It is not confirmed yet.`,
      next: `${nextLabel} reviews it next. You will get an email when there is a decision.`,
    }),
  ]
}

export function escalatedEmails(m: MailContext, fromLabel: string, finalId: OfficeId): EmailDraft[] {
  const finalLabel = labelOf(m.offices, finalId)
  return [
    compose(m, 'request_forwarded', inboxesOf(m.offices, [finalId]), [], {
      statusWord: 'Escalated',
      intro: `${fromLabel} escalated a request from ${m.organisation.name} that clashes with another. This is not an endorsement. ${finalLabel} decides between the clashing requests.`,
      next: 'Open the clash and compare the requests.',
    }),
  ]
}

export function confirmedEmails(m: MailContext): EmailDraft[] {
  return [
    compose(m, 'request_confirmed', [m.organisation.contactEmail], inboxesOf(m.offices, m.request.stages), {
      statusWord: 'Confirmed',
      intro: 'Your room is booked.',
      next: 'The booking is ready to be entered in AMS. You do not need to do anything.',
    }),
  ]
}

export function autoApprovedEmails(m: MailContext, ruleName: string): EmailDraft[] {
  return [
    compose(m, 'auto_approved', [m.organisation.contactEmail], inboxesOf(m.offices, m.request.stages), {
      statusWord: 'Confirmed',
      intro: `Your room is booked. It was approved automatically under the rule "${ruleName}".`,
      next: 'The booking is ready to be entered in AMS. You do not need to do anything.',
    }),
  ]
}

export function rejectedEmails(m: MailContext, reason: string, word = 'Declined'): EmailDraft[] {
  return [
    compose(m, 'request_rejected', [m.organisation.contactEmail], [], {
      statusWord: word,
      intro: word === 'Cancelled' ? 'Your confirmed booking was cancelled.' : 'We could not approve your room request.',
      reason,
      next: 'You can submit a new request for a different room, date or time.',
    }),
  ]
}

export function changesRequestedEmails(m: MailContext, reason: string): EmailDraft[] {
  return [
    compose(m, 'changes_requested', [m.organisation.contactEmail], [], {
      statusWord: 'Changes needed',
      intro: 'Your room request needs changes before it can go ahead.',
      reason,
      next: 'Update the request and send it again. If you change the room, date or time it starts again at the first step.',
    }),
  ]
}

export function offeredEmails(m: MailContext, offerRoom: Room, holdUntil: string, reason: string | null, offeredBy: string): EmailDraft[] {
  return [
    compose(m, 'room_offered', [m.organisation.contactEmail], [], {
      statusWord: 'Room offered',
      intro: `${offeredBy} cannot give you ${formatVenue(m.room)} at this time, so it offers another room instead.`,
      reason,
      extraLines: [
        `Offered room: ${formatVenue(offerRoom)} (${offerRoom.capacity} seats)`,
        `Held for you until: ${formatTimestamp(holdUntil)}`,
      ],
      next: 'Accept the offer before the hold ends. After that the room is released and your request goes back to you for changes.',
    }),
  ]
}

export function offerLapsedEmails(m: MailContext): EmailDraft[] {
  return [
    compose(m, 'offer_lapsed', [m.organisation.contactEmail], [], {
      statusWord: 'Offer ended',
      intro: 'The room we offered was not accepted in time, so the hold has ended.',
      next: 'Update your request, for example with another room or time, and send it again.',
    }),
  ]
}

export function clashDetectedEmails(m: MailContext, holders: OfficeId[], competitors: string[]): EmailDraft[] {
  const to = inboxesOf(m.offices, holders)
  if (to.length === 0) return []
  return [
    compose(m, 'clash_detected', to, [], {
      statusWord: 'Clash',
      intro: `A request from ${m.organisation.name} wants a room that another request or booking already wants.`,
      extraLines: competitors.map((c) => `Also wants it: ${c}`),
      next: 'Open the clash in the portal. Academic Booking decides between requests from different offices.',
    }),
  ]
}

export function displacedEmails(m: MailContext, reason: string, byEvent: string): EmailDraft[] {
  return [
    compose(m, 'booking_displaced', [m.organisation.contactEmail], inboxesOf(m.offices, [m.organisation.officeId]), {
      statusWord: 'Booking replaced',
      intro: `Your booked room was given to another event ("${byEvent}") by Academic Booking.`,
      reason,
      next: 'Send a new request for another room or time. Your governing office has been told.',
    }),
  ]
}

export function expiredEmails(m: MailContext): EmailDraft[] {
  return [
    compose(m, 'request_expired', [m.organisation.contactEmail], [], {
      statusWord: 'Expired',
      intro: 'Your request was still undecided when the event started, so it has expired.',
      next: 'Send a new request if you still need a room.',
    }),
  ]
}

export function overdueEmails(m: MailContext, officeId: OfficeId, label: string): EmailDraft[] {
  const to = inboxesOf(m.offices, [officeId])
  if (to.length === 0) return []
  return [
    compose(m, 'step_overdue', to, [], {
      statusWord: 'Overdue',
      intro: `A request has been waiting at ${label} longer than the response target.`,
      next: 'Open it in the Inbox and decide. Overdue requests are listed first.',
    }),
  ]
}
