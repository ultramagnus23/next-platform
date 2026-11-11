import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/booking'
import { formatCompactRange, formatDate, formatVenue } from '../utils'

export const dynamic = 'force-dynamic'

export default async function ClashesPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const clashes = await (await getBookingService()).listClashes(actor)

  return (
    <div className="grid gap-4">
      <header>
        <h1>Clashes</h1>
        <p className="text-sm text-muted-foreground">
          {clashes.length === 0 ? 'No open clashes.' : `${clashes.length} open ${clashes.length === 1 ? 'clash' : 'clashes'}. Academic Booking decides between requests from different offices.`}
        </p>
      </header>
      {clashes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">Nothing clashes right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {clashes.map((v) => {
            const suggested = v.members.find((m) => m.request.id === v.suggestedWinnerId)
            return (
              <li key={v.group.id}>
                <Link href={`/admin/bookings/clashes/${encodeURIComponent(v.group.id)}`} className="grid grid-cols-1 gap-1 px-3 py-2.5 hover:bg-accent/50 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-4">
                  <span>
                    <span className="block text-sm font-semibold">{formatVenue(v.room)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(v.group.date)}, {formatCompactRange(v.group.startMin, v.group.endMin)}
                    </span>
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block truncate">{v.members.map((m) => m.request.eventName).join(' vs ')}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {suggested ? `Suggested: ${suggested.request.eventName}` : 'No suggestion'}
                      {v.blockers.length > 0 ? ` · ${v.blockers.some((b) => b.kind === 'class') ? 'A class is booked here' : 'Already booked or held'}` : ''}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {v.members.length} requests · open {v.openHours >= 48 ? `${Math.round(v.openHours / 24)} days` : `${v.openHours} hours`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
