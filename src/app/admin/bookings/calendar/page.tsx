import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CalendarControls } from '../_components/calendar-controls'
import { CalendarDayGrid } from '../_components/calendar-day-grid'
import { CalendarMonth, CalendarWeek } from '../_components/calendar-week-month'
import { BookingsPageHeader } from '../_components/page-header'
import { resolveActor } from '../_server/actor'
import { isDemoMode } from '../_server/authorities'
import { getBookingService } from '../_server/service'
import { calendarFiltersSchema } from '../schema'
import type { CalendarFilters, CalendarView } from '../types'
import { addDays, addMonths, formatDate, formatMonth, startOfWeek, todayIST } from '../utils'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValues(params: SearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first) out[key] = first
  }
  return out
}

const VIEWS: Array<{ id: CalendarView; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')

  const today = todayIST(new Date().toISOString())
  const parsed = calendarFiltersSchema.safeParse(firstValues(await searchParams))
  const raw = parsed.success ? parsed.data : calendarFiltersSchema.parse({})
  const service = getBookingService()
  const [allRooms, organisations, settings] = await Promise.all([
    service.listRooms(),
    service.listOrganisations(),
    service.getSettings(),
  ])

  const filters: CalendarFilters = { ...raw, date: raw.date ?? today }
  // The week view shows one room: fall back to the first one.
  const weekRoomId = filters.view === 'week' ? (filters.roomId ?? allRooms[0]?.id) : filters.roomId
  const data = await service.getCalendar(actor, { ...filters, roomId: weekRoomId })

  const hrefFor = (patch: Partial<CalendarFilters>): string => {
    const merged: Record<string, string | undefined> = { ...filters, ...patch }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, String(v))
    return `?${params.toString()}`
  }

  const step = filters.view === 'day' ? 1 : 7
  const prevDate = filters.view === 'month' ? addMonths(filters.date, -1) : addDays(filters.date, -step)
  const nextDate = filters.view === 'month' ? addMonths(filters.date, 1) : addDays(filters.date, step)
  const heading =
    filters.view === 'day'
      ? formatDate(filters.date)
      : filters.view === 'week'
        ? `Week of ${formatDate(startOfWeek(filters.date))}`
        : formatMonth(filters.date)

  const carry = ['building', 'floor', 'roomId', 'organisationId', 'category', 'status']
    .map((k) => {
      const v = (filters as unknown as Record<string, string | undefined>)[k]
      return v ? `&${k}=${encodeURIComponent(v)}` : ''
    })
    .join('')

  return (
    <>
      <BookingsPageHeader
        title="Calendar"
        subheading="Who has which room, and when."
        crumbs={[{ label: 'Calendar' }]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5" role="tablist" aria-label="View">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              role="tab"
              aria-selected={filters.view === v.id}
              href={hrefFor({ view: v.id })}
              className={cn(
                'rounded px-3 py-1 text-sm',
                filters.view === v.id ? 'bg-primary text-white' : 'hover:bg-accent',
              )}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href={hrefFor({ date: prevDate })} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <span className="min-w-40 text-center text-sm font-medium" aria-live="polite">
            {heading}
          </span>
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href={hrefFor({ date: nextDate })} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor({ date: today })}>Today</Link>
          </Button>
        </div>
      </div>

      <CalendarControls
        filters={{ ...filters, roomId: weekRoomId }}
        options={{
          buildings: [...new Set(allRooms.map((r) => r.building))].sort(),
          floors: [...new Set(allRooms.map((r) => r.floor))],
          rooms: allRooms.map((r) => ({ id: r.id, label: `${r.building} · ${r.name}` })),
          organisations: organisations.map((o) => ({ id: o.id, name: o.name })),
          categories: settings.categories.map((c) => ({ id: c.id, label: c.label })),
        }}
      />

      {filters.view === 'day' && (
        <CalendarDayGrid date={filters.date} rooms={data.rooms} items={data.items} demo={isDemoMode()} />
      )}
      {filters.view === 'week' && <CalendarWeek date={filters.date} room={data.rooms[0]} items={data.items} />}
      {filters.view === 'month' && (
        <CalendarMonth date={filters.date} items={data.items} conflictDates={data.conflictDates} carry={carry} />
      )}
    </>
  )
}
