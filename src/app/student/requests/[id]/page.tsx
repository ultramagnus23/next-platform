import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { isDemoMode } from '@/app/admin/bookings/_server/offices'
import { Panel, Tray } from '../../_components/panel'
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
    <div className="grid gap-4">
      <p>
        <Link href="/student" className="inline-flex items-center gap-1 text-sm underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to your requests
        </Link>
      </p>

      <header className="grid gap-2">
        <h1>{request.eventName}</h1>
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} />
          {status.shown === 'taking_longer' && <span className="text-sm">Waiting {status.daysWaiting} days with {current?.role ?? 'the offices'}.</span>}
        </div>
        <p className="text-xs text-muted-foreground">Updated {formatInstant(request.updatedAt)}. Request {request.id}.</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] xl:items-start">
        <div className="grid min-w-0 gap-4">
          <Panel id="details" title="Details" description="What you asked for." footer={<span>Request {request.id}</span>}>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Club</dt>
            <dd>{request.organisationName}</dd>
            <dt className="text-muted-foreground">Space</dt>
            <dd>{request.venueLabel}</dd>
            <dt className="text-muted-foreground">When</dt>
            <dd>
              {formatDay(request.date)}, {formatTime(request.startMin)} to {formatTime(request.endMin)}
            </dd>
            <dt className="text-muted-foreground">People</dt>
            <dd>{request.attendance}</dd>
          </dl>
          </Panel>

          {request.status === 'approved' && (
            <section aria-labelledby="outcome" className="grid gap-1 rounded-2xl border border-emerald-300 bg-[#e4f2e9] p-4 text-[#1d6b3f]">
              <h2 id="outcome">Approved</h2>
              <p>Every office on the path approved this request. The space is yours on {formatDay(request.date)}. You can start planning posters and tickets.</p>
            </section>
          )}

          {request.status === 'rejected' && (
            <section aria-labelledby="outcome" className="grid gap-2 rounded-2xl border border-red-300 bg-[#fdecea] p-4 text-[#b3261e]">
              <h2 id="outcome">Not approved</h2>
              <p>{request.decisionReason ?? 'No reason was recorded.'}</p>
              <div>
                <Link href={`/student/new?from=${request.id}`} className={buttonVariants()}>
                  Edit and resubmit
                </Link>
              </div>
              <p className="text-xs">Resubmitting makes a new request linked to this one. This one stays as it is.</p>
            </section>
          )}

          {request.status === 'cancelled' && (
            <section aria-labelledby="outcome" className="grid gap-1 rounded-2xl border border-border bg-muted p-4">
              <h2 id="outcome">Cancelled</h2>
              <p>This request was cancelled. No office is waiting on it.</p>
            </section>
          )}

          {request.previousRequestId && (
            <p className="text-sm">
              This resubmits <Link href={`/student/requests/${request.previousRequestId}`} className="underline">request {request.previousRequestId}</Link>.
            </p>
          )}

          {pending && <FollowupPanel requestId={request.id} role={current?.role ?? null} followup={followup} waitDays={config.followupWaitDays} urgencyDays={config.urgencyDays} eventDate={request.date} />}

          <Panel id="log-title" title="Activity" description="Everything that happened, newest last." footer={<span>Updated {formatInstant(request.updatedAt)}</span>}>
            <Tray className="p-3">
              <ActivityLog events={events} />
            </Tray>
          </Panel>
        </div>

        <div className="grid gap-4 xl:sticky xl:top-4">
          <Panel id="path-title" title="Where it stands" description="Every office this request goes through.">
            <Stepper steps={steps} waitingSince={waitingSince} />
          </Panel>
          {pending && (
            <Panel id="cancel-title" title="Change of plan">
              <CancelRequest requestId={request.id} />
            </Panel>
          )}
          {isDemoMode() && pending && current && <OfficeDemo requestId={request.id} role={current.role} />}
        </div>
      </div>
    </div>
  )
}
