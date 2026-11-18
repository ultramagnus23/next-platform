import type { RequestEvent } from '../types'
import { formatInstant } from '../utils'

/** What happened, newest last, with absolute times. Scheduler lines are phrased for the club. */
export function ActivityLog({ events }: { events: RequestEvent[] }) {
  if (events.length === 0) return <p className="text-[var(--s-muted)]">Nothing has happened yet.</p>
  return (
    <ol aria-label="Activity" className="grid gap-2">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-[9.5rem_1fr] gap-x-3 max-sm:grid-cols-1">
          <time dateTime={e.at} className="text-[0.8125rem] text-[var(--s-muted)]">
            {formatInstant(e.at)}
          </time>
          <span>{e.detail}</span>
        </li>
      ))}
    </ol>
  )
}
