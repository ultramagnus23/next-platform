import { notFound, redirect } from 'next/navigation'
import { ConflictResolver } from '../../_components/conflict-resolver'
import { BookingsPageHeader } from '../../_components/page-header'
import { resolveActor } from '../../_server/actor'
import { getBookingService } from '../../_server/service'
import { formatDate, formatRange, formatVenue } from '../../utils'

export const dynamic = 'force-dynamic'

export default async function ConflictGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const { groupId } = await params
  const id = decodeURIComponent(groupId)

  const service = getBookingService()
  const result = await service.getConflictGroup(actor, id)
  if (!result.ok) notFound()
  const view = result.data
  const rooms = await service.listRooms()

  return (
    <>
      <BookingsPageHeader
        title={`Conflict in ${formatVenue(view.room)}`}
        subheading={`${formatDate(view.group.date)} · overlap ${formatRange(view.group.overlapStartMin, view.group.overlapEndMin)}`}
        crumbs={[{ label: 'Conflicts', href: '/admin/bookings/conflicts' }, { label: view.room.name }]}
      />
      <ConflictResolver view={view} groupId={id} rooms={rooms} />
    </>
  )
}
