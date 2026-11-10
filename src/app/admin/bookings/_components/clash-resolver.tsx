'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { changesRequestedEmails, offeredEmails, rejectedEmails, type MailContext } from '../_server/engine/notifications'
import type { ClashGroupView, ClashMemberView, EmailDraft, MutationOutcome } from '../types'
import { formatClock, formatCompactDateTime, formatCompactRange, formatDate, formatTimestamp, formatVenue } from '../utils'
import { postJson, useUndoToast } from './use-booking-action'

const MIN_REASON = 10
type Choice = 'offer_room' | 'request_changes' | 'reject'
interface Decision {
  action: Choice
  roomId: string | null
  reason: string
}

function pickReason(member: ClashMemberView, winnerIsSuggested: boolean): string {
  return winnerIsSuggested && member.rank.reasons.length > 0 ? `${member.rank.reasons.join('. ')}.` : 'Academic Booking gave the room to another request for this slot.'
}

export function ClashResolver({ view, groupId }: { view: ClashGroupView; groupId: string }) {
  const router = useRouter()
  const undoToast = useUndoToast()
  const { group, room, members, blockers } = view
  const pending = members.filter((m) => m.request.status === 'pending')
  const [winnerId, setWinnerId] = useState(view.suggestedWinnerId ?? pending[0]?.request.id ?? '')
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [busy, setBusy] = useState(false)

  const others = pending.filter((m) => m.request.id !== winnerId)
  const winner = members.find((m) => m.request.id === winnerId)
  const hardBlocked = blockers.length > 0

  const decisionFor = (m: ClashMemberView): Decision =>
    decisions[`${winnerId}|${m.request.id}`] ?? {
      action: m.alternatives.length > 0 ? 'offer_room' : 'request_changes',
      roomId: m.alternatives[0]?.room.id ?? null,
      reason: pickReason(m, winnerId === view.suggestedWinnerId),
    }
  const setDecision = (m: ClashMemberView, patch: Partial<Decision>) =>
    setDecisions((prev) => ({ ...prev, [`${winnerId}|${m.request.id}`]: { ...decisionFor(m), ...patch } }))

  const valid = !hardBlocked && winner !== undefined && others.every((m) => decisionFor(m).reason.trim().length >= MIN_REASON || decisionFor(m).action === 'offer_room')

  const previews = useMemo(
    () =>
      others.map((m) => {
        const d = decisions[`${winnerId}|${m.request.id}`] ?? { action: m.alternatives.length > 0 ? 'offer_room' : 'request_changes', roomId: m.alternatives[0]?.room.id ?? null, reason: pickReason(m, winnerId === view.suggestedWinnerId) }
        const mail: MailContext = { request: m.request, organisation: m.organisation, room, offices: view.offices }
        const text = d.reason.trim() || '(your reason)'
        const target = m.alternatives.find((a) => a.room.id === d.roomId)?.room
        let email: EmailDraft | undefined
        if (d.action === 'offer_room' && target) email = offeredEmails(mail, target, new Date(Date.now() + 24 * 3_600_000).toISOString(), d.reason.trim() || null, 'Academic Booking')[0]
        else if (d.action === 'request_changes') email = changesRequestedEmails(mail, text)[0]
        else if (d.action === 'reject') email = rejectedEmails(mail, text)[0]
        return { member: m, decision: d, email, target }
      }),
    [others, decisions, winnerId, room, view.offices, view.suggestedWinnerId],
  )

  async function confirm() {
    if (!winner) return
    const versions: Record<string, number> = {}
    for (const m of members) versions[m.request.id] = m.request.version
    setBusy(true)
    const result = await postJson<MutationOutcome>(`/clashes/${encodeURIComponent(groupId)}/resolve`, {
      winnerId,
      versions,
      others: others.map((m) => {
        const d = decisionFor(m)
        return { id: m.request.id, action: d.action, reason: d.reason.trim(), roomId: d.action === 'offer_room' ? (d.roomId ?? undefined) : undefined }
      }),
    })
    setBusy(false)
    if (!result.success) {
      toast.error(result.error ?? 'Could not apply the decision.')
      if (result.error?.includes('changed')) router.refresh()
      return
    }
    undoToast(`${winner.organisation.name} has ${formatVenue(room)}. The other request${others.length === 1 ? ' has' : 's have'} been answered.`, result.data?.batchId)
    router.push('/admin/bookings/clashes')
    router.refresh()
  }

  // Shared axis for the overlap strip, rounded out to whole hours.
  const axisStart = Math.max(Math.floor((group.startMin - 60) / 60) * 60, 8 * 60)
  const axisEnd = Math.min(Math.ceil((group.endMin + 60) / 60) * 60, 23 * 60)
  const span = axisEnd - axisStart
  const pct = (m: number) => `${((Math.min(Math.max(m, axisStart), axisEnd) - axisStart) / span) * 100}%`
  const strip = [
    ...blockers.map((b) => ({ id: `b-${b.label}-${b.startMin}`, label: b.label, startMin: b.startMin, endMin: b.endMin, kind: b.kind })),
    ...members.map((m) => ({ id: m.request.id, label: m.request.eventName, startMin: m.request.startMin, endMin: m.request.endMin, kind: m.request.id === winnerId ? ('winner' as const) : ('other' as const) })),
  ]
  const hours: number[] = []
  for (let h = Math.ceil(axisStart / 60); h * 60 <= axisEnd; h++) hours.push(h)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <div>
        <Link href="/admin/bookings/clashes" className="inline-flex items-center gap-1 text-sm underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Clashes
        </Link>
        <h1 className="mt-1">
          {room.building} {room.name}, {formatDate(group.date)}
        </h1>
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          {members.length === 2 ? 'Two requests want' : `${members.length} requests want`} {formatVenue(room)} ({room.capacity} seats) from {formatCompactRange(group.startMin, group.endMin)}. Choose who gets it.
          Everyone else is offered a free room instead of a plain no.
        </p>
      </div>

      <section aria-label="Overlap" className="rounded-xl border border-border bg-card p-4">
        <div className="relative h-5 text-xs text-muted-foreground" aria-hidden="true">
          {hours.map((h) => (
            <span key={h} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(h * 60) }}>
              {formatClock(h * 60)}
            </span>
          ))}
        </div>
        <div className="grid gap-1.5">
          {strip.map((s) => (
            <div key={s.id} className="relative h-8 rounded bg-muted/30">
              <div
                className={cn(
                  'absolute flex h-8 items-center overflow-hidden rounded border px-2 text-xs font-medium',
                  s.kind === 'winner' && 'border-primary bg-primary text-white',
                  s.kind === 'other' && 'border-2 border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100',
                  s.kind === 'class' && 'border-border bg-muted text-muted-foreground',
                  (s.kind === 'booked' || s.kind === 'held') && 'border-slate-700 bg-slate-700 text-white',
                )}
                style={{ left: pct(s.startMin), width: `calc(${pct(s.endMin)} - ${pct(s.startMin)})` }}
              >
                <span className="truncate">
                  {s.kind === 'class' ? 'Class: ' : s.kind === 'booked' ? 'Booked: ' : s.kind === 'held' ? 'Held: ' : ''}
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {hardBlocked ? `Something is already ${blockers.some((b) => b.kind === 'class') ? 'booked, including a class' : 'booked or held'} in this slot, so no request here can be confirmed until it is cleared.` : 'Nothing is booked yet. Whoever wins is confirmed and ready for AMS.'}
        </p>
      </section>

      <section aria-label="Compare" className={cn('grid grid-cols-1 gap-3', members.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {members.map((m) => {
          const selected = m.request.id === winnerId
          const suggested = m.request.id === view.suggestedWinnerId
          const r = m.request
          return (
            <div key={r.id} className={cn('grid content-start gap-3 rounded-xl bg-card p-4', selected ? 'border-2 border-primary' : 'border border-border')}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                {suggested && <span className="rounded-full border border-emerald-300 bg-[#e4f2e9] px-2 py-0.5 text-xs font-medium text-[#1d6b3f]">Suggested by the rules</span>}
              </div>
              <div>
                <h2 className="text-left">{r.eventName}</h2>
                <p className="text-sm text-muted-foreground">
                  {m.organisation.name}, governed by {view.offices.find((o) => o.id === m.organisation.officeId)?.shortLabel}
                </p>
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Event type</dt>
                  <dd className="font-medium">
                    {m.categoryLabel}, priority tier {m.tier}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">People</dt>
                  <dd className={cn('font-medium', r.expectedAttendance > room.capacity && 'text-[#b3261e]')}>
                    {r.expectedAttendance} of {room.capacity} seats
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Progress</dt>
                  <dd className="font-medium">
                    {r.status === 'pending' ? `At ${view.offices.find((o) => o.id === r.stages[r.stageIndex])?.shortLabel}` : r.status.replace('_', ' ')}
                    {r.escalated ? ', escalated' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Submitted</dt>
                  <dd className="font-medium">{formatTimestamp(r.createdAt)}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                This semester: {m.standing.semester.bookings} bookings, {m.standing.semester.used} used, {m.standing.semester.noShows} no-shows, {m.standing.semester.lateCancels} cancelled late.
              </p>
              <p className="text-sm">{m.rank.reasons.join('. ')}{m.rank.reasons.length ? '.' : ''}</p>
              {view.canResolve && r.status === 'pending' && (
                <Button variant={selected ? 'default' : 'outline'} aria-pressed={selected} disabled={hardBlocked} onClick={() => setWinnerId(r.id)}>
                  {selected ? `Gets ${room.building} ${room.name}` : `Give ${room.building} ${room.name} to ${m.organisation.name}`}
                </Button>
              )}
              <Link className="text-sm underline" href={`/admin/bookings?r=${r.id}`}>
                Open request
              </Link>
            </div>
          )
        })}
      </section>

      {view.canResolve ? (
        hardBlocked ? (
          <p className="rounded-lg border border-red-300 bg-[#fdecea] p-3 text-sm text-[#b3261e]">
            This slot is already taken. Open each request and use Override and confirm (not for classes), or decline or offer a room to each club.
          </p>
        ) : (
          winner && (
            <section aria-label="Decision" className="grid gap-4 rounded-xl border border-border bg-card p-4">
              <h2>What the other request{others.length === 1 ? '' : 's'} get{others.length === 1 ? 's' : ''} instead</h2>
              {previews.map(({ member, decision, email }) => (
                <div key={member.request.id} className="grid gap-3 rounded-lg border border-border p-3">
                  <p className="font-medium">
                    {member.request.eventName} <span className="font-normal text-muted-foreground">· {member.organisation.name}</span>
                  </p>
                  <div className="grid gap-1.5 sm:max-w-sm">
                    <Label htmlFor={`act-${member.request.id}`}>Decision</Label>
                    <Select value={decision.action} onValueChange={(v) => setDecision(member, { action: v as Choice })}>
                      <SelectTrigger id={`act-${member.request.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offer_room">Offer a room</SelectItem>
                        <SelectItem value="request_changes">Ask for changes</SelectItem>
                        <SelectItem value="reject">Decline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {decision.action === 'offer_room' && (
                    <fieldset className="grid gap-1.5">
                      <legend className="mb-1 text-sm font-medium">Free rooms that seat {member.request.expectedAttendance}</legend>
                      {member.alternatives.length === 0 && <p className="text-sm text-muted-foreground">No room is free at this time with enough seats.</p>}
                      {member.alternatives.map((a) => (
                        <button
                          key={a.room.id}
                          type="button"
                          aria-pressed={decision.roomId === a.room.id}
                          onClick={() => setDecision(member, { roomId: a.room.id })}
                          className={cn('rounded-md border p-2 text-left text-sm', decision.roomId === a.room.id ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-accent')}
                        >
                          {formatVenue(a.room)} <span className="text-muted-foreground">· {a.room.capacity} seats</span>
                        </button>
                      ))}
                    </fieldset>
                  )}
                  <div className="grid gap-1.5">
                    <Label htmlFor={`reason-${member.request.id}`}>Reason, sent to the club</Label>
                    <Textarea id={`reason-${member.request.id}`} rows={2} value={decision.reason} onChange={(e) => setDecision(member, { reason: e.target.value })} />
                    {decision.action !== 'offer_room' && decision.reason.trim().length < MIN_REASON && <p className="text-xs text-red-700">At least {MIN_REASON} characters.</p>}
                  </div>
                  {email && (
                    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">Email the club will receive</p>
                      <p className="mt-1 font-medium">{email.subject}</p>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-sans text-xs">{email.text}</pre>
                    </div>
                  )}
                </div>
              ))}
              <div>
                <h3>When you confirm</h3>
                <ol className="mt-1 list-decimal pl-5 text-sm">
                  <li>
                    {winner.organisation.name} is confirmed in {formatVenue(room)} on {formatCompactDateTime(group.date, winner.request.startMin, winner.request.endMin)}, ready for AMS, and is emailed.
                  </li>
                  {previews.map(({ member, decision, target }) => (
                    <li key={member.request.id}>
                      {member.organisation.name}{' '}
                      {decision.action === 'offer_room' ? `is offered ${target ? formatVenue(target) : 'a room'}, held for 24 hours` : decision.action === 'request_changes' ? 'is asked for changes' : 'is declined'} and is emailed.
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy || !valid} onClick={confirm}>
                  {busy ? 'Working…' : 'Confirm decision'}
                </Button>
                <p className="text-xs text-muted-foreground">You can undo for 10 seconds after confirming.</p>
              </div>
            </section>
          )
        )
      ) : (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          Academic Booking decides between requests from different offices. You can approve, escalate or offer a room on your own request from its page.
        </p>
      )}
    </div>
  )
}
