'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Phase = 'choose' | 'reason' | 'sending' | 'done'

/** The confirmation step. A reason is required to not approve. Each button names what it does. */
export function ApproveForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('choose')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  // The button that was pressed disappears, so put focus where the person goes next.
  useEffect(() => {
    if (phase === 'reason') reasonRef.current?.focus()
  }, [phase])

  async function send(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !reason.trim()) {
      setError('Write a reason. The club sees it in full.')
      reasonRef.current?.focus()
      return
    }
    setPhase('sending')
    setError(null)
    try {
      const res = await fetch(`/api/student/approve/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(decision === 'approve' ? { decision } : { decision, reason }),
      })
      const body = (await res.json()) as { success: boolean; error?: string; data?: { status: string } }
      if (!body.success) {
        setError(body.error ?? 'Something went wrong. Nothing was changed.')
        setPhase(decision === 'reject' ? 'reason' : 'choose')
        return
      }
      setMessage(`Done. The request is now: ${body.data?.status ?? 'updated'}.`)
      setPhase('done')
    } catch {
      setError('The request could not be sent. Check your connection and try again.')
      setPhase(decision === 'reject' ? 'reason' : 'choose')
    }
  }

  if (phase === 'done') {
    return (
      <p role="status" className="rounded-lg border border-border p-3">
        {message}
      </p>
    )
  }

  return (
    <div className="grid gap-3">
      {error && (
        <p id="approve-error" role="alert" className="text-[#b3261e]">
          {error}
        </p>
      )}
      {phase === 'reason' && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Reason for not approving</span>
          <Textarea ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} rows={4} required aria-invalid={error ? true : undefined} aria-describedby={error ? 'approve-error' : undefined} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {phase !== 'reason' && (
          <Button disabled={phase === 'sending'} onClick={() => send('approve')}>
            Approve this request
          </Button>
        )}
        {phase === 'choose' || phase === 'sending' ? (
          <Button variant="outline" disabled={phase === 'sending'} onClick={() => setPhase('reason')}>
            Do not approve
          </Button>
        ) : (
          <>
            <Button onClick={() => send('reject')}>
              Send reason and do not approve
            </Button>
            <Button variant="outline" onClick={() => setPhase('choose')}>
              Go back
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
