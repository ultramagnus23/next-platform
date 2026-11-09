'use client'

import { Button } from '@/components/ui/button'

export default function BookingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center" role="alert">
      <p className="font-medium">This page could not load.</p>
      <p className="mt-1 text-sm text-muted-foreground">Try again. If it keeps failing, reset the demo data.</p>
      <Button className="mt-4" variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
