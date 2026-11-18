'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Phase = 'choose' | 'reason' | 'sending' | 'done'

/** The confirmation step. A reason is required to not approve. Each button names what it does. */
export function ApproveForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('choose')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !reason.trim()) {
      setError('Write a reason. The club sees it in full.')
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
        <p role="alert" className="text-sm text-[#b3261e]">
          {error}
        </p>
      )}
      {phase === 'reason' && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Reason for not approving</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} aria-required="true" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {phase !== 'reason' && (
          <Button className="min-h-11" disabled={phase === 'sending'} onClick={() => send('approve')}>
            Approve this request
          </Button>
        )}
        {phase === 'choose' || phase === 'sending' ? (
          <Button className="min-h-11" variant="outline" disabled={phase === 'sending'} onClick={() => setPhase('reason')}>
            Do not approve
          </Button>
        ) : (
          <>
            <Button className="min-h-11" variant="destructive" onClick={() => send('reject')}>
              Send reason and do not approve
            </Button>
            <Button className="min-h-11" variant="ghost" onClick={() => setPhase('choose')}>
              Go back
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
