'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Demo only. Plays the office whose turn it is, so the stepper and the outcome states can be watched. */
export function OfficeDemo({ requestId, role }: { requestId: string; role: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      const payload = decision === 'approve' ? { decision, by: role } : { decision, by: role, reason: 'The space is held for another event on that evening. Please choose another date.' }
      const res = await fetch(`/api/student/demo/decide/${requestId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const body = (await res.json()) as { success: boolean; error?: string }
      if (!body.success) setError(body.error ?? 'The demo decision failed.')
      else router.refresh()
    } catch {
      setError('The demo decision failed. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="demo-office" className="grid gap-2 border-t border-dashed border-[var(--s-line-strong)] pt-4">
      <h2 id="demo-office">Demo: play the office</h2>
      <p className="text-[0.8125rem] text-[var(--s-muted)]">For the pitch only. Decide as {role} and watch the path above change.</p>
      {error && (
        <p role="alert" className="text-[var(--s-bad-fg)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="s-btn s-btn--quiet" disabled={busy} onClick={() => decide('approve')}>
          Approve as {role}
        </button>
        <button type="button" className="s-btn s-btn--quiet" disabled={busy} onClick={() => decide('reject')}>
          Do not approve as {role}
        </button>
      </div>
    </section>
  )
}
