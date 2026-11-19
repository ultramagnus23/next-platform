'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** Demo only. Moves the clock so waiting, "taking longer" and the reminder unlock can be seen at once. */
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
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        {sandbox ? 'Public sandbox: your own private copy of sample data. No email is sent.' : 'Demo mode. No email is sent.'} Demo date: <strong className="text-foreground">{nowLabel}</strong>
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 bg-background" disabled={busy} onClick={() => advance(1)}>
          Move on 1 day
        </Button>
        <Button size="sm" variant="outline" className="h-8 bg-background" disabled={busy} onClick={() => advance(7)}>
          Move on 7 days
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[#b3261e]">
          {error}
        </p>
      )}
    </div>
  )
}
