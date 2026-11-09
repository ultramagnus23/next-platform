import { cn } from '@/lib/utils'
import type { RequestStatus, TimelineBlock } from '../types'
import { formatClock, formatRange, statusLabel } from '../utils'

interface RoomTimelineProps {
  blocks: TimelineBlock[]
  highlightId?: string
  startHour?: number
  endHour?: number
  className?: string
}

export const BLOCK_STYLES: Record<RequestStatus, string> = {
  confirmed: 'border-emerald-700 bg-emerald-600 text-white',
  pending: 'border-amber-600 border-2 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100',
  changes_requested: 'border-sky-600 border-2 border-dashed bg-sky-50 text-sky-950 dark:bg-sky-950/60 dark:text-sky-100',
  rejected: 'border-border bg-muted text-muted-foreground',
  withdrawn: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-border bg-muted text-muted-foreground',
  displaced: 'border-border bg-muted text-muted-foreground',
}

/**
 * One room, one day. Blocks sit on a shared time axis: confirmed solid,
 * pending outlined, changes requested dashed, conflicts in a red ring.
 */
export function RoomTimeline({ blocks, highlightId, startHour = 8, endHour = 23, className }: RoomTimelineProps) {
  const from = startHour * 60
  const span = (endHour - startHour) * 60
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="relative h-5 text-xs text-muted-foreground" aria-hidden="true">
            {hours.map((h) => (
              <span
                key={h}
                className="absolute -translate-x-1/2 tabular-nums"
                style={{ left: `${((h * 60 - from) / span) * 100}%` }}
              >
                {formatClock(h * 60)}
              </span>
            ))}
          </div>
          <div className="relative h-14 rounded-md border border-border bg-muted/30">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute top-0 h-full border-l border-border/60"
                style={{ left: `${((h * 60 - from) / span) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            {blocks.map((block) => {
              const left = Math.max(((block.startMin - from) / span) * 100, 0)
              const right = Math.min(((block.endMin - from) / span) * 100, 100)
              const label = `${block.eventName}, ${formatRange(block.startMin, block.endMin)}, ${statusLabel(block.status)}${block.inConflict ? ', in conflict' : ''}`
              return (
                <div
                  key={block.requestId}
                  role="img"
                  aria-label={label}
                  title={label}
                  className={cn(
                    'absolute top-1 flex h-12 items-center overflow-hidden rounded border px-1.5 text-xs font-medium',
                    BLOCK_STYLES[block.status],
                    block.inConflict && 'ring-2 ring-red-500 ring-offset-1',
                    highlightId === block.requestId && 'outline outline-2 outline-offset-1 outline-primary',
                  )}
                  style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
                >
                  <span className="truncate">{block.eventName}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-emerald-700 bg-emerald-600" aria-hidden="true" /> Confirmed
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2 border-amber-600 bg-amber-50" aria-hidden="true" /> Pending
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2 border-dashed border-sky-600 bg-sky-50" aria-hidden="true" /> Changes
          requested
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm ring-2 ring-red-500" aria-hidden="true" /> In conflict
        </li>
      </ul>
    </div>
  )
}
