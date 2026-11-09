'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_OPTIONS } from '../data'
import type { CalendarFilters, CategoryId } from '../types'

const ALL = 'all'

export interface CalendarFilterOptions {
  buildings: string[]
  floors: string[]
  rooms: Array<{ id: string; label: string }>
  organisations: Array<{ id: string; name: string }>
  categories: Array<{ id: CategoryId; label: string }>
}

export function CalendarControls({ filters, options }: { filters: CalendarFilters; options: CalendarFilterOptions }) {
  const router = useRouter()
  const pathname = usePathname()

  function update(key: string, value: string) {
    const params = new URLSearchParams()
    const current: Record<string, string | undefined> = {
      view: filters.view,
      date: filters.date,
      building: filters.building,
      floor: filters.floor,
      roomId: filters.roomId,
      organisationId: filters.organisationId,
      category: filters.category,
      status: filters.status,
    }
    for (const [k, v] of Object.entries({ ...current, [key]: value })) {
      if (v && v !== ALL) params.set(k, v)
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  const dropdown = (id: string, label: string, value: string | undefined, key: string, items: Array<{ value: string; label: string }>) => (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ALL} onValueChange={(v) => update(key, v)}>
        <SelectTrigger id={id} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <section aria-label="Filters" className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-3 xl:grid-cols-6">
      {dropdown('c-building', 'Building', filters.building, 'building', options.buildings.map((b) => ({ value: b, label: b })))}
      {dropdown('c-floor', 'Floor', filters.floor, 'floor', options.floors.map((f) => ({ value: f, label: f })))}
      {dropdown('c-room', 'Room', filters.roomId, 'roomId', options.rooms.map((r) => ({ value: r.id, label: r.label })))}
      {dropdown('c-org', 'Organisation', filters.organisationId, 'organisationId', options.organisations.map((o) => ({ value: o.id, label: o.name })))}
      {dropdown('c-cat', 'Category', filters.category, 'category', options.categories.map((c) => ({ value: c.id, label: c.label })))}
      {dropdown('c-status', 'Status', filters.status, 'status', STATUS_OPTIONS.filter((s) => ['pending', 'changes_requested', 'confirmed'].includes(s.value)).map((s) => ({ value: s.value, label: s.label })))}
    </section>
  )
}
