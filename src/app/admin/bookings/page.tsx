import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FlagBadge, OrgChip } from './_components/badges'
import { GlobalSearch } from './_components/global-search'
import { BookingsPageHeader } from './_components/page-header'
import { QueueView } from './_components/queue-view'
import { RoleBanner } from './_components/role-banner'
import { resolveActor } from './_server/actor'
import { getBookingService } from './_server/service'
import { addDays, formatDate, formatMinutes, formatVenue, relativeTime } from './utils'

export const dynamic = 'force-dynamic'

export default async function BookingsHomePage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const service = getBookingService()
  const [queue, overview, settings] = await Promise.all([
    service.getWorkQueue(actor),
    service.getOverview(actor),
    service.getSettings(),
  ])
  const now = new Date().toISOString()

  const stats = [
    { label: 'Waiting on you', value: queue.total, href: '/admin/bookings/requests?tab=needs_action' },
    { label: 'Open conflicts', value: overview.openConflicts, href: '/admin/bookings/conflicts' },
    {
      label: 'Confirmed, next 7 days',
      value: overview.confirmedNext7Days,
      href: `/admin/bookings/requests?tab=confirmed&dateFrom=${overview.today}&dateTo=${addDays(overview.today, 7)}`,
    },
    { label: 'Rooms booked today', value: `${overview.utilisationPercent}%`, href: '/admin/bookings/rooms' },
  ]

  return (
    <>
      <BookingsPageHeader title="Today’s work" subheading={`${formatDate(overview.today)}. Start with what needs you, grouped by organisation.`} />
      <GlobalSearch />
      <RoleBanner actor={actor} authorities={settings.authorities} />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="block">
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="p-3">
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Waiting on you" className="grid min-w-0 grid-cols-1 gap-2">
          <h2 className="text-lg font-semibold">Waiting on you</h2>
          <QueueView groups={queue.groups} />
        </section>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open conflicts</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.conflictGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open conflicts.</p>
              ) : (
                <ul className="grid gap-2">
                  {overview.conflictGroups.map((view) => (
                    <li key={view.group.id}>
                      <Link
                        href={`/admin/bookings/conflicts/${encodeURIComponent(view.group.id)}`}
                        className="block rounded-md border border-red-200 p-2.5 hover:bg-accent/40 dark:border-red-900"
                      >
                        <p className="text-sm font-medium">
                          {formatVenue(view.room)} · {formatDate(view.group.date)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {view.members.map((m) => (
                            <OrgChip key={m.request.id} code={m.organisation.code} colour={m.organisation.colour} />
                          ))}
                          {view.group.hasConfirmed && <FlagBadge tone="warn">Confirmed booking involved</FlagBadge>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {overview.openConflicts > overview.conflictGroups.length && (
                <Link href="/admin/bookings/conflicts" className="mt-2 inline-block text-sm underline">
                  All {overview.openConflicts} conflicts
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rooms in use now</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {overview.inUseNow.length === 0 ? (
                <p className="text-muted-foreground">No room is in use at the moment.</p>
              ) : (
                overview.inUseNow.slice(0, 5).map((u) => (
                  <p key={u.requestId}>
                    {u.roomLabel}: {u.eventName} until {formatMinutes(u.endMin)}
                  </p>
                ))
              )}
              <Link href="/admin/bookings/rooms" className="mt-1 text-sm underline">
                Open the rooms board
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {overview.activity.map((item) => (
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
        </aside>
      </div>
    </>
  )
}
