'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** Demo only. Plays the office whose turn it is, so the path and the outcome states can be watched. */
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
    <section aria-labelledby="demo-office" className="grid gap-2 rounded-2xl border border-dashed border-border bg-background p-4">
      <h2 id="demo-office">Demo: play the office</h2>
      <p className="text-sm text-muted-foreground">For the pitch only. Decide as {role} and watch the path change.</p>
      {error && <p className="text-[#b3261e]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => decide('approve')}>
          Approve as {role}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => decide('reject')}>
          Do not approve as {role}
        </Button>
      </div>
    </section>
  )
}
