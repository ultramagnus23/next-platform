import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { isDemoMode } from '@/app/admin/bookings/_server/offices'
import { ActivityLog } from '../../_components/activity-log'
import { FollowupPanel } from '../../_components/followup-panel'
import { OfficeDemo } from '../../_components/office-demo'
import { CancelRequest } from '../../_components/request-actions'
import { Stepper } from '../../_components/stepper'
import { StatusChip } from '../../_components/status-chip'
import { resolveStudent } from '../../_server/actor'
import { getStudentService } from '../../_server/student'
import { formatDay, formatInstant, formatTime } from '../../utils'

export const dynamic = 'force-dynamic'

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveStudent()
  if (!actor) redirect('/unauthorized')
  const { id } = await params
  const service = await getStudentService()
  const result = await service.getDetail(actor, id)
  if (!result.ok) notFound()
  const { request, status, steps, events, followup } = result.data
  const config = await service.getConfig()
  const current = steps.find((s) => s.state === 'current') ?? null
  const pending = request.status === 'pending'
  const waitingSince = request.lastApproverActivityAt && request.submittedAt ? (request.lastApproverActivityAt > request.submittedAt ? request.lastApproverActivityAt : request.submittedAt) : request.submittedAt

  return (
    <>
      <p>
        <Link href="/student">Back to your requests</Link>
      </p>

      <header className="grid gap-2">
        <h1>{request.eventName}</h1>
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} />
          {status.shown === 'taking_longer' && <span>Waiting {status.daysWaiting} days with {current?.role ?? 'the offices'}.</span>}
        </div>
        <p className="text-[0.8125rem] text-[var(--s-muted)]">Updated {formatInstant(request.updatedAt)}. Request {request.id}.</p>
      </header>

      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-[var(--s-muted)]">Club</dt>
        <dd>{request.organisationName}</dd>
        <dt className="text-[var(--s-muted)]">Space</dt>
        <dd>{request.venueLabel}</dd>
        <dt className="text-[var(--s-muted)]">When</dt>
        <dd>
          {formatDay(request.date)}, {formatTime(request.startMin)} to {formatTime(request.endMin)}
        </dd>
        <dt className="text-[var(--s-muted)]">People</dt>
        <dd>{request.attendance}</dd>
      </dl>

      {request.status === 'approved' && (
        <section aria-labelledby="outcome" className="grid gap-1 rounded-xl border border-[var(--s-ok-fg)] bg-[var(--s-ok-bg)] p-4">
          <h2 id="outcome">Approved</h2>
          <p>Every office on the path approved this request. The space is yours on {formatDay(request.date)}. You can start planning posters and tickets.</p>
        </section>
      )}

      {request.status === 'rejected' && (
        <section aria-labelledby="outcome" className="grid gap-2 rounded-xl border border-[var(--s-bad-fg)] bg-[var(--s-bad-bg)] p-4">
          <h2 id="outcome">Not approved</h2>
          <p>{request.decisionReason ?? 'No reason was recorded.'}</p>
          <div>
            <Link data-plain href={`/student/new?from=${request.id}`} className="s-btn">
              Edit and resubmit
            </Link>
          </div>
          <p className="text-[0.8125rem]">Resubmitting makes a new request linked to this one. This one stays as it is.</p>
        </section>
      )}

      {request.status === 'cancelled' && (
        <section aria-labelledby="outcome" className="grid gap-1 rounded-xl border border-[var(--s-line-strong)] bg-[var(--s-raised)] p-4">
          <h2 id="outcome">Cancelled</h2>
          <p>You cancelled this request. No office is waiting on it.</p>
        </section>
      )}

      {request.previousRequestId && (
        <p>
          This resubmits <Link href={`/student/requests/${request.previousRequestId}`}>request {request.previousRequestId}</Link>.
        </p>
      )}

      {pending && <FollowupPanel requestId={request.id} role={current?.role ?? null} followup={followup} waitDays={config.followupWaitDays} eventDate={request.date} />}

      <section aria-labelledby="path-title" className="grid gap-3 border-t border-[var(--s-line)] pt-4">
        <h2 id="path-title">Where it stands</h2>
        <Stepper steps={steps} waitingSince={waitingSince} />
      </section>

      <section aria-labelledby="log-title" className="grid gap-3 border-t border-[var(--s-line)] pt-4">
        <h2 id="log-title">Activity</h2>
        <ActivityLog events={events} />
      </section>

      {pending && (
        <section aria-label="Cancel" className="border-t border-[var(--s-line)] pt-4">
          <CancelRequest requestId={request.id} />
        </section>
      )}

      {isDemoMode() && pending && current && <OfficeDemo requestId={request.id} role={current.role} />}
    </>
  )
}
