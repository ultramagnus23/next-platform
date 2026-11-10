import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryBadge, ConflictBadge, OrgChip, StatusBadge } from '../../_components/badges'
import { BookingsPageHeader } from '../../_components/page-header'
import { resolveActor } from '../../_server/actor'
import { getBookingService } from '../../_server/service'
import type { RequestRow } from '../../types'
import { formatDate, formatRange, todayIST } from '../../utils'

export const dynamic = 'force-dynamic'

function Section({ title, rows, empty }: { title: string; rows: RequestRow[]; empty: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link href={`/admin/bookings/requests/${row.request.id}`} className="font-medium hover:underline">
                    {row.request.eventName}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {row.roomLabel} · {formatDate(row.request.date)}, {formatRange(row.request.startMin, row.request.endMin)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <CategoryBadge label={row.categoryLabel} />
                  <ConflictBadge count={row.conflictCount} />
                  <StatusBadge status={row.request.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default async function OrganisationProfilePage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const { code } = await params

  const service = getBookingService()
  const [organisations, settings] = await Promise.all([service.listOrganisations(), service.getSettings()])
  const organisation = organisations.find((o) => o.code.toLowerCase() === code.toLowerCase())
  if (!organisation) notFound()

  const [{ rows }, stats] = await Promise.all([
    service.listRequests(actor, { tab: 'all', organisationId: organisation.id }),
    service.getOrganisationStats(actor),
  ])
  const mine = stats.find((s) => s.organisation.id === organisation.id)
  const today = todayIST(new Date().toISOString())

  const needsAction = rows.filter((r) => r.needsMyAction)
  const upcoming = rows.filter(
    (r) => !r.needsMyAction && ['pending', 'changes_requested', 'confirmed'].includes(r.request.status) && r.request.date >= today,
  )
  const history = rows
    .filter((r) => !needsAction.includes(r) && !upcoming.includes(r))
    .sort((a, b) => b.request.date.localeCompare(a.request.date))
  const authority = settings.authorities.find((a) => a.id === organisation.authorityId)

  const figures: Array<[string, number]> = [
    ['Requests', mine?.requests ?? 0],
    ['Confirmed', mine?.confirmed ?? 0],
    ['Rejected', mine?.rejected ?? 0],
    ['Cancelled', mine?.cancellations ?? 0],
    ['Displaced', mine?.displaced ?? 0],
    ['Auto-approved', mine?.autoApproved ?? 0],
  ]

  return (
    <>
      <BookingsPageHeader
        title={organisation.name}
        subheading={`Governed by ${authority?.label ?? organisation.authorityId.toUpperCase()} · ${organisation.contactEmail}`}
        crumbs={[{ label: 'Organisations', href: '/admin/bookings/organisations' }, { label: organisation.code }]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <OrgChip code={organisation.code} colour={organisation.colour} />
        <p className="text-sm text-muted-foreground">
          Every booking from {organisation.name} carries the code {organisation.code}.
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {figures.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-3">
            <dd className="text-2xl font-bold tabular-nums">{value}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-4">
        <Section title="Waiting on you" rows={needsAction} empty="Nothing from this organisation is waiting on you." />
        <Section title="Upcoming" rows={upcoming} empty="No upcoming bookings." />
        <Section title="History" rows={history} empty="No past or closed bookings." />
      </div>
    </>
  )
}
