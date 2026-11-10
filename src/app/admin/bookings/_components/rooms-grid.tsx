'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { RoomDayRow, TimelineBlock } from '../types'
import { formatClock, formatCompactRange } from '../utils'
import { SIMULATE_EVENT, SimulateDialog, type SimulateOptions } from './simulate-dialog'

const START = 8 * 60
const END = 23 * 60
const SPAN = END - START
const HOURS = Array.from({ length: 16 }, (_, i) => 8 + i)

const BLOCK_STYLE: Record<TimelineBlock['kind'], string> = {
  class: 'border-border bg-muted text-muted-foreground',
  booked: 'border-primary bg-primary text-white',
  competes: 'border-2 border-dashed border-primary bg-background text-foreground',
  held: 'border-2 border-dotted border-primary bg-background text-foreground',
}

const KIND_WORD: Record<TimelineBlock['kind'], string> = {
  class: 'Class',
  booked: 'Confirmed',
  competes: 'Waiting for approval',
  held: 'Offered and held',
}

interface BuildingGroup {
  building: string
  rows: RoomDayRow[]
  free: number
}

interface RoomsGridProps {
  date: string
  groups: BuildingGroup[]
  openBuilding: string | null
  windowFrom: number | null
  windowTo: number | null
  nowMin: number | null
  canBook: boolean
  demo: boolean
  windowLabel: string
  directOptions: SimulateOptions
}

/** The day grid: plain divs with percentage positions, so 104 rooms stay light. */
export function RoomsGrid({ date, groups, openBuilding, windowFrom, windowTo, nowMin, canBook, demo, windowLabel, directOptions }: RoomsGridProps) {
  const [direct, setDirect] = useState<{ roomId: string; startMin: number } | null>(null)

  function onTrackClick(roomId: string, e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const box = e.currentTarget.getBoundingClientRect()
    const raw = START + ((e.clientX - box.left) / box.width) * SPAN
    const startMin = Math.min(Math.max(Math.floor(raw / 30) * 30, START), END - 60)
    if (canBook) setDirect({ roomId, startMin })
    else if (demo) window.dispatchEvent(new CustomEvent(SIMULATE_EVENT, { detail: { roomId, date, startMin, endMin: startMin + 60 } }))
  }

  const pct = (m: number) => `${((m - START) / SPAN) * 100}%`

  return (
    <div className="grid gap-3">
      {groups.map((g) => (
        <details key={g.building} open={g.building === openBuilding} className="group overflow-hidden rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
            <span className="font-semibold">
              {g.building} <span className="font-normal text-muted-foreground">{g.rows.length} rooms</span>
            </span>
            <span className="text-sm text-[#1d6b3f] dark:text-emerald-300">
              {g.free} free{windowLabel ? ` ${windowLabel}` : ''}
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-border">
            <div className="min-w-[900px]">
              <div className="flex border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <div className="w-[190px] shrink-0 px-3 py-1.5">Room</div>
                <div className="relative h-6 flex-1" aria-hidden="true">
                  {HOURS.filter((h) => h % 1 === 0).map((h) => (
                    <span key={h} className="absolute top-1.5 -translate-x-1/2 tabular-nums" style={{ left: pct(h * 60) }}>
                      {formatClock(h * 60)}
                    </span>
                  ))}
                </div>
              </div>
              {g.rows.map((row) => (
                <div key={row.room.id} className="flex border-b border-border last:border-b-0">
                  <div className="w-[190px] shrink-0 px-3 py-1.5 text-sm">
                    <p className="font-medium">
                      {row.room.floor} · {row.room.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.room.capacity} seats{row.room.bookableByClubs ? '' : ' · classes only'}</p>
                  </div>
                  <div
                    className={cn('relative h-11 flex-1', (canBook || demo) && 'cursor-cell')}
                    onClick={(e) => onTrackClick(row.room.id, e)}
                  >
                    {windowFrom !== null && windowTo !== null && (
                      <div
                        className="pointer-events-none absolute top-0 h-full bg-emerald-500/15"
                        style={{ left: pct(windowFrom), width: `calc(${pct(windowTo)} - ${pct(windowFrom)})` }}
                        aria-hidden="true"
                      />
                    )}
                    {HOURS.map((h) => (
                      <div key={h} className="pointer-events-none absolute top-0 h-full border-l border-border/50" style={{ left: pct(h * 60) }} aria-hidden="true" />
                    ))}
                    {nowMin !== null && <div className="pointer-events-none absolute top-0 h-full border-l-2 border-red-600" style={{ left: pct(nowMin) }} aria-hidden="true" />}
                    {row.blocks.map((b) => {
                      const left = Math.max(((b.startMin - START) / SPAN) * 100, 0)
                      const width = Math.max(Math.min(((b.endMin - b.startMin) / SPAN) * 100, 100 - left), 0.8)
                      const label = `${b.label}, ${formatCompactRange(b.startMin, b.endMin)}, ${KIND_WORD[b.kind]}${b.inClash ? ', in a clash' : ''}`
                      const cls = cn(
                        'absolute top-1 flex h-9 items-center overflow-hidden rounded border px-1.5 text-xs font-medium',
                        BLOCK_STYLE[b.kind],
                        b.inClash && 'border-2 border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100',
                      )
                      const style = { left: `${left}%`, width: `${width}%` }
                      return b.requestId ? (
                        <Link key={b.id} href={`/admin/bookings/requests/${b.requestId}`} title={label} aria-label={label} className={cls} style={style}>
                          <span className="truncate">{b.label}</span>
                        </Link>
                      ) : (
                        <div key={b.id} title={label} aria-label={label} className={cls} style={style}>
                          <span className="truncate">{b.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}
      <SimulateDialog
        open={direct !== null}
        onOpenChange={(o) => !o && setDirect(null)}
        options={{ ...directOptions, today: date }}
        prefill={direct ? { roomId: direct.roomId, date, startMin: direct.startMin, endMin: direct.startMin + 60 } : null}
        endpoint="/direct-bookings"
        title="Book a room directly"
        intro="For a department, ministry or office. It is confirmed at once and ready for AMS."
        submitLabel="Book room"
      />
    </div>
  )
}
