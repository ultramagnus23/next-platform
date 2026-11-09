'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { API_BASE } from '../data'
import type {
  ConflictGroupView,
  ConflictMemberView,
  OutboxEmail,
  ResolveOutcome,
  RequestStatus,
  Room,
} from '../types'
import { formatClock, formatDate, formatRange, formatTimestamp, formatVenue, statusLabel } from '../utils'
import { CategoryBadge, FlagBadge, StatusBadge, TierChip } from './badges'

const MIN_REASON = 10
const AXIS_START = 8 * 60
const AXIS_END = 23 * 60

type Decision = { action: 'reject' | 'request_changes'; reason: string; alternativeRoomId: string | null }

interface ConflictResolverProps {
  view: ConflictGroupView
  groupId: string
  rooms: Room[]
}

export function ConflictResolver({ view, groupId, rooms }: ConflictResolverProps) {
  const { group, members } = view
  const pendingMembers = members.filter((m) => m.request.status === 'pending')
  const hasHard = group.hasConfirmed

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <OverlapTimeline view={view} />
      <section
        aria-label="Comparison"
        className={cn('grid grid-cols-1 gap-3', members.length >= 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}
      >
        {members.map((member) => (
          <MemberColumn key={member.request.id} member={member} suggested={member.request.id === view.suggestedWinnerId} roomCapacity={view.room.capacity} />
        ))}
      </section>

      {hasHard && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
          A confirmed booking holds part of this slot, so a pending request cannot be confirmed here. Open the request and
          use Override and confirm, or reject it.
        </p>
      )}

      {view.canResolve && pendingMembers.length > 0 && !hasHard ? (
        <ResolvePanel view={view} groupId={groupId} rooms={rooms} />
      ) : !view.canResolve ? (
        <Card>
          <CardContent className="grid gap-2 p-4 text-sm">
            <p className="text-muted-foreground">Academic Booking decides between requests from different offices.</p>
            <p>You can forward, escalate or reject your own requests from their pages:</p>
            <ul className="flex flex-wrap gap-2">
              {members
                .filter((m) => m.visibility === 'full' && m.actions.some((a) => a.visible && a.action !== 'remark'))
                .map((m) => (
                  <li key={m.request.id}>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/bookings/requests/${m.request.id}`}>{m.request.eventName}</Link>
                    </Button>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

/* ---------------- Timeline ---------------- */

function OverlapTimeline({ view }: { view: ConflictGroupView }) {
  const span = AXIS_END - AXIS_START
  const pct = (min: number) => `${((Math.min(Math.max(min, AXIS_START), AXIS_END) - AXIS_START) / span) * 100}%`
  const hours = Array.from({ length: 16 }, (_, i) => 8 + i)
  const overlapLeft = ((view.group.overlapStartMin - AXIS_START) / span) * 100
  const overlapWidth = ((view.group.overlapEndMin - view.group.overlapStartMin) / span) * 100

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Overlap on the same time axis</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="relative ml-0 h-5 text-xs text-muted-foreground" aria-hidden="true">
            {hours.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(h * 60) }}>
                {formatClock(h * 60)}
              </span>
            ))}
          </div>
          <div className="relative grid gap-1.5 rounded-md border border-border bg-muted/30 p-1.5">
            <div
              className="absolute top-0 h-full bg-red-500/15"
              style={{ left: `${overlapLeft}%`, width: `${overlapWidth}%` }}
              aria-hidden="true"
            />
            {view.members.map((m) => {
              const confirmed = m.request.status === 'confirmed'
              return (
                <div key={m.request.id} className="relative h-8">
                  <div
                    role="img"
                    aria-label={`${m.request.eventName}, ${formatRange(m.request.startMin, m.request.endMin)}, ${statusLabel(m.request.status)}`}
                    className={cn(
                      'absolute flex h-8 items-center overflow-hidden rounded border px-2 text-xs font-medium',
                      confirmed
                        ? 'border-emerald-700 bg-emerald-600 text-white'
                        : 'border-2 border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100',
                    )}
                    style={{
                      left: pct(m.request.startMin),
                      width: `calc(${pct(m.request.endMin)} - ${pct(m.request.startMin)})`,
                    }}
                  >
                    <span className="truncate">{m.request.eventName}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">The shaded band is where two or more requests want the room.</p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------- Comparison column ---------------- */

function MemberColumn({ member, suggested, roomCapacity }: { member: ConflictMemberView; suggested: boolean; roomCapacity: number }) {
  const r = member.request
  const over = r.expectedAttendance > roomCapacity
  return (
    <Card className={cn(suggested && 'border-primary ring-1 ring-primary')}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {suggested && <FlagBadge tone="info">Suggested by priority rules</FlagBadge>}
          {r.status === 'confirmed' && <FlagBadge tone="warn">Confirmed booking, blocks final approval</FlagBadge>}
        </div>
        <CardTitle className="text-base">{r.eventName}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={r.status} />
          <CategoryBadge label={member.categoryLabel} />
          <TierChip tier={member.rank.tier} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <dl className="grid gap-2">
          <Row label="Organisation">{member.organisation.name}</Row>
          <Row label="Governing authority">{member.organisation.authorityId.toUpperCase()}</Row>
          <Row label="Time">{formatRange(r.startMin, r.endMin)}</Row>
          <Row label="Attendance">
            <span className={cn(over && 'font-semibold text-red-700 dark:text-red-300')}>
              {r.expectedAttendance} of {roomCapacity} seats{over ? ' (over capacity)' : ''}
            </span>
          </Row>
          <Row label="Approval progress">
            {r.status === 'pending' ? `Stage ${r.stageIndex + 1} of ${r.stages.length}, ${member.stageLabel}` : statusLabel(r.status)}
            {r.escalated ? ', escalated' : ''}
          </Row>
          <Row label="Submitted">{formatTimestamp(r.createdAt)}</Row>
          <Row label="Record">
            {member.record.requests} requests, {member.record.confirmed} confirmed, {member.record.rejected} rejected,{' '}
            {member.record.cancelled} cancelled
          </Row>
        </dl>
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Priority rank {member.rank.rank}
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {member.rank.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {suggested && (
            <p className="mt-1 text-xs text-muted-foreground">The rules only suggest. The decision is the admin&apos;s.</p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/bookings/requests/${r.id}`}>Open request</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/* ---------------- Resolve flow ---------------- */

function ResolvePanel({ view, groupId, rooms }: ConflictResolverProps) {
  const router = useRouter()
  const pending = view.members.filter((m) => m.request.status === 'pending')
  const [winnerId, setWinnerId] = useState(view.suggestedWinnerId ?? pending[0]?.request.id ?? '')
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [step, setStep] = useState<'edit' | 'summary'>('edit')
  const [outcome, setOutcome] = useState<ResolveOutcome | null>(null)
  const [busy, setBusy] = useState(false)

  const others = pending.filter((m) => m.request.id !== winnerId)
  const winner = pending.find((m) => m.request.id === winnerId)

  // Reset the decisions whenever the winner changes, with reasons from the priority rules.
  useEffect(() => {
    const next: Record<string, Decision> = {}
    for (const m of pending) {
      if (m.request.id === winnerId) continue
      const advice = winnerId === view.suggestedWinnerId ? m.rank.reasons.join('. ') : ''
      next[m.request.id] = {
        action: 'request_changes',
        reason: advice ? `${advice}.` : 'Academic Booking confirmed another request for this slot.',
        alternativeRoomId: m.alternatives[0]?.id ?? null,
      }
    }
    setDecisions(next)
    setStep('edit')
    setOutcome(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerId])

  const valid = others.every((m) => (decisions[m.request.id]?.reason.trim().length ?? 0) >= MIN_REASON)

  const body = useMemo(() => {
    const versions: Record<string, number> = {}
    for (const m of view.members) versions[m.request.id] = m.request.version
    return {
      winnerId,
      versions,
      others: others.map((m) => {
        const d = decisions[m.request.id]
        return {
          id: m.request.id,
          action: d?.action ?? 'reject',
          reason: d?.reason.trim() ?? '',
          alternativeRoomId: d?.action === 'request_changes' ? (d.alternativeRoomId ?? null) : null,
        }
      }),
    }
  }, [view.members, winnerId, others, decisions])

  async function send(dryRun: boolean): Promise<{ ok: boolean; data?: ResolveOutcome; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/conflicts/${encodeURIComponent(groupId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, dryRun }),
      })
      const json = (await response.json()) as { success: boolean; data?: ResolveOutcome; error?: string }
      return { ok: response.ok && json.success, data: json.data, error: json.error }
    } catch {
      return { ok: false, error: 'Network error. Try again.' }
    }
  }

  async function preview() {
    setBusy(true)
    const result = await send(true)
    setBusy(false)
    if (result.ok && result.data) {
      setOutcome(result.data)
      setStep('summary')
      return
    }
    toast.error(result.error ?? 'Could not prepare the summary.')
    if (result.error?.includes('changed')) router.refresh()
  }

  async function confirm() {
    setBusy(true)
    const result = await send(false)
    setBusy(false)
    if (result.ok) {
      toast.success('Decision applied. Emails are in the Outbox.')
      router.refresh()
      router.push('/admin/bookings/conflicts')
      return
    }
    toast.error(result.error ?? 'Could not apply the decision.')
    if (result.error?.includes('changed')) router.refresh()
  }

  const nameOf = (id: string) => view.members.find((m) => m.request.id === id)?.request.eventName ?? id

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Resolve this conflict</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {step === 'edit' ? (
          <>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Which request gets the room?</legend>
              <div className="flex flex-wrap gap-2">
                {pending.map((m) => (
                  <Button
                    key={m.request.id}
                    type="button"
                    variant={winnerId === m.request.id ? 'default' : 'outline'}
                    aria-pressed={winnerId === m.request.id}
                    onClick={() => setWinnerId(m.request.id)}
                  >
                    {m.request.eventName}
                    {m.request.id === view.suggestedWinnerId ? ' (suggested)' : ''}
                  </Button>
                ))}
              </div>
            </fieldset>

            {others.map((m) => {
              const d = decisions[m.request.id]
              if (!d) return null
              const update = (patch: Partial<Decision>) =>
                setDecisions((prev) => ({ ...prev, [m.request.id]: { ...d, ...patch } }))
              const options = m.alternatives
              return (
                <div key={m.request.id} className="grid gap-3 rounded-md border border-border p-3">
                  <p className="font-medium">
                    {m.request.eventName} <span className="font-normal text-muted-foreground">· {m.organisation.name}</span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`action-${m.request.id}`}>Decision</Label>
                      <Select value={d.action} onValueChange={(v) => update({ action: v as Decision['action'] })}>
                        <SelectTrigger id={`action-${m.request.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="request_changes">Request changes, suggest another room</SelectItem>
                          <SelectItem value="reject">Reject</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`room-${m.request.id}`}>Suggested room</Label>
                      <Select
                        value={d.alternativeRoomId ?? 'none'}
                        onValueChange={(v) => update({ alternativeRoomId: v === 'none' ? null : v })}
                      >
                        <SelectTrigger id={`room-${m.request.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No suggestion</SelectItem>
                          {options.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {formatVenue(room)} ({room.capacity} seats)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`reason-${m.request.id}`}>Reason, sent to the organisation</Label>
                    <Textarea
                      id={`reason-${m.request.id}`}
                      rows={2}
                      value={d.reason}
                      onChange={(e) => update({ reason: e.target.value })}
                    />
                    {d.reason.trim().length < MIN_REASON && (
                      <p className="text-xs text-red-700">At least {MIN_REASON} characters.</p>
                    )}
                  </div>
                </div>
              )
            })}
            <div>
              <Button onClick={preview} disabled={busy || !valid || !winner}>
                {busy ? 'Preparing…' : 'Review decision'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium">Status changes</p>
              <ul className="mt-1 grid gap-1 text-sm">
                {outcome?.requests.map((r) => (
                  <li key={r.id}>
                    <strong>{nameOf(r.id)}</strong> becomes <StatusText status={r.status} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Emails that will be sent ({outcome?.emails.length ?? 0})</p>
              <ul className="mt-1 grid gap-2">
                {outcome?.emails.map((e) => <EmailRow key={e.id} email={e} />)}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep('edit')} disabled={busy}>
                Back
              </Button>
              <Button onClick={confirm} disabled={busy}>
                {busy ? 'Applying…' : 'Confirm decision'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Everything is applied together or not at all. {formatDate(view.group.date)} · {formatVenue(view.room)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatusText({ status }: { status: RequestStatus }) {
  return <span className="font-medium">{statusLabel(status)}</span>
}

function EmailRow({ email }: { email: OutboxEmail }) {
  return (
    <li className="rounded-md border border-border bg-muted/40 p-2.5 text-sm">
      <p className="font-medium">{email.subject}</p>
      <p className="text-xs text-muted-foreground">To: {email.to.join(', ')}</p>
      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-sans text-xs">{email.text}</pre>
    </li>
  )
}
