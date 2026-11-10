'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatClock } from '../utils'

const EQUIPMENT = ['Projector', 'Mic', 'Stage', 'Whiteboard', 'Lab']
const ALL = 'all'

interface FindBarProps {
  date: string
  from: number
  to: number
  seats: number
  building: string | undefined
  needs: string[]
  freeOnly: boolean
  buildings: string[]
}

function toMin(v: string): number {
  const [h, m] = v.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** One panel: date, window, seats, building, equipment and a free-only toggle. State lives in the URL. */
export function RoomsFindBar(p: FindBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [seats, setSeats] = useState(String(p.seats || ''))

  function update(patch: Record<string, string | undefined>) {
    const next: Record<string, string | undefined> = {
      date: p.date,
      from: String(p.from),
      to: String(p.to),
      seats: p.seats ? String(p.seats) : undefined,
      building: p.building,
      needs: p.needs.length ? p.needs.join(',') : undefined,
      free: p.freeOnly ? '1' : undefined,
      ...patch,
    }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v && v !== ALL) params.set(k, v)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <section aria-label="Find a room" className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-4 xl:grid-cols-7">
      <div className="grid gap-1">
        <Label htmlFor="f-date" className="text-xs text-muted-foreground">Date</Label>
        <Input id="f-date" type="date" className="h-8" value={p.date} onChange={(e) => e.target.value && update({ date: e.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="f-from" className="text-xs text-muted-foreground">From</Label>
        <Input id="f-from" type="time" step={900} className="h-8" value={formatClock(p.from)} onChange={(e) => e.target.value && update({ from: String(toMin(e.target.value)) })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="f-to" className="text-xs text-muted-foreground">To</Label>
        <Input id="f-to" type="time" step={900} className="h-8" value={formatClock(p.to)} onChange={(e) => e.target.value && update({ to: String(toMin(e.target.value)) })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="f-seats" className="text-xs text-muted-foreground">Seats at least</Label>
        <Input
          id="f-seats"
          type="number"
          min={0}
          className="h-8"
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          onBlur={() => update({ seats: seats && Number(seats) > 0 ? seats : undefined })}
          onKeyDown={(e) => e.key === 'Enter' && update({ seats: seats && Number(seats) > 0 ? seats : undefined })}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="f-building" className="text-xs text-muted-foreground">Building</Label>
        <Select value={p.building ?? ALL} onValueChange={(v) => update({ building: v })}>
          <SelectTrigger id="f-building" className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {p.buildings.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="col-span-2 grid gap-1 md:col-span-2 xl:col-span-1">
        <legend className="text-xs text-muted-foreground">Needs</legend>
        <div className="flex flex-wrap gap-1">
          {EQUIPMENT.map((e) => {
            const on = p.needs.includes(e)
            return (
              <button
                key={e}
                type="button"
                aria-pressed={on}
                onClick={() => update({ needs: (on ? p.needs.filter((n) => n !== e) : [...p.needs, e]).join(',') || undefined })}
                className={cn('rounded-full border px-2 py-0.5 text-xs', on ? 'border-primary bg-primary text-white' : 'border-border hover:bg-accent')}
              >
                {e}
              </button>
            )
          })}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 self-end text-sm">
        <button
          type="button"
          role="switch"
          aria-checked={p.freeOnly}
          aria-label="Free rooms only"
          onClick={() => update({ free: p.freeOnly ? undefined : '1' })}
          className={cn('relative h-5 w-9 shrink-0 rounded-full border transition-colors', p.freeOnly ? 'border-primary bg-primary' : 'border-border bg-muted')}
        >
          <span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all', p.freeOnly ? 'left-[18px]' : 'left-0.5')} />
        </button>
        Free rooms only
      </label>
    </section>
  )
}
