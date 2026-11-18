'use client'

import type { AgendaRow } from '../types'
import { formatCompactRange } from '../utils'
import { EventPopover } from './event-popover'

/** One line in the Calendar. Click for the detail in a popup, so the list stays short. */
export function AgendaRowItem({ row, statusText }: { row: AgendaRow; statusText: string }) {
  const r = row
  return (
    <EventPopover
      title={r.request.eventName}
      status={statusText}
      lines={[`${r.organisationName} · ${r.categoryLabel}`, r.roomLabel, formatCompactRange(r.request.startMin, r.request.endMin)]}
      href={`/admin/bookings/requests/${r.request.id}`}
    >
      <button type="button" className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left hover:bg-accent/50">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{r.request.eventName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {r.organisationName} · {r.categoryLabel}
          </span>
        </span>
        <span className="min-w-0 text-xs">
          <span className="block truncate">{r.roomLabel}</span>
          <span className="block text-muted-foreground">{formatCompactRange(r.request.startMin, r.request.endMin)}</span>
        </span>
        <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs">{statusText}</span>
      </button>
    </EventPopover>
  )
}
