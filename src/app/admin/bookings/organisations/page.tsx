import { redirect } from 'next/navigation'
import { BookingsPageHeader } from '../_components/page-header'
import { OrganisationsTable } from '../_components/organisations-table'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/service'

export const dynamic = 'force-dynamic'

export default async function BookingOrganisationsPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const service = getBookingService()
  const [stats, rooms, settings] = await Promise.all([
    service.getOrganisationStats(actor),
    service.listRooms(),
    service.getSettings(),
  ])

  const rows = stats.map((s) => {
    const room = rooms.find((r) => r.id === s.mostUsedRoomId)
    return {
      ...s,
      authorityLabel: settings.authorities.find((a) => a.id === s.organisation.authorityId)?.shortLabel ?? s.organisation.authorityId,
      mostUsedRoomLabel: room ? `${room.building} · ${room.name}` : 'None',
    }
  })

  return (
    <>
      <BookingsPageHeader
        title="Organisations"
        subheading="How each organisation uses room bookings. Press a name to see its requests."
        crumbs={[{ label: 'Organisations' }]}
      />
      <OrganisationsTable rows={rows} />
    </>
  )
}
