import Link from 'next/link'
import { redirect } from 'next/navigation'
import { StatusChip } from './_components/status-chip'
import { resolveStudent } from './_server/actor'
import { getStudentService } from './_server/student'
import { groupRequests } from './logic/groups'
import { formatDay, formatInstant, formatTime } from './utils'

export const dynamic = 'force-dynamic'

export default async function YourRequestsPage() {
  const actor = await resolveStudent()
  if (!actor) redirect('/unauthorized')
  const service = await getStudentService()
  const rows = await service.listMine(actor)
  const groups = groupRequests(rows, service.today())

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Your requests</h1>
          <p className="text-[var(--s-muted)]">{actor.organisationName}. Updated {formatInstant(service.now().toISOString())}.</p>
        </div>
        <Link data-plain href="/student/new" className="s-btn">
          New request
        </Link>
      </header>

      {rows.length === 0 ? (
        <section aria-labelledby="empty" className="grid gap-2 border-t border-[var(--s-line)] pt-6">
          <h2 id="empty">You have not asked for a space yet</h2>
          <p>Tell us the event, the space and the time. We show you every office the request goes through before you send it, and you can follow each approval here.</p>
          <div>
            <Link data-plain href="/student/new" className="s-btn">
              Start a request
            </Link>
          </div>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`} className="grid gap-1">
            <h2 id={`group-${group.id}`}>
              {group.title} <span className="font-normal text-[var(--s-muted)]">{group.rows.length}</span>
            </h2>
            <ul className="divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
              {group.rows.map(({ request, status, currentRole }) => (
                <li key={request.id}>
                  <Link data-plain href={`/student/requests/${request.id}`} className="grid min-h-14 gap-1 py-3 text-[var(--s-ink)] no-underline hover:bg-[var(--s-raised)] sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                    <span className="min-w-0">
                      <span className="block font-semibold">{request.eventName}</span>
                      <span className="block text-[0.8125rem] text-[var(--s-muted)]">
                        {request.venueLabel} · {formatDay(request.date)}, {formatTime(request.startMin)}
                        {currentRole && status.stored === 'pending' ? ` · With ${currentRole}` : ''}
                      </span>
                    </span>
                    <span>
                      <StatusChip status={status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
