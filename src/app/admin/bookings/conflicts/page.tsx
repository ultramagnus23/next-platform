import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { ConflictBadge, FlagBadge } from '../_components/badges'
import { BookingsPageHeader } from '../_components/page-header'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/service'
import { formatDate, formatRange, formatVenue } from '../utils'

export const dynamic = 'force-dynamic'

export default async function ConflictsPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const groups = await getBookingService().listConflictGroups(actor)

  return (
    <>
      <BookingsPageHeader
        title="Conflicts"
        subheading="Requests that overlap in the same room. Academic Booking decides between offices."
        crumbs={[{ label: 'Conflicts' }]}
      />
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">No open conflicts.</p>
          <p className="mt-1 text-sm text-muted-foreground">Overlapping requests show up here as soon as they appear.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((view) => {
            const { group } = view
            const suggested = view.members.find((m) => m.request.id === view.suggestedWinnerId)
            return (
              <li key={group.id}>
                <Link href={`/admin/bookings/conflicts/${encodeURIComponent(group.id)}`} className="block h-full">
                  <Card className="h-full transition-colors hover:bg-accent/40">
                    <CardContent className="grid gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{formatVenue(view.room)}</p>
                        <ConflictBadge count={group.members.length} />
                      </div>
                      <p className="text-sm">
                        {formatDate(group.date)} · overlap {formatRange(group.overlapStartMin, group.overlapEndMin)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {group.members.map((m) => m.eventName).join(' vs ')}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {group.hasConfirmed && <FlagBadge tone="warn">Involves a confirmed booking</FlagBadge>}
                        {suggested && (
                          <FlagBadge tone="info">Suggested: {suggested.request.eventName}</FlagBadge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
