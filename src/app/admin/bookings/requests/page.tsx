import { redirect } from 'next/navigation'
import { BookingsPageHeader } from '../_components/page-header'
import { RequestsView } from '../_components/requests-view'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/service'
import { requestFiltersSchema } from '../schema'
import { todayIST } from '../utils'

const PAGE_SIZE = 50

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

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')

  const parsed = requestFiltersSchema.safeParse(firstValues(await searchParams))
  const filters = parsed.success ? parsed.data : requestFiltersSchema.parse({})

  const service = getBookingService()
  const page = filters.page ?? 1
  const [{ rows, counts }, rooms, organisations, settings] = await Promise.all([
    service.listRequests(actor, filters),
    service.listRooms(),
    service.listOrganisations(),
    service.getSettings(),
  ])

  return (
    <>
      <BookingsPageHeader
        title="Requests"
        subheading="Review, forward and decide room booking requests."
        crumbs={[{ label: 'Requests' }]}
      />
      <RequestsView
        rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
        total={rows.length}
        page={page}
        pageSize={PAGE_SIZE}
        today={todayIST(new Date().toISOString())}
        counts={counts}
        filters={filters}
        options={{
          organisations: organisations.map((o) => ({ id: o.id, name: o.name })),
          buildings: [...new Set(rooms.map((r) => r.building))].sort(),
          rooms: rooms.map((r) => ({ id: r.id, label: `${r.building} · ${r.name}` })),
          categories: settings.categories.map((c) => ({ id: c.id, label: c.label })),
        }}
      />
    </>
  )
}
