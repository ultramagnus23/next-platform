import { cn } from '@/lib/utils'
import type { TimelineBlock, TimelineKind } from '../types'
import { formatClock, formatCompactRange } from '../utils'

interface RoomTimelineProps {
  blocks: TimelineBlock[]
  /** The request being looked at, drawn in crimson. */
  highlightId?: string
  startHour?: number
  endHour?: number
  className?: string
}

export const KIND_STYLE: Record<TimelineKind, string> = {
  class: 'border-border bg-muted text-muted-foreground',
  booked: 'border-slate-700 bg-slate-700 text-white dark:border-slate-500 dark:bg-slate-600',
  competes: 'border-2 border-dashed border-primary bg-background text-foreground',
  held: 'border-2 border-dotted border-primary bg-background text-foreground',
}

const KIND_LABEL: Record<TimelineKind, string> = {
  class: 'Class',
  booked: 'Booked',
  competes: 'Waiting for approval',
  held: 'Offered and held',
}

/**
 * One room, one day, on a shared axis. Classes are grey, this request is
 * crimson, competing requests have a red outline. Every block has a text
 * label, so colour is never the only signal.
 */
export function RoomTimeline({ blocks, highlightId, startHour = 8, endHour = 23, className }: RoomTimelineProps) {
  const from = startHour * 60
  const span = (endHour - startHour) * 60
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).filter((h) => h % 2 === 0)
  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="relative h-4 text-xs text-muted-foreground" aria-hidden="true">
            {hours.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${((h * 60 - from) / span) * 100}%` }}>
                {formatClock(h * 60)}
              </span>
            ))}
          </div>
          <div className="relative h-11 rounded-md border border-border bg-muted/20">
            {hours.map((h) => (
              <div key={h} className="absolute top-0 h-full border-l border-border/60" style={{ left: `${((h * 60 - from) / span) * 100}%` }} aria-hidden="true" />
            ))}
            {blocks.map((b) => {
              const left = Math.max(((b.startMin - from) / span) * 100, 0)
              const right = Math.min(((b.endMin - from) / span) * 100, 100)
              const mine = highlightId !== undefined && b.requestId === highlightId
              const label = `${b.label}, ${formatCompactRange(b.startMin, b.endMin)}, ${mine ? 'this request' : KIND_LABEL[b.kind]}${b.inClash ? ', in a clash' : ''}`
              return (
                <div
                  key={b.id}
                  role="img"
                  aria-label={label}
                  title={label}
                  className={cn(
                    'absolute top-1 flex h-9 items-center overflow-hidden rounded border px-1.5 text-xs font-medium',
                    mine ? 'border-primary bg-primary text-white' : KIND_STYLE[b.kind],
                    !mine && b.inClash && 'border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100',
                  )}
                  style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
                >
                  <span className="truncate">{b.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-border bg-muted" aria-hidden="true" /> Class
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-primary bg-primary" aria-hidden="true" /> This request
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2 border-red-600 bg-red-50" aria-hidden="true" /> In a clash
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-slate-700 bg-slate-700" aria-hidden="true" /> Booked
        </li>
      </ul>
    </div>
  )
}
