'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CalendarItem, Room } from '../types'
import { formatClock, formatRange, statusLabel } from '../utils'
import { BLOCK_STYLES } from './room-timeline'
import { SIMULATE_EVENT } from './simulate-dialog'

const START = 8 * 60
const END = 23 * 60
const SPAN = END - START
const HOURS = Array.from({ length: 16 }, (_, i) => 8 + i)

interface CalendarDayGridProps {
  date: string
  rooms: Room[]
  items: CalendarItem[]
  demo: boolean
}

/** Rooms by building and floor, 08:00 to 23:00. Hover for details, click a block to open it. */
export function CalendarDayGrid({ date, rooms, items, demo }: CalendarDayGridProps) {
  if (rooms.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm">No rooms match these filters.</p>
  }

  const groups = new Map<string, Room[]>()
  for (const room of rooms) {
    const key = `${room.building} · ${room.floor} floor`
    const list = groups.get(key)
    if (list) list.push(room)
    else groups.set(key, [room])
  }

  function startSimulate(room: Room, event: React.MouseEvent<HTMLDivElement>) {
    if (!demo) return
    const box = event.currentTarget.getBoundingClientRect()
    const raw = START + ((event.clientX - box.left) / box.width) * SPAN
    const startMin = Math.min(Math.max(Math.floor(raw / 30) * 30, START), END - 60)
    window.dispatchEvent(
      new CustomEvent(SIMULATE_EVENT, { detail: { roomId: room.id, date, startMin, endMin: startMin + 60 } }),
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="min-w-[1000px]">
        <div className="flex border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <div className="w-40 shrink-0 px-2 py-1.5">Room</div>
          <div className="relative h-7 flex-1" aria-hidden="true">
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute top-1.5 -translate-x-1/2 tabular-nums"
                style={{ left: `${((h * 60 - START) / SPAN) * 100}%` }}
              >
                {formatClock(h * 60)}
              </span>
            ))}
          </div>
        </div>
        {[...groups.entries()].map(([label, groupRooms]) => (
          <div key={label}>
            <div className="border-b border-border bg-muted/20 px-2 py-1 text-xs font-semibold">{label}</div>
            {groupRooms.map((room) => {
              const roomItems = items.filter((i) => i.roomId === room.id).sort((a, b) => a.startMin - b.startMin)
              // Overlapping blocks go in separate lanes so none hides another.
              const laneEnds: number[] = []
              const laneOf = new Map<string, number>()
              for (const item of roomItems) {
                let lane = laneEnds.findIndex((end) => end <= item.startMin)
                if (lane === -1) lane = laneEnds.length
                laneEnds[lane] = item.endMin
                laneOf.set(item.id, lane)
              }
              const lanes = Math.max(laneEnds.length, 1)
              const rowHeight = lanes === 1 ? 48 : lanes * 30 + 8
              return (
                <div key={room.id} className="flex border-b border-border last:border-b-0">
                  <div className="w-40 shrink-0 px-2 py-2 text-sm">
                    <p className="font-medium">{room.name}</p>
                    <p className="text-xs text-muted-foreground">{room.capacity} seats</p>
                  </div>
                  <div
                    className={cn('relative flex-1', demo && 'cursor-cell')}
                    style={{ height: rowHeight }}
                    onClick={(e) => e.target === e.currentTarget && startSimulate(room, e)}
                    role={demo ? 'button' : undefined}
                    aria-label={demo ? `Simulate a request in ${room.name}` : undefined}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="pointer-events-none absolute top-0 h-full border-l border-border/60"
                        style={{ left: `${((h * 60 - START) / SPAN) * 100}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    {roomItems.map((item) => {
                      const left = Math.max(((item.startMin - START) / SPAN) * 100, 0)
                      const width = Math.max(Math.min(((item.endMin - item.startMin) / SPAN) * 100, 100 - left), 1)
                      const label = `${item.eventName} (${item.organisationName}), ${formatRange(item.startMin, item.endMin)}, ${statusLabel(item.status)}${item.inConflict ? ', in conflict' : ''}`
                      const className = cn(
                        'absolute flex items-center overflow-hidden rounded border px-1.5 text-xs font-medium',
                        BLOCK_STYLES[item.status],
                        item.inConflict && 'ring-2 ring-red-500 ring-offset-1',
                      )
                      const lane = laneOf.get(item.id) ?? 0
                      const style =
                        lanes === 1
                          ? { left: `${left}%`, width: `${width}%`, top: 4, height: 40 }
                          : { left: `${left}%`, width: `${width}%`, top: 4 + lane * 30, height: 26 }
                      return item.canOpen ? (
                        <Link
                          key={item.id}
                          href={`/admin/bookings/requests/${item.id}`}
                          title={label}
                          aria-label={label}
                          className={className}
                          style={style}
                        >
                          <span className="truncate"><b className="mr-1 font-mono">{item.organisationCode}</b>{item.eventName}</span>
                        </Link>
                      ) : (
                        <div key={item.id} title={label} aria-label={label} className={className} style={style}>
                          <span className="truncate"><b className="mr-1 font-mono">{item.organisationCode}</b>{item.eventName}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
