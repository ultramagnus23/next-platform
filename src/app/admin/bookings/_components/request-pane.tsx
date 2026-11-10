'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { API_BASE, QUICK_REASONS } from '../data'
import {
  changesRequestedEmails,
  displacedEmails,
  offeredEmails,
  rejectedEmails,
  type MailContext,
} from '../_server/engine/notifications'
import type { ActionAvailability, ActionId, EmailDraft, FreeRoom, MutationOutcome, RequestDetail } from '../types'
import { formatCompactDateTime, formatDate, formatTimestamp, formatVenue, relativeTime } from '../utils'
import { RoomTimeline } from './room-timeline'
import { postJson, STALE_MESSAGE, useUndoToast, type ApiResult } from './use-booking-action'

type Mode = null | 'offer' | 'changes' | 'decline' | 'override' | 'cancel'
const MIN_REASON = 10

function EmailPreview({ email }: { email: EmailDraft | undefined }) {
  if (!email) return null
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">Email the club will receive</p>
      <p className="mt-1 font-medium">{email.subject}</p>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">{email.text}</pre>
    </div>
  )
}

function Callout({ tone, title, children }: { tone: 'red' | 'amber' | 'green'; title: string; children?: React.ReactNode }) {
  const tones = {
    red: 'border-red-300 bg-[#fdecea] text-[#b3261e] dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
    amber: 'border-amber-300 bg-[#fff1cf] text-[#7a4b00] dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
    green: 'border-emerald-300 bg-[#e4f2e9] text-[#1d6b3f] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  }
  const Icon = tone === 'green' ? CheckCircle2 : AlertTriangle
  return (
    <div className={cn('rounded-lg border px-3 py-2 text-sm', tones[tone])}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {title}
      </p>
      {children && <div className="mt-0.5 text-sm">{children}</div>}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

interface RequestPaneProps {
  detail: RequestDetail
  demo: boolean
  /** Called after a decision so the list can move to the next row. */
  onDone: () => void
}

export function RequestPane({ detail, demo, onDone }: RequestPaneProps) {
  const { request, room, organisation, offices } = detail
  const undoToast = useUndoToast()
  const [mode, setMode] = useState<Mode>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [offerRoom, setOfferRoom] = useState<string | null>(null)
  const [options, setOptions] = useState<FreeRoom[]>(detail.alternatives)
  const [showHistory, setShowHistory] = useState(false)
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => setNowMs(Date.now()), [detail.request.id])

  useEffect(() => {
    setMode(null)
    setReason('')
    setNote('')
    setOfferRoom(detail.alternatives[0]?.room.id ?? null)
    setOptions(detail.alternatives)
    setShowHistory(false)
  }, [detail.request.id, detail.request.version, detail.alternatives])

  const act = (id: ActionId): ActionAvailability | undefined => detail.actions.find((a) => a.action === id)
  const approve = act('approve')
  const label = (id: string) => offices.find((o) => o.id === id)?.shortLabel ?? id
  const mail: MailContext = useMemo(() => ({ request, organisation, room, offices }), [request, organisation, room, offices])

  const run = useCallback(
    async (body: Record<string, unknown>, message: string): Promise<boolean> => {
      setBusy(true)
      const result: ApiResult<MutationOutcome> = await postJson(`/requests/${request.id}/actions`, { ...body, version: request.version })
      setBusy(false)
      if (result.success) {
        undoToast(message, result.data?.batchId)
        onDone()
        return true
      }
      const stale = result.error?.startsWith('This request changed')
      toast.error(stale ? STALE_MESSAGE : (result.error ?? 'Something went wrong.'))
      if (stale) onDone()
      return false
    },
    [request.id, request.version, undoToast, onDone],
  )

  const doApprove = useCallback(() => {
    if (!approve?.enabled) return
    const last = approve.label === 'Give final approval'
    void run({ action: 'approve' }, last ? `${request.eventName} confirmed.` : `${request.eventName} approved and sent on.`)
  }, [approve, run, request.eventName])

  // Keyboard: A approve, O offer a room, C ask for changes, D decline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'a') doApprove()
      else if (k === 'o' && act('offer_room')?.enabled) openOffer()
      else if (k === 'r' && act('request_changes')?.enabled) setMode('changes')
      else if (k === 'd' && act('reject')?.enabled) setMode('decline')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doApprove, detail.actions])

  async function openOffer() {
    setMode('offer')
    try {
      const q = new URLSearchParams({
        date: request.date,
        startMin: String(request.startMin),
        endMin: String(request.endMin),
        minSeats: String(request.expectedAttendance),
        excludeRoomId: request.roomId,
      })
      const res = await fetch(`${API_BASE}/rooms/free?${q.toString()}`)
      const json = (await res.json()) as { success: boolean; data?: FreeRoom[] }
      if (json.success && json.data && json.data.length > 0) {
        setOptions(json.data)
        setOfferRoom((cur) => cur ?? json.data?.[0]?.room.id ?? null)
      }
    } catch {
      /* the three suggested rooms stay */
    }
  }

  const chosen = options.find((o) => o.room.id === offerRoom)?.room ?? null
  const text = reason.trim() || '(your reason)'
  const preview: EmailDraft | undefined =
    mode === 'offer' && chosen
      ? offeredEmails(mail, chosen, new Date(Date.now() + 24 * 3_600_000).toISOString(), reason.trim() || null, label(request.stages[request.stageIndex] ?? 'acad'))[0]
      : mode === 'changes'
        ? changesRequestedEmails(mail, text)[0]
        : mode === 'decline'
          ? rejectedEmails(mail, text)[0]
          : mode === 'cancel'
            ? rejectedEmails(mail, text, 'Cancelled')[0]
            : undefined
  const blockers = detail.clashes.filter((c) => c.kind === 'booked' || c.kind === 'class' || c.kind === 'held')
  const overridePreview =
    mode === 'override'
      ? blockers
          .filter((b) => b.kind === 'booked' && b.item.request)
          .map((b) => {
            const req = b.item.request
            return req ? displacedEmails({ ...mail, request: req }, text, request.eventName)[0] : undefined
          })[0]
      : undefined

  const stageLabels = request.stages.map((s) => label(s))
  const done = request.status === 'confirmed'
  const reasonOk = reason.trim().length >= MIN_REASON
  const note0 = 'Note for other approvers (not emailed)'
  const clashCallout = detail.clashes.filter((c) => c.kind === 'competing_request')
  const hard = detail.clashes.filter((c) => c.kind !== 'competing_request')

  return (
    <article aria-label={`Request ${request.id}`} className="grid gap-4">
      <header>
        <p className="text-xs text-muted-foreground">
          {request.id} · submitted {relativeTime(request.createdAt, new Date().toISOString())}
          {request.source === 'direct' ? ' · booked directly' : ''}
        </p>
        <h2 className="pane-title">{request.eventName}</h2>
        <p className="text-sm text-muted-foreground">
          {organisation.name}, governed by {label(organisation.officeId)}
        </p>
      </header>

      <ol className="grid gap-1.5 text-sm" aria-label="Approval steps">
        {stageLabels.map((name, i) => {
          const past = done || i < request.stageIndex
          const current = !past && i === request.stageIndex && request.status === 'pending'
          const office = offices.find((o) => o.id === request.stages[i])
          const slaDays = Math.max(1, Math.round((office?.responseTargetHours ?? 48) / 24))
          const waited = nowMs ? Math.floor((nowMs - Date.parse(request.stageEnteredAt)) / 86_400_000) + 1 : 1
          return (
            <li key={`${name}-${i}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]',
                  past && 'border-emerald-600 bg-emerald-600 text-white',
                  current && 'border-primary bg-primary text-white',
                  !past && !current && 'border-border text-muted-foreground',
                )}
              >
                {past ? '✓' : i + 1}
              </span>
              <span className={cn(current && 'font-semibold', !past && !current && 'text-muted-foreground')}>
                {name}
                {past ? ' approved' : current ? `: you are up. Waiting, day ${waited} of ${slaDays}` : ''}
              </span>
            </li>
          )
        })}
      </ol>

      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Room">{formatVenue(room)}</Fact>
        <Fact label="When">{formatCompactDateTime(request.date, request.startMin, request.endMin)}</Fact>
        <Fact label="People">
          {request.expectedAttendance} of {room.capacity} seats
        </Fact>
        <Fact label="Event type">
          {detail.categoryLabel}, priority tier {detail.tier}
        </Fact>
      </dl>
      {request.description && <p className="max-w-[62ch] text-sm">{request.description}</p>}

      <section aria-label="Checks" className="grid gap-2">
        {clashCallout.length > 0 && (
          <Callout tone="red" title={`Clash with ${clashCallout.length === 1 ? 'one other request' : `${clashCallout.length} other requests`}`}>
            {clashCallout.map((c) => {
              const r = c.item.request
              const at = r?.stages[r.stageIndex]
              return (
                <p key={c.item.id}>
                  {detail.clashOrgs[r?.id ?? ''] ?? 'Another club'} wants this room too: {r?.eventName}
                  {at ? ` (at ${label(at)})` : ''}. Academic Booking decides between offices.
                </p>
              )
            })}
            {detail.groupId && (
              <Link className="mt-1 inline-block underline" href={`/admin/bookings/clashes/${encodeURIComponent(detail.groupId)}`}>
                Open the clash
              </Link>
            )}
          </Callout>
        )}
        {hard.map((c) => (
          <Callout
            key={c.item.id}
            tone="red"
            title={c.kind === 'class' ? 'A class is booked here at this time' : c.kind === 'held' ? 'The room is held for an offer to another club' : `Already booked: ${c.item.request?.eventName ?? ''}`}
          >
            {c.kind === 'class' ? 'Classes cannot be overridden from a request.' : undefined}
          </Callout>
        ))}
        {detail.flags
          .filter((f) => f.kind !== 'overdue')
          .map((f) => (
            <Callout key={f.kind} tone="amber" title={f.title}>
              {f.body}
            </Callout>
          ))}
        {detail.flags.filter((f) => f.kind === 'overdue').map((f) => (
          <Callout key={f.kind} tone="amber" title={f.title}>
            {f.body}
          </Callout>
        ))}
        {detail.lane === 'clear' && detail.flags.length === 0 && <Callout tone="green" title="Nothing to check" />}
        <p className="text-xs text-muted-foreground">
          {organisation.name}: {detail.standing.weekBookings}
          {detail.standing.weeklyCap ? ` of ${detail.standing.weeklyCap}` : ''} bookings this week. This semester: {detail.standing.semester.bookings} {detail.standing.semester.bookings === 1 ? 'booking' : 'bookings'},{' '}
          {detail.standing.semester.used} used, {detail.standing.semester.noShows} {detail.standing.semester.noShows === 1 ? 'no-show' : 'no-shows'}, {detail.standing.semester.lateCancels} late cancellations.
        </p>
      </section>

      {detail.visibility === 'summary' ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          This request clashes with one of yours. You can read it. Academic Booking decides between requests from different offices.
        </p>
      ) : (
        <section aria-label="Actions" className="grid gap-2">
          {mode === null && (
            <>
              {approve?.visible &&
                (approve.enabled ? (
                  <Button disabled={busy} onClick={doApprove} className="justify-center">
                    {approve.label}
                    <kbd className="ml-2 hidden rounded border border-white/40 px-1 text-[10px] sm:inline">A</kbd>
                  </Button>
                ) : (
                  <div>
                    <Button disabled className="w-full">
                      {approve.label}
                    </Button>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      {approve.disabledReason}
                    </p>
                  </div>
                ))}
              {act('override_confirm')?.visible && (
                <Button variant="outline" onClick={() => setMode('override')}>
                  Override and confirm
                </Button>
              )}
              {act('escalate')?.visible && (
                <Button variant="outline" disabled={busy} onClick={() => run({ action: 'escalate' }, 'Escalated to Academic Booking.')}>
                  {act('escalate')?.label}
                </Button>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" disabled={!act('offer_room')?.enabled} onClick={openOffer}>
                  Suggest a room
                </Button>
                <Button variant="outline" disabled={!act('request_changes')?.enabled} onClick={() => setMode('changes')}>
                  Ask for changes
                </Button>
                <Button variant="outline" className="text-[#b3261e] dark:text-red-300" disabled={!act('reject')?.enabled} onClick={() => setMode('decline')}>
                  Decline
                </Button>
              </div>
              {act('cancel')?.visible && (
                <Button variant="outline" onClick={() => setMode('cancel')}>
                  Cancel booking
                </Button>
              )}
              {demo && act('accept_offer')?.visible && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    const r = await postJson(`/demo/accept-offer/${request.id}`, {})
                    setBusy(false)
                    if (r.success) {
                      toast.success('Offer accepted.')
                      onDone()
                    } else toast.error(r.error ?? 'Could not accept.')
                  }}
                >
                  Accept offer (demo)
                </Button>
              )}
              {demo && act('resubmit')?.visible && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    const r = await postJson(`/demo/resubmit/${request.id}`, {})
                    setBusy(false)
                    if (r.success) {
                      toast.success('Sent again.')
                      onDone()
                    } else toast.error(r.error ?? 'Could not send again.')
                  }}
                >
                  Send again (demo)
                </Button>
              )}
              {request.status === 'offered' && request.offer && (
                <p className="text-xs text-muted-foreground">
                  Offered {request.offer.roomId}, held until {formatTimestamp(request.offer.holdUntil)}.
                </p>
              )}
            </>
          )}

          {mode === 'offer' && (
            <div className="grid gap-3 rounded-lg border border-border p-3">
              <h3 className="font-semibold">Decline this room and suggest another</h3>
              <p className="text-xs text-muted-foreground">The club gets an email with this room. We hold it for them for 24 hours. If they accept, the request moves there.</p>
              <ul className="grid max-h-48 gap-1.5 overflow-auto" aria-label="Free rooms">
                {options.map((o) => (
                  <li key={o.room.id}>
                    <button
                      type="button"
                      aria-pressed={offerRoom === o.room.id}
                      onClick={() => setOfferRoom(o.room.id)}
                      className={cn('w-full rounded-md border p-2 text-left text-sm', offerRoom === o.room.id ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-accent')}
                    >
                      {formatVenue(o.room)} <span className="text-muted-foreground">· {o.room.capacity} seats</span>
                    </button>
                  </li>
                ))}
                {options.length === 0 && <li className="text-sm text-muted-foreground">No room is free at this time with enough seats.</li>}
              </ul>
              <ReasonField value={reason} onChange={setReason} optional />
              <EmailPreview email={preview} />
              <div className="flex gap-2">
                <Button disabled={busy || !chosen} onClick={() => run({ action: 'offer_room', roomId: chosen?.id, reason: reason.trim() }, `Another room suggested to ${organisation.name}.`)}>
                  Offer {chosen ? chosen.name : 'a room'}
                </Button>
                <Button variant="outline" onClick={() => setMode(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {(mode === 'changes' || mode === 'decline' || mode === 'cancel') && (
            <div className="grid gap-3 rounded-lg border border-border p-3">
              <h3 className="font-semibold">{mode === 'changes' ? 'Ask for changes' : mode === 'decline' ? 'Decline this request' : 'Cancel this booking'}</h3>
              <ReasonField value={reason} onChange={setReason} />
              <EmailPreview email={preview} />
              <div className="flex gap-2">
                <Button
                  disabled={busy || !reasonOk}
                  onClick={() =>
                    run(
                      { action: mode === 'changes' ? 'request_changes' : mode === 'decline' ? 'reject' : 'cancel', reason: reason.trim() },
                      mode === 'changes' ? 'Changes requested. The club has been emailed.' : mode === 'decline' ? 'Declined. The club has been emailed.' : 'Booking cancelled.',
                    )
                  }
                >
                  {mode === 'changes' ? 'Ask for changes' : mode === 'decline' ? 'Decline request' : 'Cancel booking'}
                </Button>
                <Button variant="outline" onClick={() => setMode(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {mode === 'override' && (
            <div className="grid gap-3 rounded-lg border border-border p-3">
              <h3 className="font-semibold">Override and confirm</h3>
              <ul className="text-sm">
                {blockers
                  .filter((b) => b.kind === 'booked')
                  .map((b) => (
                    <li key={b.item.id}>This replaces {b.item.request?.eventName}. Its club and office are emailed.</li>
                  ))}
              </ul>
              <ReasonField value={reason} onChange={setReason} />
              <EmailPreview email={overridePreview} />
              <div className="flex gap-2">
                <Button disabled={busy || !reasonOk} onClick={() => run({ action: 'override_confirm', reason: reason.trim() }, 'Booking confirmed. The displaced club has been emailed.')}>
                  Override and confirm
                </Button>
                <Button variant="outline" onClick={() => setMode(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-1.5 border-t border-border pt-3">
            <Label htmlFor="note">{note0}</Label>
            <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || note.trim().length === 0}
              onClick={async () => {
                const r = await postJson(`/requests/${request.id}/actions`, { action: 'note', reason: note.trim() })
                if (r.success) {
                  toast.success('Note added.')
                  setNote('')
                  onDone()
                } else toast.error(r.error ?? 'Could not add the note.')
              }}
            >
              Add note
            </Button>
          </div>
        </section>
      )}

      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold">More details: room timeline, free rooms and the club record</summary>
        <div className="mt-3 grid gap-4">
      <section aria-label="Room on this day" className="grid gap-1.5">
            <h3 className="text-sm font-semibold">
              {formatVenue(room)} on {formatDate(request.date)}
            </h3>
            <RoomTimeline blocks={detail.roomDay} highlightId={request.id} />
          </section>

          {detail.alternatives.length > 0 && mode === null && request.status !== 'confirmed' && (
            <section aria-label="Free at the same time" className="grid gap-1.5">
              <h3 className="text-sm font-semibold">Free at the same time</h3>
              <ul className="grid gap-1.5">
                {detail.alternatives.map((a) => (
                  <li key={a.room.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                    <span>
                      <span className="font-medium">{formatVenue(a.room)}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {a.room.capacity} seats{a.competing > 0 ? ` · ${a.competing} other request waiting` : ''}
                      </span>
                    </span>
                    {act('offer_room')?.enabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOfferRoom(a.room.id)
                          void openOffer()
                        }}
                      >
                        Offer
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      </details>

      <section aria-label="History">
        <button type="button" className="text-sm font-semibold underline" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
          History ({detail.logs.length})
        </button>
        {showHistory && (
          <ol className="mt-2 grid gap-2">
            {detail.logs.map((log) => (
              <li key={log.id} className={cn('border-l-2 pl-3 text-sm', log.internal ? 'border-amber-400' : 'border-border')}>
                <p>
                  <span className="font-medium">{log.actorRole === 'system' ? 'System' : log.actorRole === 'organisation' ? organisation.name : log.actorRole === 'superadmin' ? 'Super admin' : label(log.actorRole)}</span>{' '}
                  {log.action.replace(/_/g, ' ')}
                  {log.internal ? ' (internal)' : ''}
                </p>
                {log.reason && <p className="text-muted-foreground">{log.reason}</p>}
                <p className="text-xs text-muted-foreground">
                  {log.actorEmail} · {formatTimestamp(log.at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}

function ReasonField({ value, onChange, optional = false }: { value: string; onChange: (v: string) => void; optional?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="reason">Reason{optional ? ' (optional)' : ''}</Label>
      <Textarea id="reason" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      {!optional && <p className="text-xs text-muted-foreground">At least {MIN_REASON} characters. The club sees this.</p>}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((chip) => (
          <Button key={chip} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange(value.trim() ? `${value.trim()} ${chip}.` : `${chip}.`)}>
            {chip}
          </Button>
        ))}
      </div>
    </div>
  )
}
