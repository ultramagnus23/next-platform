import { notFound, redirect } from 'next/navigation'
import { ActionPanel } from '../../_components/action-panel'
import {
  AlternativeRooms,
  ApprovalStepper,
  ConflictPanel,
  EventCard,
  HistoryList,
  RequestHeader,
} from '../../_components/detail-sections'
import { BookingsPageHeader } from '../../_components/page-header'
import { RoomTimeline } from '../../_components/room-timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isDemoMode } from '../../_server/authorities'
import { resolveActor } from '../../_server/actor'
import { getBookingService } from '../../_server/service'
import { formatDate, formatVenue } from '../../utils'

export const dynamic = 'force-dynamic'

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const { id } = await params

  const result = await getBookingService().getDetail(actor, id)
  if (!result.ok) notFound()
  const detail = result.data
  const { request, lookups } = detail

  const tier = lookups.categories.find((c) => c.id === request.category)?.tier ?? 99
  const authorityName =
    lookups.authorities.find((a) => a.id === detail.organisation.authorityId)?.shortLabel ??
    detail.organisation.authorityId.toUpperCase()
  const blocking = detail.conflicts.filter((c) => c.kind === 'confirmed_booking').map((c) => c.request)
  const myRank = detail.ranks.find((r) => r.requestId === request.id)
  const now = new Date().toISOString()

  return (
    <>
      <BookingsPageHeader
        title={request.eventName}
        subheading={`${detail.organisation.name} · ${formatDate(request.date)} · ${formatVenue(detail.room)}`}
        crumbs={[{ label: 'Requests', href: '/admin/bookings/requests' }, { label: request.id }]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <RequestHeader detail={detail} tier={tier} />
          <EventCard detail={detail} authorityLabel={authorityName} />
          <ApprovalStepper request={request} authorities={lookups.authorities} logs={detail.logs} />
          <ConflictPanel
            conflicts={detail.conflicts}
            ranks={detail.ranks}
            groupId={detail.groupId}
            organisations={lookups.organisations}
            categories={lookups.categories}
            authorities={lookups.authorities}
            selfId={request.id}
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {formatVenue(detail.room)} on {formatDate(request.date)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RoomTimeline blocks={detail.schedule} highlightId={request.id} />
            </CardContent>
          </Card>
          <AlternativeRooms rooms={detail.alternatives} />
          <HistoryList logs={detail.logs} authorities={lookups.authorities} now={now} />
        </div>
        <aside aria-label="Actions" className="min-w-0">
          {detail.visibility === 'full' ? (
            <ActionPanel
              request={request}
              organisation={detail.organisation}
              room={detail.room}
              authorities={lookups.authorities}
              actions={detail.actions}
              alternatives={detail.alternatives}
              allRooms={lookups.rooms}
              blocking={blocking}
              organisations={lookups.organisations}
              inConflict={detail.conflicts.length > 0}
              demo={isDemoMode()}
              suggestedReasons={myRank && myRank.rank > 1 ? myRank.reasons.slice(0, 1) : []}
            />
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                This request competes with one of yours. You can read it here. Academic Booking decides between requests
                from different offices.
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}
