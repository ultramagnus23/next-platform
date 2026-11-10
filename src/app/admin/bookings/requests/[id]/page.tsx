import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { RequestPageView } from '../../_components/request-page-view'
import { resolveActor } from '../../_server/actor'
import { isDemoMode } from '../../_server/offices'
import { getBookingService } from '../../_server/service'

export const dynamic = 'force-dynamic'

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const { id } = await params
  const result = await getBookingService().getRequestDetail(actor, id)
  if (!result.ok) notFound()
  return (
    <div className="grid gap-3">
      <Link href="/admin/bookings" className="text-sm underline">
        Back to the Inbox
      </Link>
      <RequestPageView detail={result.data} demo={isDemoMode()} />
    </div>
  )
}
