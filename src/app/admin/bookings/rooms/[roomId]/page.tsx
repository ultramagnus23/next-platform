import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookingsPageHeader } from '../../_components/page-header'
import { RoomTimeline } from '../../_components/room-timeline'
import { resolveActor } from '../../_server/actor'
import { getBookingService } from '../../_server/service'
import { addDays, formatDate, formatMinutes, formatVenue, todayIST } from '../../utils'

export const dynamic = 'force-dynamic'

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const { roomId } = await params

  const service = getBookingService()
  const [rooms, organisations] = await Promise.all([service.listRooms(), service.listOrganisations()])
  const room = rooms.find((r) => r.id === roomId)
  if (!room) notFound()

  const today = todayIST(new Date().toISOString())
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const schedules = await Promise.all(days.map((d) => service.daySchedule(room.id, d)))
  const codes = Object.fromEntries(organisations.map((o) => [o.id, o.code]))

  return (
    <>
      <BookingsPageHeader
        title={formatVenue(room)}
        subheading={`${room.capacity} seats · open ${formatMinutes(room.openFromMin)} to ${formatMinutes(room.openUntilMin)}${room.features.length ? ` · ${room.features.join(', ')}` : ''}`}
        crumbs={[{ label: 'Rooms', href: '/admin/bookings/rooms' }, { label: room.name }]}
      />
      <p className="text-sm">
        <Link href={`/admin/bookings/calendar?view=week&roomId=${room.id}`} className="underline">
          Open the week calendar for this room
        </Link>
      </p>
      <div className="grid grid-cols-1 gap-3">
        {days.map((date, i) => (
          <Card key={date}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {i === 0 ? 'Today' : formatDate(date)}
                {i === 0 ? `, ${formatDate(date)}` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RoomTimeline blocks={schedules[i] ?? []} codes={codes} />
              {(schedules[i]?.length ?? 0) === 0 && <p className="mt-2 text-sm text-muted-foreground">Free all day.</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
