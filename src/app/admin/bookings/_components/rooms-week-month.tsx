import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { MonthDay, Room, TimelineBlock } from '../types'
import { addDays, formatDate, formatMonth, formatVenue, startOfMonth, startOfWeek, weekdayOf } from '../utils'
import { ParamSelect } from './param-select'
import { RoomTimeline } from './room-timeline'

type Href = (patch: Record<string, string | undefined>) => string

const NAV = 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent'

export function RoomsWeek({
  rooms,
  roomId,
  date,
  today,
  week,
  href,
  switcher,
}: {
  rooms: Room[]
  roomId: string
  date: string
  today: string
  week: Array<{ date: string; blocks: TimelineBlock[] }>
  href: Href
  switcher: React.ReactNode
}) {
  const room = rooms.find((r) => r.id === roomId)
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Rooms</h1>
          <p className="text-sm text-muted-foreground">
            {room ? formatVenue(room) : ''}, week of {formatDate(startOfWeek(date))}.
          </p>
        </div>
        {switcher}
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <ParamSelect param="room" label="Room" value={roomId} options={rooms.map((r) => ({ value: r.id, label: `${r.building}, ${r.name} (${r.capacity} seats)` }))} />
        <Link href={href({ date: addDays(date, -7) })} className={NAV}>
          Previous week
        </Link>
        <Link href={href({ date: today })} className={NAV}>
          This week
        </Link>
        <Link href={href({ date: addDays(date, 7) })} className={NAV}>
          Next week
        </Link>
      </div>
      <div className="grid gap-3">
        {week.map((d) => (
          <section key={d.date} aria-label={formatDate(d.date)} className="rounded-lg border border-border bg-card p-3">
            <h2>{d.date === today ? `Today, ${formatDate(d.date)}` : formatDate(d.date)}</h2>
            <RoomTimeline blocks={d.blocks} />
            {d.blocks.length === 0 && <p className="mt-1 text-sm text-muted-foreground">Free all day.</p>}
          </section>
        ))}
      </div>
    </div>
  )
}

export function RoomsMonth({
  buildings,
  building,
  date,
  today,
  month,
  href,
  switcher,
  addMonths,
}: {
  buildings: string[]
  building: string | undefined
  date: string
  today: string
  month: MonthDay[]
  href: Href
  switcher: React.ReactNode
  addMonths: (d: string, n: number) => string
}) {
  const gridStart = startOfWeek(startOfMonth(date))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const byDate = new Map(month.map((m) => [m.date, m]))
  const key = date.slice(0, 7)
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Rooms</h1>
          <p className="text-sm text-muted-foreground">{formatMonth(date)}. Confirmed and waiting events per day. A red dot marks a day with an open clash.</p>
        </div>
        {switcher}
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <ParamSelect param="building" label="Building" value={building} allLabel="All buildings" options={buildings.map((b) => ({ value: b, label: b }))} />
        <Link href={href({ date: addMonths(date, -1) })} className={NAV}>
          Previous month
        </Link>
        <Link href={href({ date: today })} className={NAV}>
          This month
        </Link>
        <Link href={href({ date: addMonths(date, 1) })} className={NAV}>
          Next month
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="grid min-w-[640px] grid-cols-7">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="bg-muted/40 px-2 py-1.5 text-center text-xs font-medium">
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const m = byDate.get(d)
            const inMonth = d.startsWith(key)
            return (
              <Link
                key={d}
                href={href({ view: 'day', date: d })}
                aria-label={`${formatDate(d)}: ${m?.confirmed ?? 0} confirmed, ${m?.waiting ?? 0} waiting${m && m.clashes > 0 ? ', open clash' : ''}`}
                className={cn('min-h-20 border-l border-t border-border p-2 text-sm hover:bg-accent/40', !inMonth && 'bg-muted/20 text-muted-foreground', weekdayOf(d) === 1 && 'border-l-0')}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{Number(d.slice(8))}</span>
                  {m && m.clashes > 0 && <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />}
                </div>
                {inMonth && m && (
                  <div className="mt-1 grid gap-0.5 text-xs">
                    {m.confirmed > 0 && <span className="text-[#1d6b3f] dark:text-emerald-300">{m.confirmed} confirmed</span>}
                    {m.waiting > 0 && <span className="text-[#7a4b00] dark:text-amber-300">{m.waiting} waiting</span>}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
