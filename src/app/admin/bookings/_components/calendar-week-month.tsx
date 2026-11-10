import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CalendarItem, Room } from '../types'
import { addDays, formatClock, formatDate, formatRange, startOfWeek, statusLabel, weekdayOf } from '../utils'
import { BLOCK_STYLES } from './room-timeline'

const START = 8 * 60
const END = 23 * 60
const PX_PER_HOUR = 40

/** One room, seven days, 08:00 to 23:00. */
export function CalendarWeek({ date, room, items }: { date: string; room: Room | undefined; items: CalendarItem[] }) {
  if (!room) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm">Choose a room to see its week.</p>
  const monday = startOfWeek(date)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const hours = Array.from({ length: 16 }, (_, i) => 8 + i)
  const height = ((END - START) / 60) * PX_PER_HOUR

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="grid min-w-[840px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <div />
        {days.map((d) => (
          <Link
            key={d}
            href={`?view=day&date=${d}&roomId=${room.id}`}
            className="border-l border-border bg-muted/40 px-2 py-1.5 text-center text-xs font-medium hover:underline"
          >
            {formatDate(d)}
          </Link>
        ))}
        <div className="relative" style={{ height }} aria-hidden="true">
          {hours.map((h) => (
            <span
              key={h}
              className="absolute right-1 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
              style={{ top: ((h * 60 - START) / 60) * PX_PER_HOUR }}
            >
              {formatClock(h * 60)}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className="relative border-l border-border" style={{ height }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute w-full border-t border-border/60"
                style={{ top: ((h * 60 - START) / 60) * PX_PER_HOUR }}
                aria-hidden="true"
              />
            ))}
            {items
              .filter((i) => i.date === d)
              .map((item) => {
                const top = ((item.startMin - START) / 60) * PX_PER_HOUR
                const h = Math.max(((item.endMin - item.startMin) / 60) * PX_PER_HOUR, 14)
                const label = `${item.eventName} (${item.organisationName}), ${formatRange(item.startMin, item.endMin)}, ${statusLabel(item.status)}`
                const className = cn(
                  'absolute inset-x-0.5 overflow-hidden rounded border px-1 text-xs font-medium',
                  BLOCK_STYLES[item.status],
                  item.inConflict && 'ring-2 ring-red-500',
                )
                return item.canOpen ? (
                  <Link key={item.id} href={`/admin/bookings/requests/${item.id}`} title={label} aria-label={label} className={className} style={{ top, height: h }}>
                    <b className="mr-1 font-mono">{item.organisationCode}</b>{item.eventName}
                  </Link>
                ) : (
                  <div key={item.id} title={label} aria-label={label} className={className} style={{ top, height: h }}>
                    <b className="mr-1 font-mono">{item.organisationCode}</b>{item.eventName}
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Day grid with counts. A red dot marks days with an open conflict. */
export function CalendarMonth({
  date,
  items,
  conflictDates,
  carry,
}: {
  date: string
  items: CalendarItem[]
  conflictDates: string[]
  /** Query string pieces to keep when jumping to a day. */
  carry: string
}) {
  const first = `${date.slice(0, 7)}-01`
  const gridStart = startOfWeek(first)
  const month = date.slice(0, 7)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const weeks = days.slice(35).every((d) => !d.startsWith(month)) ? 5 : 6

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="grid min-w-[640px] grid-cols-7">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="bg-muted/40 px-2 py-1.5 text-center text-xs font-medium">
            {d}
          </div>
        ))}
        {days.slice(0, weeks * 7).map((d) => {
          const inMonth = d.startsWith(month)
          const todays = items.filter((i) => i.date === d)
          const confirmed = todays.filter((i) => i.status === 'confirmed').length
          const pending = todays.length - confirmed
          const conflict = conflictDates.includes(d)
          return (
            <Link
              key={d}
              href={`?view=day&date=${d}${carry}`}
              className={cn(
                'min-h-24 border-l border-t border-border p-2 text-sm hover:bg-accent/40',
                !inMonth && 'bg-muted/20 text-muted-foreground',
                weekdayOf(d) === 1 && 'border-l-0',
              )}
              aria-label={`${formatDate(d)}: ${confirmed} confirmed, ${pending} pending${conflict ? ', open conflict' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{Number(d.slice(8))}</span>
                {conflict && <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />}
              </div>
              {inMonth && (
                <div className="mt-2 grid gap-0.5 text-xs">
                  {confirmed > 0 && <span className="text-emerald-700 dark:text-emerald-300">{confirmed} confirmed</span>}
                  {pending > 0 && <span className="text-amber-700 dark:text-amber-300">{pending} pending</span>}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
