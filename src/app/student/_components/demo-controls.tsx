'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Demo only. Moves the clock so waiting, "taking longer" and the follow-up unlock can be seen at once. */
export function DemoControls({ sandbox, nowLabel }: { sandbox: boolean; nowLabel: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function advance(days: number) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/student/demo/advance-clock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days }) })
      const body = (await res.json()) as { success: boolean; error?: string }
      if (!body.success) setError(body.error ?? 'The clock did not move.')
      else router.refresh()
    } catch {
      setError('The clock did not move. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-[var(--s-line)] bg-[var(--s-raised)]">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[0.8125rem]">
        <p className="min-w-0 flex-1 basis-64">
          {sandbox ? 'Public sandbox: your own private copy of sample data. No email is sent.' : 'Demo mode. No email is sent.'} Demo date: <strong>{nowLabel}</strong>
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="s-btn s-btn--quiet" disabled={busy} onClick={() => advance(1)}>
            Move on 1 day
          </button>
          <button type="button" className="s-btn s-btn--quiet" disabled={busy} onClick={() => advance(7)}>
            Move on 7 days
          </button>
        </div>
        {error && (
          <p role="alert" className="basis-full text-[var(--s-bad-fg)]">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
