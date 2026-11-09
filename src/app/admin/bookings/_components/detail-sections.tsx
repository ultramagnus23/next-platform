import Link from 'next/link'
import { AlertTriangle, Check, Circle, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
  ApprovalLog,
  Authority,
  BookingRequest,
  ConflictItem,
  EventCategory,
  Organisation,
  PriorityRank,
  RequestDetail,
  Room,
} from '../types'
import { formatDate, formatRange, formatTimestamp, formatVenue, relativeTime, statusLabel } from '../utils'
import { CategoryBadge, ConflictBadge, FlagBadge, StatusBadge, TierChip } from './badges'

/* ---------------- Header ---------------- */

export function RequestHeader({ detail, tier }: { detail: RequestDetail; tier: number }) {
  const { request } = detail
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{request.eventName}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-muted-foreground">{request.id}</span>
        <StatusBadge status={request.status} />
        <CategoryBadge label={detail.categoryLabel} />
        <TierChip tier={tier} />
        {request.escalated && <FlagBadge tone="warn">Escalated</FlagBadge>}
        {request.autoApprovedBy && <FlagBadge tone="info">Auto-approved</FlagBadge>}
        {request.status === 'confirmed' && request.amsSyncedAt && (
          <FlagBadge tone="info">
            AMS: synced (simulated) · {formatTimestamp(request.amsSyncedAt)}
          </FlagBadge>
        )}
      </div>
    </div>
  )
}

/* ---------------- Event card ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function EventCard({ detail, authorityLabel }: { detail: RequestDetail; authorityLabel: string }) {
  const { request, organisation, room } = detail
  const over = request.expectedAttendance > room.capacity
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Event</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Organisation">
            {organisation.name} <span className="text-muted-foreground">({authorityLabel})</span>
          </Field>
          <Field label="Submitted by">{request.submittedBy}</Field>
          <Field label="Date and time">
            {formatDate(request.date)}, {formatRange(request.startMin, request.endMin)}
          </Field>
          <Field label="Room">{formatVenue(room)}</Field>
          <Field label="Attendance">
            <span className={cn(over && 'font-semibold text-red-700 dark:text-red-300')}>
              {request.expectedAttendance} expected, room holds {room.capacity}
            </span>
            {over && <span className="ml-2 text-xs text-red-700 dark:text-red-300">Over capacity</span>}
          </Field>
          <Field label="Submitted">{formatTimestamp(request.createdAt)}</Field>
        </dl>
        {request.description && (
          <div className="grid gap-0.5">
            <p className="text-xs text-muted-foreground">Description</p>
            <p className="text-sm">{request.description}</p>
          </div>
        )}
        {detail.warnings.length > 0 && (
          <ul className="grid gap-1.5" aria-label="Warnings">
            {detail.warnings.map((w) => (
              <li
                key={w.code}
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {w.message}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- Approval progress ---------------- */

export function ApprovalStepper({
  request,
  authorities,
  logs,
}: {
  request: BookingRequest
  authorities: Authority[]
  logs: ApprovalLog[]
}) {
  const labelOf = (id: string) => authorities.find((a) => a.id === id)?.shortLabel ?? id.toUpperCase()
  const closed = request.status === 'rejected' || request.status === 'withdrawn' || request.status === 'cancelled'
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Approval progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0">
          {request.stages.map((stage, index) => {
            const label = labelOf(stage)
            const done = request.status === 'confirmed' || request.status === 'displaced' || index < request.stageIndex
            const current = !done && index === request.stageIndex && !closed
            const doneLog = logs.find(
              (l) =>
                l.stageLabel === label &&
                (l.action === 'forwarded' || l.action === 'confirmed' || l.action === 'override_confirmed'),
            )
            return (
              <li key={`${stage}-${index}`} className="flex flex-1 items-start gap-3 sm:flex-col sm:gap-2">
                <div className="flex items-center sm:w-full">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs',
                      done && 'border-emerald-600 bg-emerald-600 text-white',
                      current && 'border-primary bg-primary/10 text-primary',
                      !done && !current && 'border-border text-muted-foreground',
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                  </span>
                  {index < request.stages.length - 1 && (
                    <span className="mx-2 hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />
                  )}
                </div>
                <div className="text-sm">
                  <p className="font-medium">
                    {index + 1}. {label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {done
                      ? doneLog
                        ? `${doneLog.actorEmail}, ${formatTimestamp(doneLog.at)}`
                        : 'Cleared'
                      : current
                        ? request.status === 'changes_requested'
                          ? 'Changes requested'
                          : 'Waiting for a decision'
                        : closed && index === request.stageIndex
                          ? statusLabel(request.status)
                          : 'Upcoming'}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

/* ---------------- Conflict panel ---------------- */

export function ConflictPanel({
  conflicts,
  ranks,
  groupId,
  organisations,
  categories,
  authorities,
  selfId,
}: {
  conflicts: ConflictItem[]
  ranks: PriorityRank[]
  groupId: string | null
  organisations: Organisation[]
  categories: EventCategory[]
  authorities: Authority[]
  selfId: string
}) {
  if (conflicts.length === 0) return null
  const orgName = (id: string) => organisations.find((o) => o.id === id)?.name ?? id
  const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id
  const authLabel = (id: string | undefined) => authorities.find((a) => a.id === id)?.shortLabel ?? ''
  const selfRank = ranks.find((r) => r.requestId === selfId)

  return (
    <section
      aria-label="Conflicts"
      className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          This request overlaps with {conflicts.length} other{conflicts.length === 1 ? '' : 's'}
        </h3>
        {groupId && (
          <Button asChild size="sm" variant="outline" className="bg-background text-foreground">
            <Link href={`/admin/bookings/conflicts/${encodeURIComponent(groupId)}`}>Open conflict</Link>
          </Button>
        )}
      </div>
      {selfRank && (
        <div className="mt-2 text-sm">
          <p>
            This request ranks <strong>{selfRank.rank} of {ranks.length}</strong> by priority rules. The decision is the
            admin&apos;s.
          </p>
          {selfRank.reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {selfRank.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ul className="mt-3 grid gap-2">
        {conflicts.map((item) => {
          const r = item.request
          const rank = ranks.find((x) => x.requestId === r.id)
          const stage = r.stages[r.stageIndex]
          return (
            <li key={r.id} className="rounded-md border border-red-200 bg-background p-3 text-foreground dark:border-red-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.eventName}</span>
                <StatusBadge status={r.status} />
                <CategoryBadge label={catLabel(r.category)} />
                {rank && <Badge variant="outline">Rank {rank.rank}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {orgName(r.organisationId)} · {formatDate(r.date)}, {formatRange(r.startMin, r.endMin)}
                {r.status === 'pending' && stage ? ` · at ${authLabel(stage)}` : ''}
              </p>
              {item.kind === 'confirmed_booking' && (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-red-800 dark:text-red-300">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Confirmed booking, blocks final approval
                </p>
              )}
              {rank && rank.reasons.length > 0 && item.kind === 'competing_request' && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                  {rank.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ---------------- Alternatives ---------------- */

export function AlternativeRooms({ rooms }: { rooms: Room[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Alternative rooms</CardTitle>
      </CardHeader>
      <CardContent>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other room is free at this time with enough seats.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rooms.map((room) => (
              <li key={room.id} className="rounded-md border border-border p-2.5 text-sm">
                <p className="font-medium">{formatVenue(room)}</p>
                <p className="text-xs text-muted-foreground">
                  {room.capacity} seats{room.features.length > 0 ? ` · ${room.features.join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- History ---------------- */

const VERB: Record<ApprovalLog['action'], string> = {
  submitted: 'submitted the request',
  forwarded: 'forwarded the request',
  escalated: 'escalated the request',
  confirmed: 'gave final approval',
  rejected: 'rejected the request',
  changes_requested: 'requested changes',
  resubmitted: 'resubmitted the request',
  withdrawn: 'withdrew the request',
  cancelled: 'cancelled the booking',
  displaced: 'displaced this booking',
  override_confirmed: 'confirmed by override',
  auto_approved: 'approved automatically',
  remark: 'added an internal remark',
}

function actorName(log: ApprovalLog, authorities: Authority[]): string {
  switch (log.actorAuthority) {
    case 'system':
      return 'System'
    case 'organisation':
      return 'Organisation'
    case 'superadmin':
      return 'Super admin'
    default:
      return authorities.find((a) => a.id === log.actorAuthority)?.shortLabel ?? log.actorAuthority
  }
}

export function HistoryList({ logs, authorities, now }: { logs: ApprovalLog[]; authorities: Authority[]; now: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">History</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ol className="grid gap-3">
            {logs.map((log) => (
              <li
                key={log.id}
                className={cn(
                  'rounded-md border-l-2 pl-3 text-sm',
                  log.internal ? 'border-amber-400 bg-amber-50/60 py-1.5 dark:bg-amber-950/20' : 'border-border',
                )}
              >
                <p>
                  <span className="font-medium">{actorName(log, authorities)}</span> {VERB[log.action]}
                  {log.internal && (
                    <Badge variant="outline" className="ml-2 border-amber-400 text-xs">
                      Internal
                    </Badge>
                  )}
                </p>
                {log.reason && <p className="mt-0.5 text-muted-foreground">{log.reason}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {log.actorEmail} · {formatTimestamp(log.at)} · {relativeTime(log.at, now)}
                  {log.fromStatus && log.fromStatus !== log.toStatus
                    ? ` · ${statusLabel(log.fromStatus)} to ${statusLabel(log.toStatus)}`
                    : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export { ConflictBadge }
