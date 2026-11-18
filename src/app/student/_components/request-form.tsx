'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApprovalPath, CategoryId, NewRequestInput } from '../types'
import { AV_HOURS } from '../data'
import { formatDay, formatTime } from '../utils'
import { PathPreview } from './path-preview'

export interface VenueOption {
  id: string
  label: string
  capacity: number | null
  /** The office that decides, from the route table, or null when not confirmed. */
  owner: string | null
}

interface FormValues {
  eventName: string
  category: CategoryId
  venueId: string
  date: string
  start: string
  end: string
  attendance: string
  needsAv: boolean
  guestSpeaker: boolean
  description: string
}

interface RequestFormProps {
  venues: VenueOption[]
  today: string
  initial: Partial<FormValues> | null
  /** Set when this resubmits a request that was not approved. */
  resubmitOf: string | null
}

const STEPS = ['What and when', 'Approval path', 'Details', 'Review and send'] as const
const NEXT_LABEL = ['See the approval path', 'Continue to details', 'Review your request'] as const
const DRAFT_KEY = 'student-request-draft-v1'
const CATEGORIES: Array<{ id: CategoryId; label: string }> = [
  { id: 'extracurricular', label: 'Extra-curricular event' },
  { id: 'academic_society', label: 'Academic society event' },
  { id: 'performing_arts', label: 'Performing arts' },
  { id: 'other', label: 'Something else' },
]

const EMPTY: FormValues = { eventName: '', category: 'extracurricular', venueId: '', date: '', start: '18:00', end: '20:00', attendance: '', needsAv: false, guestSpeaker: false, description: '' }

function toMin(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function validate(step: number, v: FormValues, venues: VenueOption[], today: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (step === 0) {
    if (v.eventName.trim().length < 3) e.eventName = 'Give the event a name of at least 3 letters.'
    if (!v.venueId) e.venueId = 'Choose a space.'
    if (!v.date) e.date = 'Choose a date.'
    else if (v.date < today) e.date = 'Choose a date that has not passed.'
    const s = toMin(v.start)
    const en = toMin(v.end)
    if (s === null) e.start = 'Enter a start time.'
    if (en === null) e.end = 'Enter an end time.'
    if (s !== null && en !== null && en <= s) e.end = 'The event must end after it starts.'
  }
  if (step === 2) {
    const n = Number(v.attendance)
    const venue = venues.find((x) => x.id === v.venueId)
    if (!Number.isInteger(n) || n < 1) e.attendance = 'Enter how many people you expect.'
    else if (venue?.capacity != null && n > venue.capacity) e.attendance = `${venue.label} seats ${venue.capacity}. Choose a smaller number or another space.`
  }
  return e
}

function toInput(v: FormValues): NewRequestInput {
  return {
    eventName: v.eventName.trim(),
    description: v.description.trim(),
    category: v.category,
    venueId: v.venueId,
    date: v.date,
    startMin: toMin(v.start) ?? 0,
    endMin: toMin(v.end) ?? 0,
    attendance: Number(v.attendance),
    needsAv: v.needsAv,
    guestSpeaker: v.guestSpeaker,
  }
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-[var(--s-muted)]">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[var(--s-bad-fg)]">
          {error}
        </p>
      )}
    </div>
  )
}

const describedBy = (id: string, hint?: boolean, error?: string) => [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined

export function RequestForm({ venues, today, initial, resubmitOf }: RequestFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [v, setV] = useState<FormValues>({ ...EMPTY, ...initial })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [path, setPath] = useState<ApprovalPath | null>(null)
  const [pathLoading, setPathLoading] = useState(false)
  const [pathError, setPathError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState<string | null>(null)
  const [savedDraft, setSavedDraft] = useState<Partial<FormValues> | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setV((prev) => ({ ...prev, [key]: value }))

  // A draft saved earlier on this device. Offered, never forced.
  useEffect(() => {
    if (initial) return
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (raw) setSavedDraft(JSON.parse(raw) as Partial<FormValues>)
    } catch {
      /* no draft */
    }
  }, [initial])

  // After a step change, move focus to the step heading so keyboard and screen reader users land at the top.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  // The live approval path. Rebuilt a moment after any change that affects it.
  const startMin = toMin(v.start)
  const endMin = toMin(v.end)
  useEffect(() => {
    if (!v.venueId || !v.date || startMin === null || endMin === null || endMin <= startMin) {
      setPath(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setPathLoading(true)
      setPathError(null)
      try {
        const res = await fetch('/api/student/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ venueId: v.venueId, category: v.category, date: v.date, startMin, endMin, needsAv: v.needsAv, guestSpeaker: v.guestSpeaker }),
        })
        const body = (await res.json()) as { success: boolean; data?: ApprovalPath; error?: string }
        if (body.success && body.data) setPath(body.data)
        else setPathError(body.error ?? 'The approval path could not be loaded.')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setPathError('The approval path could not be loaded. Check your connection.')
      } finally {
        setPathLoading(false)
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [v.venueId, v.category, v.date, startMin, endMin, v.needsAv, v.guestSpeaker, retry])

  const goNext = useCallback(() => {
    const found = validate(step, v, venues, today)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      window.requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }, [step, v, venues, today])

  function saveDraft() {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(v))
      setDraftNote('Draft saved on this device.')
    } catch {
      setDraftNote('The draft could not be saved. Your browser is blocking storage.')
    }
  }

  async function send() {
    const found = { ...validate(0, v, venues, today), ...validate(2, v, venues, today) }
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setStep(Object.keys(validate(0, v, venues, today)).length > 0 ? 0 : 2)
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(resubmitOf ? `/api/student/requests/${resubmitOf}/resubmit` : '/api/student/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toInput(v)),
      })
      const body = (await res.json()) as { success: boolean; error?: string; data?: { request: { id: string } } }
      if (!body.success || !body.data) {
        setSendError(body.error ?? 'The request was not sent.')
        setSending(false)
        return
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* nothing to clear */
      }
      router.push(`/student/requests/${body.data.request.id}`)
      return
    } catch {
      setSendError('The request could not be sent. Check your connection.')
    }
    setSending(false)
  }

  const venue = venues.find((x) => x.id === v.venueId)
  const errorList = Object.entries(errors)
  const fieldProps = (id: string) => ({ id, 'aria-invalid': errors[id] ? (true as const) : undefined, 'aria-describedby': describedBy(id, false, errors[id]) })

  return (
    <div className="grid gap-5">
      <header>
        <h1>{resubmitOf ? 'Edit and resubmit' : 'New request'}</h1>
        <p className="text-[var(--s-muted)]">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <ol className="mt-2 flex gap-1" aria-label="Steps">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? 'step' : undefined} className="h-1.5 flex-1 rounded-full" style={{ background: i <= step ? 'var(--s-ink)' : 'var(--s-line)' }}>
              <span className="sr-only">{name}</span>
            </li>
          ))}
        </ol>
      </header>

      {savedDraft && step === 0 && (
        <div className="grid gap-2 rounded-lg border border-[var(--s-line-strong)] p-3">
          <p>You have a draft saved on this device.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="s-btn s-btn--quiet"
              onClick={() => {
                setV({ ...EMPTY, ...savedDraft })
                setSavedDraft(null)
              }}
            >
              Continue the draft
            </button>
            <button type="button" className="s-btn s-btn--quiet" onClick={() => setSavedDraft(null)}>
              Start fresh
            </button>
          </div>
        </div>
      )}

      {errorList.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-[var(--s-bad-fg)] bg-[var(--s-bad-bg)] p-3 text-[var(--s-bad-fg)]">
          <p className="font-semibold">Fix {errorList.length === 1 ? 'this' : 'these'} to go on</p>
          <ul className="mt-1 grid gap-0.5">
            {errorList.map(([id, text]) => (
              <li key={id}>
                <a href={`#${id}`} data-plain className="underline">
                  {text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 ref={headingRef} tabIndex={-1} className="outline-none">
        {STEPS[step]}
      </h2>

      {step === 0 && (
        <div className="grid gap-5">
          <Field id="eventName" label="Event name" error={errors.eventName}>
            <input {...fieldProps('eventName')} className="s-field" value={v.eventName} onChange={(e) => set('eventName', e.target.value)} autoComplete="off" />
          </Field>
          <Field id="category" label="What kind of event is it?" hint="Academic societies go through the Office of Academic Affairs. Other events go through Student Life.">
            <select id="category" className="s-field" value={v.category} onChange={(e) => set('category', e.target.value as CategoryId)} aria-describedby="category-hint">
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <fieldset id="venueId" tabIndex={-1} className="grid gap-2 outline-none" aria-describedby={errors.venueId ? 'venueId-error' : undefined}>
            <legend className="mb-1 font-semibold">Space</legend>
            {venues.map((x) => (
              <label key={x.id} className="flex cursor-pointer gap-3 rounded-lg border border-[var(--s-line-strong)] p-3 has-[:checked]:border-[var(--s-accent)] has-[:checked]:bg-[var(--s-accent-bg)]">
                <input type="radio" name="venueId" value={x.id} checked={v.venueId === x.id} onChange={() => set('venueId', x.id)} className="mt-1 h-5 w-5 accent-[var(--s-accent)]" />
                <span>
                  <span className="block font-semibold">{x.label}</span>
                  <span className="block text-[0.8125rem] text-[var(--s-muted)]">
                    {x.capacity ? `Seats ${x.capacity}` : 'Capacity to confirm'} · IT and AV {formatTime(AV_HOURS.fromMin)} to {formatTime(AV_HOURS.toMin)} · Accessibility to confirm · {x.owner ? `Decided by ${x.owner}` : 'Office to confirm'}
                  </span>
                </span>
              </label>
            ))}
            {errors.venueId && (
              <p id="venueId-error" className="text-[var(--s-bad-fg)]">
                {errors.venueId}
              </p>
            )}
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="date" label="Date" error={errors.date}>
              <input {...fieldProps('date')} type="date" min={today} className="s-field" value={v.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field id="start" label="Starts" error={errors.start}>
              <input {...fieldProps('start')} type="time" className="s-field" value={v.start} onChange={(e) => set('start', e.target.value)} />
            </Field>
            <Field id="end" label="Ends" error={errors.end}>
              <input {...fieldProps('end')} type="time" className="s-field" value={v.end} onChange={(e) => set('end', e.target.value)} />
            </Field>
          </div>
          <p className="text-[0.8125rem] text-[var(--s-muted)]">Times are India time. The office checks the space is free before it approves.</p>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3">
          <p>These are the offices that decide, in order. It changes as you answer the next questions.</p>
          <PathPreview path={path} loading={pathLoading} error={pathError} onRetry={() => setRetry((n) => n + 1)} />
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5">
          <Field id="attendance" label="How many people are coming?" hint={venue?.capacity ? `${venue.label} seats ${venue.capacity}.` : undefined} error={errors.attendance}>
            <input {...fieldProps('attendance')} type="number" inputMode="numeric" min={1} className="s-field" value={v.attendance} onChange={(e) => set('attendance', e.target.value)} aria-describedby={describedBy('attendance', Boolean(venue?.capacity), errors.attendance)} />
          </Field>
          <fieldset className="grid gap-3">
            <legend className="mb-1 font-semibold">Does your event have any of these?</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--s-accent)]" checked={v.needsAv} onChange={(e) => set('needsAv', e.target.checked)} />
              <span>It needs IT or AV support (microphones, projector, sound)</span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--s-accent)]" checked={v.guestSpeaker} onChange={(e) => set('guestSpeaker', e.target.checked)} />
              <span>A guest speaker or performer from outside Ashoka</span>
            </label>
          </fieldset>
          <Field id="description" label="Anything the offices should know? (optional)">
            <textarea id="description" className="s-field min-h-28" value={v.description} onChange={(e) => set('description', e.target.value)} rows={4} />
          </Field>
          <section aria-labelledby="live-path" className="grid gap-2 border-t border-[var(--s-line)] pt-4">
            <h3 id="live-path">Your approval path right now</h3>
            <PathPreview path={path} loading={pathLoading} error={pathError} onRetry={() => setRetry((n) => n + 1)} />
          </section>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
            <dt className="text-[var(--s-muted)]">Event</dt>
            <dd>{v.eventName}</dd>
            <dt className="text-[var(--s-muted)]">Space</dt>
            <dd>{venue?.label}</dd>
            <dt className="text-[var(--s-muted)]">When</dt>
            <dd>
              {v.date ? formatDay(v.date) : ''}, {startMin !== null ? formatTime(startMin) : ''} to {endMin !== null ? formatTime(endMin) : ''}
            </dd>
            <dt className="text-[var(--s-muted)]">People</dt>
            <dd>{v.attendance}</dd>
            <dt className="text-[var(--s-muted)]">Extras</dt>
            <dd>{[v.needsAv ? 'IT or AV support' : '', v.guestSpeaker ? 'Guest speaker' : ''].filter(Boolean).join(', ') || 'None'}</dd>
          </dl>
          <section aria-labelledby="final-path" className="grid gap-2 border-t border-[var(--s-line)] pt-4">
            <h3 id="final-path">It goes to</h3>
            <PathPreview path={path} loading={pathLoading} error={pathError} onRetry={() => setRetry((n) => n + 1)} />
          </section>
          {sendError && (
            <p role="alert" className="text-[var(--s-bad-fg)]">
              {sendError} Nothing was sent. Your answers are still here.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--s-line)] pt-4">
        {step > 0 && (
          <button
            type="button"
            className="s-btn s-btn--quiet"
            onClick={() => {
              setErrors({})
              setStep((s) => s - 1)
            }}
            disabled={sending}
          >
            Back to {STEPS[step - 1]?.toLowerCase()}
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="s-btn" onClick={goNext}>
            {NEXT_LABEL[step]}
          </button>
        ) : (
          <button type="button" className="s-btn" onClick={send} aria-busy={sending} disabled={sending}>
            {sending ? 'Sending request' : sendError ? 'Try sending again' : 'Send request'}
          </button>
        )}
        <button type="button" className="s-btn s-btn--quiet sm:ml-auto" onClick={saveDraft}>
          Save draft
        </button>
      </div>
      <p aria-live="polite" className="text-[0.8125rem] text-[var(--s-muted)]">
        {draftNote}
      </p>
    </div>
  )
}
