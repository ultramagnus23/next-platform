'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Cancel with an inline confirmation, so a stray tap does not cancel a request. */
export function CancelRequest({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/student/requests/${requestId}/cancel`, { method: 'POST' })
      const body = (await res.json()) as { success: boolean; error?: string }
      if (!body.success) {
        setError(body.error ?? 'The request was not cancelled.')
        return
      }
      router.refresh()
    } catch {
      setError('The request could not be cancelled. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  if (!asking) {
    return (
      <button type="button" className="s-btn s-btn--quiet" onClick={() => setAsking(true)}>
        Cancel this request
      </button>
    )
  }
  return (
    <div className="grid gap-2" role="group" aria-label="Confirm cancel">
      <p>Cancel this request? The offices on the path are told, and you cannot undo it.</p>
      {error && (
        <p role="alert" className="text-[var(--s-bad-fg)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="s-btn" disabled={busy} onClick={cancel}>
          {busy ? 'Cancelling' : 'Yes, cancel request'}
        </button>
        <button type="button" className="s-btn s-btn--quiet" disabled={busy} onClick={() => setAsking(false)}>
          Keep the request
        </button>
      </div>
    </div>
  )
}
