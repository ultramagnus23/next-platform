'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/** Cancel with an inline confirmation, so a stray tap does not cancel a request. */
export function CancelRequest({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (asking) confirmRef.current?.focus()
  }, [asking])

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
      <Button variant="outline" onClick={() => setAsking(true)}>
        Cancel this request
      </Button>
    )
  }
  return (
    <div ref={confirmRef} tabIndex={-1} className="grid gap-2 outline-none animate-in fade-in duration-150" role="group" aria-label="Confirm cancel">
      <p>Cancel this request? The offices on the path are told, and you cannot undo it.</p>
      {error && <p className="text-[#b3261e]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={cancel}>
          {busy ? 'Cancelling' : 'Yes, cancel request'}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setAsking(false)}>
          Keep the request
        </Button>
      </div>
    </div>
  )
}
