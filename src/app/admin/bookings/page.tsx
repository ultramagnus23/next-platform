import { redirect } from 'next/navigation'
import { InboxView } from './_components/inbox-view'
import { resolveActor } from './_server/actor'
import { isDemoMode } from './_server/offices'
import { getBookingService } from './_server/service'
import { inboxFiltersSchema } from './schema'

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

export default async function InboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const raw = firstValues(await searchParams)
  const parsed = inboxFiltersSchema.safeParse(raw)
  const filters = parsed.success ? parsed.data : {}

  const service = getBookingService()
  const [data, settings] = await Promise.all([service.getInbox(actor, filters), service.getSettings()])

  // The detail pane shows the selected row, or the first one.
  const selectedId = raw.r && data.rows.some((r) => r.request.id === raw.r) ? raw.r : (data.rows[0]?.request.id ?? null)
  const detailResult = selectedId ? await service.getRequestDetail(actor, selectedId) : null
  const detail = detailResult && detailResult.ok ? detailResult.data : null

  const mine = settings.offices.find((o) => o.id === actor.actingFor)
  const nextOffice = settings.offices.find((o) => o.isFinal)?.shortLabel ?? 'the next office'

  return (
    <InboxView
      data={data}
      detail={detail}
      selectedId={selectedId}
      lane={filters.lane}
      q={filters.q ?? ''}
      demo={isDemoMode()}
      officeName={mine?.label ?? 'your office'}
      nextOffice={nextOffice}
    />
  )
}
