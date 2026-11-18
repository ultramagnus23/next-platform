'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { FollowupReason, FollowupResult } from '../logic/followup'
import { formatDay, formatInstant, istDateOf } from '../utils'

interface FollowupPanelProps {
  requestId: string
  role: string | null
  followup: FollowupResult
  waitDays: number
  /** Days before the event that allow one early reminder. */
  urgencyDays: number
  /** The event date, so the urgency explanation can name it. */
  eventDate: string
}

type Phase = 'idle' | 'sending' | 'sent' | 'failed'

function lockedText(reason: FollowupReason, unlockAt: string | null, waitDays: number): string {
  if (reason === 'urgency_used') return 'You already sent the one early reminder for this event. Offices were told it is close.'
  if (reason === 'event_passed') return 'This event has started, so reminders are closed.'
  if (reason === 'org_daily_cap') return 'Your club reached the daily limit for reminders. Try again tomorrow.'
  if (reason === 'not_pending') return 'This request is no longer waiting, so there is nothing to remind.'
  return unlockAt ? `You can send a reminder on ${formatDay(istDateOf(new Date(unlockAt)))}. Offices have ${waitDays} days to respond.` : 'A reminder is not available yet.'
}

/**
 * The follow-up area. The button is always on the page. When it is locked it says why and gives the exact
 * date as text, not a tooltip, and uses aria-disabled so it stays in the tab order. The server decides:
 * if it refuses, the reason and unlock date it sends back are shown here.
 */
export function FollowupPanel({ requestId, role, followup, waitDays, urgencyDays, eventDate }: FollowupPanelProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ reason: FollowupReason; unlockAt: string | null } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const locked = !followup.eligible || refusal !== null || phase === 'sent'
  const reason = refusal?.reason ?? followup.reason
  const unlockAt = refusal?.unlockAt ?? followup.unlockAt

  async function send() {
    if (locked || phase === 'sending') return
    setPhase('sending')
    setFailure(null)
    try {
      const res = await fetch(`/api/student/requests/${requestId}/followup`, { method: 'POST' })
      const body = (await res.json()) as { success: boolean; error?: string; reason?: FollowupReason; unlockAt?: string | null }
      if (body.success) {
        setSentAt(new Date().toISOString())
        setPhase('sent')
        router.refresh()
        return
      }
      if (res.status === 409 && body.reason) {
        setRefusal({ reason: body.reason, unlockAt: body.unlockAt ?? null })
        setPhase('idle')
        return
      }
      setFailure(body.error ?? 'The reminder was not sent.')
      setPhase('failed')
    } catch {
      setFailure('The reminder could not be sent. Check your connection.')
      setPhase('failed')
    }
  }

  const label = phase === 'sending' ? 'Sending reminder' : phase === 'failed' ? 'Try sending again' : `Send a reminder${role ? ` to ${role}` : ''}`
  const disabled = (locked && phase !== 'sent') || phase === 'sending'

  return (
    <section aria-labelledby="followup-title" className="grid gap-2 border-t border-[var(--s-line)] pt-4">
      <h2 id="followup-title">Follow up</h2>
      <div>
        <button
          type="button"
          className="s-btn"
          aria-disabled={disabled || phase === 'sent'}
          aria-busy={phase === 'sending'}
          aria-describedby="followup-help"
          onClick={send}
        >
          {label}
        </button>
      </div>
      <div id="followup-help" aria-live="polite" className="text-[0.9375rem]">
        {phase === 'sent' ? (
          <p>Reminder sent{sentAt ? ` on ${formatInstant(sentAt)}` : ''}. {role ?? 'The office'} and you were emailed. {!followup.eligible && followup.unlockAt ? `You can send another on ${formatDay(istDateOf(new Date(followup.unlockAt)))}.` : `You can send another after ${waitDays} days.`}</p>
        ) : phase === 'failed' ? (
          <p role="alert" className="text-[var(--s-bad-fg)]">
            {failure} Nothing was sent. Your request is unchanged.
          </p>
        ) : locked ? (
          <p>{lockedText(reason, unlockAt, waitDays)}</p>
        ) : followup.urgencyOverride ? (
          <p>Your event is on {formatDay(eventDate)}, less than {urgencyDays} days away, so you can send one early reminder now.</p>
        ) : (
          <p>The office gets a reminder email and you are copied. You can send one every {waitDays} days.</p>
        )}
      </div>
    </section>
  )
}
