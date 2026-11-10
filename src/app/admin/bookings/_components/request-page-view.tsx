'use client'

import { useRouter } from 'next/navigation'
import type { RequestDetail } from '../types'
import { RequestPane } from './request-pane'

/** The same detail pane as the Inbox, on its own page, for requests found from the grid or search. */
export function RequestPageView({ detail, demo }: { detail: RequestDetail; demo: boolean }) {
  const router = useRouter()
  return (
    <div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card p-4">
      <RequestPane detail={detail} demo={demo} onDone={() => router.refresh()} />
    </div>
  )
}
