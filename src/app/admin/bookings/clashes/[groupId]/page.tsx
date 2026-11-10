import { notFound, redirect } from 'next/navigation'
import { ClashResolver } from '../../_components/clash-resolver'
import { resolveActor } from '../../_server/actor'
import { getBookingService } from '../../_server/service'

export const dynamic = 'force-dynamic'

export default async function ClashPage({ params }: { params: Promise<{ groupId: string }> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const { groupId } = await params
  const id = decodeURIComponent(groupId)
  const result = await getBookingService().getClash(actor, id)
  if (!result.ok) notFound()
  return <ClashResolver view={result.data} groupId={id} />
}
