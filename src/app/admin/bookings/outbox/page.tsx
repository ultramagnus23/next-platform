import { redirect } from 'next/navigation'
import { BookingsPageHeader } from '../_components/page-header'
import { OutboxView } from '../_components/outbox-view'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/service'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return v ? v : undefined
}

export default async function OutboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const params = await searchParams
  const trigger = first(params.trigger)
  const requestId = first(params.requestId)
  const emails = await getBookingService().getOutbox(actor, { trigger, requestId })

  return (
    <>
      <BookingsPageHeader
        title="Outbox"
        subheading="Every email the system would send. Nothing leaves the platform in the demo."
        crumbs={[{ label: 'Outbox' }]}
      />
      <OutboxView emails={emails} trigger={trigger} requestId={requestId} />
    </>
  )
}
