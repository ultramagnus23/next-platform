import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ParamSelect } from '../_components/param-select'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/booking'
import { agendaFiltersSchema } from '../schema'
import { formatCompactRange, formatDate, statusLabel } from '../utils'

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

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const parsed = agendaFiltersSchema.safeParse(firstValues(await searchParams))
  const filters = parsed.success ? parsed.data : {}
  const service = (await getBookingService())
  const [rows, rooms, settings] = await Promise.all([service.getAgenda(actor, filters), service.listRooms(), service.getSettings()])
  const buildings = [...new Set(rooms.map((r) => r.building))]
  const today = service.today()

  const byDay = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byDay.get(r.request.date)
    if (list) list.push(r)
    else byDay.set(r.request.date, [r])
  }

  return (
    <div className="grid gap-4">
      <header>
        <h1>Calendar</h1>
        <p className="text-sm text-muted-foreground">Events for the next two weeks, day by day. Use Rooms to see which rooms are free.</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <form method="get" className="grid gap-1">
          <label htmlFor="agenda-q" className="text-xs text-muted-foreground">
            Search
          </label>
          <input
            id="agenda-q"
            name="q"
            type="search"
            autoComplete="off"
            defaultValue={filters.q ?? ''}
            placeholder="Event, club or room…"
            className="h-8 w-56 rounded-md border border-border bg-background px-2 text-sm"
          />
        </form>
        <ParamSelect param="building" label="Building" value={filters.building} allLabel="All buildings" options={buildings.map((b) => ({ value: b, label: b }))} />
        <ParamSelect param="category" label="Event type" value={filters.category} allLabel="All types" options={settings.categories.map((c) => ({ value: c.id, label: c.label }))} />
        <ParamSelect
          param="status"
          label="Status"
          value={filters.status}
          allLabel="All"
          options={[
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'pending', label: 'Waiting for approval' },
            { value: 'offered', label: 'Offered' },
            { value: 'changes_requested', label: 'Changes needed' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">No events match.</p>
        </div>
      ) : (
        [...byDay.entries()].map(([date, list]) => (
          <section key={date} aria-label={formatDate(date)} className="grid gap-1">
            <h2>
              {date === today ? 'Today, ' : ''}
              {formatDate(date)} <span className="font-normal text-muted-foreground">{list.length}</span>
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {list.map((r) => (
                <li key={r.request.id}>
                  <Link href={`/admin/bookings/requests/${r.request.id}`} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 hover:bg-accent/50">
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
                    <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs">{r.request.status === 'pending' ? 'Waiting' : statusLabel(r.request.status)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
