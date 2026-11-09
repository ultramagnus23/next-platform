import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryBadge, ConflictBadge, FlagBadge } from './_components/badges'
import { BookingsPageHeader } from './_components/page-header'
import { resolveActor } from './_server/actor'
import { getBookingService } from './_server/service'
import { addDays, formatDate, formatMinutes, formatRange, formatVenue, relativeTime } from './utils'

export const dynamic = 'force-dynamic'

export default async function BookingsOverviewPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const data = await getBookingService().getOverview(actor)
  const now = new Date().toISOString()

  const tiles = [
    { label: 'Needs your action', value: data.needsAction, href: '/admin/bookings/requests?tab=needs_action' },
    { label: 'Open conflicts', value: data.openConflicts, href: '/admin/bookings/conflicts' },
    {
      label: 'Confirmed in next 7 days',
      value: data.confirmedNext7Days,
      href: `/admin/bookings/requests?tab=confirmed&dateFrom=${data.today}&dateTo=${addDays(data.today, 7)}`,
    },
    {
      label: 'Rejected in last 30 days',
      value: data.rejectedLast30Days,
      href: '/admin/bookings/requests?tab=closed&status=rejected',
    },
  ]

  return (
    <>
      <BookingsPageHeader
        title="Room bookings"
        subheading="What needs a decision, what clashes, and what is happening on campus today."
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="block">
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="p-4">
                <p className="text-3xl font-bold tabular-nums">{tile.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tile.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Needs your action</CardTitle>
          </CardHeader>
          <CardContent>
            {data.needsActionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
            ) : (
              <ul className="grid gap-2">
                {data.needsActionRows.map((row) => (
                  <li key={row.request.id}>
                    <Link
                      href={`/admin/bookings/requests/${row.request.id}`}
                      className="block rounded-md border border-border p-2.5 hover:bg-accent/40"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.request.eventName}</span>
                        <CategoryBadge label={row.categoryLabel} />
                        <ConflictBadge count={row.conflictCount} />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {row.roomLabel} · {formatDate(row.request.date)}, {formatRange(row.request.startMin, row.request.endMin)}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.stageLabel}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open conflicts</CardTitle>
          </CardHeader>
          <CardContent>
            {data.conflictGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open conflicts.</p>
            ) : (
              <ul className="grid gap-2">
                {data.conflictGroups.map((view) => {
                  const suggested = view.members.find((m) => m.request.id === view.suggestedWinnerId)
                  return (
                    <li key={view.group.id}>
                      <Link
                        href={`/admin/bookings/conflicts/${encodeURIComponent(view.group.id)}`}
                        className="block rounded-md border border-red-200 p-2.5 hover:bg-accent/40 dark:border-red-900"
                      >
                        <p className="font-medium">
                          {formatVenue(view.room)} · {formatDate(view.group.date)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {view.members.map((m) => m.request.eventName).join(' vs ')}
                        </p>
                        {suggested && (
                          <div className="mt-1">
                            <FlagBadge tone="info">Suggested: {suggested.request.eventName}</FlagBadge>
                          </div>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today across campus</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              <span className="text-2xl font-bold tabular-nums">{data.utilisationPercent}%</span>{' '}
              <span className="text-muted-foreground">of room hours booked today</span>
            </p>
            <div>
              <p className="font-medium">In use now</p>
              {data.inUseNow.length === 0 ? (
                <p className="text-muted-foreground">No room is in use at the moment.</p>
              ) : (
                <ul className="mt-1 grid gap-1">
                  {data.inUseNow.map((u) => (
                    <li key={u.requestId}>
                      {u.roomLabel}: {u.eventName} until {formatMinutes(u.endMin)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-medium">Next up</p>
              {data.nextUp.length === 0 ? (
                <p className="text-muted-foreground">Nothing else is booked today.</p>
              ) : (
                <ul className="mt-1 grid gap-1">
                  {data.nextUp.map((u) => (
                    <li key={u.requestId}>
                      {formatMinutes(u.startMin)} · {u.roomLabel}: {u.eventName}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {data.activity.map((item) => (
                  <li key={item.id}>
                    <Link href={`/admin/bookings/requests/${item.requestId}`} className="hover:underline">
                      {item.text}
                    </Link>{' '}
                    <span className="text-muted-foreground">· {relativeTime(item.at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
