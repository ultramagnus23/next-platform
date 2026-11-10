import { redirect } from 'next/navigation'
import { RoomsFindBar } from '../_components/rooms-find-bar'
import { RoomsGrid } from '../_components/rooms-grid'
import { resolveActor } from '../_server/actor'
import { isDemoMode } from '../_server/offices'
import { getBookingService } from '../_server/service'
import { formatCompactRange, formatDate } from '../utils'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  const x = Array.isArray(v) ? v[0] : v
  return x ? x : undefined
}

function toInt(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return v !== undefined && Number.isFinite(n) ? Math.round(n) : fallback
}

export default async function RoomsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const sp = await searchParams
  const service = getBookingService()

  const date = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.date) ?? '') ? (first(sp.date) as string) : service.today()
  const from = toInt(first(sp.from), 18 * 60)
  const to = toInt(first(sp.to), 20 * 60)
  const seats = toInt(first(sp.seats), 0)
  const building = first(sp.building)
  const needs = (first(sp.needs) ?? '').split(',').filter(Boolean)
  const freeOnly = first(sp.free) === '1'

  const [data, rooms, organisations] = await Promise.all([
    service.getRoomsDay({ date, from, to, minSeats: seats || undefined, needs: needs.length ? needs : undefined, building, freeOnly: false }),
    service.listRooms(),
    service.listOrganisations(),
  ])
  const buildings = [...new Set(rooms.map((r) => r.building))].sort()
  const shown = freeOnly ? data.rows.filter((r) => r.freeInWindow) : data.rows
  const groups = buildings
    .map((b) => {
      const rows = shown.filter((r) => r.room.building === b)
      return { building: b, rows, free: rows.filter((r) => r.freeInWindow).length }
    })
    .filter((g) => g.rows.length > 0)

  const windowLabel = to > from ? `${formatCompactRange(from, to)}` : ''
  const nowMin = date === service.today() ? new Date(Date.parse(service.now()) + 330 * 60_000).getUTCHours() * 60 + new Date(Date.parse(service.now()) + 330 * 60_000).getUTCMinutes() : null

  return (
    <div className="grid gap-4">
      <header>
        <h1>Rooms</h1>
        <p className="text-sm text-muted-foreground">
          {data.freeCount} of {data.rows.length} rooms are free {windowLabel ? `from ${windowLabel} ` : ''}on {formatDate(date)}
          {seats ? ` and seat ${seats} or more` : ''}. {data.clashCount} {data.clashCount === 1 ? 'clash' : 'clashes'}.
        </p>
      </header>
      <RoomsFindBar date={date} from={from} to={to} seats={seats} building={building} needs={needs} freeOnly={freeOnly} buildings={buildings} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-border bg-muted" aria-hidden="true" /> Class (timetable)</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-primary bg-primary" aria-hidden="true" /> Confirmed event</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-primary" aria-hidden="true" /> Waiting for approval</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-dotted border-primary" aria-hidden="true" /> Offered (held)</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-red-600 bg-red-50" aria-hidden="true" /> Clash</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-500/25" aria-hidden="true" /> Your search window</li>
      </ul>
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm">No room matches. Try fewer seats or fewer needs.</p>
      ) : (
        <RoomsGrid
          date={date}
          groups={groups}
          openBuilding={building ?? groups[0]?.building ?? null}
          windowFrom={to > from ? from : null}
          windowTo={to > from ? to : null}
          nowMin={nowMin}
          canBook={actor.canOverride}
          demo={isDemoMode()}
          windowLabel={windowLabel}
          directOptions={{
            organisations: organisations.filter((o) => o.kind !== 'club' && o.kind !== 'society').map((o) => ({ id: o.id, name: o.name })),
            rooms: rooms.map((r) => ({ id: r.id, label: `${r.building}, ${r.floor} floor, ${r.name}`, capacity: r.capacity })),
            categories: [
              { id: 'seminar', label: 'Seminar' },
              { id: 'meeting', label: 'Meeting' },
              { id: 'academic', label: 'Academic' },
              { id: 'other', label: 'Other' },
            ],
            today: date,
          }}
        />
      )}
    </div>
  )
}
