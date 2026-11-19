'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { RoomChoice, RoomsResult } from '../_server/bridge'
import type { ApprovalPath, CategoryId, NewRequestInput } from '../types'
import { formatDay, formatTime } from '../utils'
import { describeDay, MiniTimeline } from './mini-timeline'
import { Panel, Tag } from './panel'
import { PathPreview } from './path-preview'

interface Values {
  eventName: string
  category: CategoryId
  date: string
  from: string
  to: string
  seats: string
  needs: string[]
  building: string
  description: string
}

interface RoomFinderProps {
  today: string
  defaultDate: string
  initial: Partial<Values> | null
  /** Set when this resubmits a request that was not approved. */
  resubmitOf: string | null
}

const CATEGORIES: Array<{ id: CategoryId; label: string }> = [
  { id: 'extracurricular', label: 'Club or society event' },
  { id: 'academic_society', label: 'Academic society event' },
  { id: 'performing_arts', label: 'Performing arts' },
  { id: 'other', label: 'Something else' },
]
const EQUIPMENT = ['Projector', 'Mic', 'Stage', 'Whiteboard']
const ALL = 'all'

function toMin(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Find a space and ask for it on one screen. Say when, how many and what you need, see which rooms are free,
 * pick one, name the event and send. The approval path for your club is shown before you send.
 */
export function RoomFinder({ today, defaultDate, initial, resubmitOf }: RoomFinderProps) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [v, setV] = useState<Values>({ eventName: '', category: 'extracurricular', date: defaultDate, from: '18:00', to: '20:00', seats: '40', needs: [], building: ALL, description: '', ...initial })
  const [onlyFree, setOnlyFree] = useState(true)
  const [result, setResult] = useState<RoomsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryRooms, setRetryRooms] = useState(0)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [path, setPath] = useState<ApprovalPath | null>(null)
  const [pathLoading, setPathLoading] = useState(false)
  const [pathError, setPathError] = useState<string | null>(null)
  const [retryPath, setRetryPath] = useState(0)
  const [errors, setErrors] = useState<{ eventName?: string; room?: string }>({})
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setV((prev) => ({ ...prev, [key]: value }))
  const from = toMin(v.from)
  const to = toMin(v.to)
  const seats = Number(v.seats)
  const windowOk = Boolean(v.date) && v.date >= today && from !== null && to !== null && to > from && Number.isInteger(seats) && seats >= 1

  // The rooms that suit this time. Old results stay on screen, dimmed, while new ones load.
  useEffect(() => {
    if (!windowOk || from === null || to === null) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const q = new URLSearchParams({ date: v.date, from: String(from), to: String(to), seats: String(seats) })
        if (v.needs.length) q.set('needs', v.needs.join(','))
        if (v.building !== ALL) q.set('building', v.building)
        const res = await fetch(`/api/student/rooms?${q.toString()}`, { signal: controller.signal })
        const body = (await res.json()) as { success: boolean; data?: RoomsResult; error?: string }
        if (body.success && body.data) setResult(body.data)
        else setLoadError(body.error ?? 'Rooms could not be loaded.')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setLoadError('Rooms could not be loaded. Check your connection.')
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [windowOk, v.date, from, to, seats, v.needs, v.building, retryRooms])

  const picked = useMemo(() => result?.rooms.find((r) => r.id === pickedId) ?? null, [result, pickedId])
  // A room stops being picked when a change makes it unavailable.
  useEffect(() => {
    if (result && pickedId && !result.rooms.some((r) => r.id === pickedId && r.free)) setPickedId(null)
  }, [result, pickedId])

  // The approval path for this club and event type.
  useEffect(() => {
    if (!picked || from === null || to === null) {
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
          body: JSON.stringify({ venueId: picked.id, category: v.category, date: v.date, startMin: from, endMin: to, needsAv: v.needs.includes('Projector') || v.needs.includes('Mic'), guestSpeaker: false }),
        })
        const body = (await res.json()) as { success: boolean; data?: ApprovalPath; error?: string }
        if (body.success && body.data) setPath(body.data)
        else setPathError(body.error ?? 'The approval path could not be loaded.')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setPathError('The approval path could not be loaded. Check your connection.')
      } finally {
        setPathLoading(false)
      }
    }, 150)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [picked, v.category, v.date, from, to, v.needs, retryPath])

  const groups = useMemo(() => {
    const rows = (result?.rooms ?? []).filter((r) => (onlyFree ? r.free : true)).sort((a, b) => Number(b.free) - Number(a.free))
    const map = new Map<string, RoomChoice[]>()
    for (const r of rows) map.set(r.building, [...(map.get(r.building) ?? []), r])
    return [...map.entries()]
  }, [result, onlyFree])

  function pick(room: RoomChoice) {
    setPickedId(room.id)
    setErrors((e) => ({ ...e, room: undefined }))
  }

  async function send() {
    const found: typeof errors = {}
    if (v.eventName.trim().length < 3) found.eventName = 'Name the event, at least 3 letters.'
    if (!picked) found.room = 'Pick a room from the list.'
    setErrors(found)
    if (found.eventName) nameRef.current?.focus()
    if (Object.keys(found).length > 0 || !picked || from === null || to === null) return

    setSending(true)
    setSendError(null)
    const input: NewRequestInput = {
      eventName: v.eventName.trim(),
      description: v.description.trim(),
      category: v.category,
      venueId: picked.id,
      date: v.date,
      startMin: from,
      endMin: to,
      attendance: seats,
      needsAv: v.needs.includes('Projector') || v.needs.includes('Mic'),
      guestSpeaker: false,
    }
    try {
      const res = await fetch(resubmitOf ? `/api/student/requests/${resubmitOf}/resubmit` : '/api/student/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
      const body = (await res.json()) as { success: boolean; error?: string; data?: { request: { id: string } } }
      if (!body.success || !body.data) {
        setSendError(body.error ?? 'The request was not sent.')
        setSending(false)
        return
      }
      router.push(`/student/requests/${body.data.request.id}`)
    } catch {
      setSendError('The request could not be sent. Check your connection.')
      setSending(false)
    }
  }

  const windowLabel = from !== null && to !== null ? `${formatTime(from)} to ${formatTime(to)}` : ''
  const fade = reduce ? { initial: false as const } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.16, ease: 'easeOut' as const } }

  return (
    <div className="grid gap-4">
      <header>
        <h1>{resubmitOf ? 'Edit and resubmit' : 'Find a space'}</h1>
        <p className="text-sm text-muted-foreground">Say when and how many. Pick a free room, name the event and send it. You see every office it goes through before you send.</p>
      </header>

      <section aria-label="When and how many" className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Date
          <Input type="date" min={today} value={v.date} onChange={(e) => set('date', e.target.value)} className="h-9 text-foreground" aria-invalid={v.date !== '' && v.date < today ? true : undefined} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <Input type="time" value={v.from} onChange={(e) => set('from', e.target.value)} className="h-9 text-foreground" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          To
          <Input type="time" value={v.to} onChange={(e) => set('to', e.target.value)} className="h-9 text-foreground" aria-invalid={from !== null && to !== null && to <= from ? true : undefined} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          People
          <Input type="number" inputMode="numeric" min={1} value={v.seats} onChange={(e) => set('seats', e.target.value)} className="h-9 text-foreground" />
        </label>
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span id="building-label">Building</span>
          <Select value={v.building} onValueChange={(b) => set('building', b)}>
            <SelectTrigger className="h-9 w-full text-foreground" aria-labelledby="building-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any building</SelectItem>
              {(result?.buildings ?? []).map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="col-span-2 grid gap-1 md:col-span-3 xl:col-span-1">
          <legend className="text-xs text-muted-foreground">Needs</legend>
          <div className="flex flex-wrap gap-1">
            {EQUIPMENT.map((e) => {
              const on = v.needs.includes(e)
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('needs', on ? v.needs.filter((n) => n !== e) : [...v.needs, e])}
                  className={cn('inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors duration-150', on ? 'border-primary bg-primary text-white' : 'border-border bg-background text-foreground hover:bg-accent')}
                >
                  {on && <Check className="h-3 w-3" aria-hidden="true" />}
                  {e}
                </button>
              )
            })}
          </div>
        </fieldset>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] xl:items-start">
        <Panel
          id="results-title"
          className="min-w-0"
          title={!windowOk ? 'Rooms' : result ? `${result.freeCount} of ${result.total} rooms are free` : 'Looking for rooms'}
          description={windowOk ? `${windowLabel} on ${formatDay(v.date)}` : 'Choose a date and a time to see what is free.'}
          action={
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#87281b]" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
              Free rooms only
            </label>
          }
          footer={
            <>
              <span>Grey is a class, dark is another booking, green is your time.</span>
              <span>Scroll to see more</span>
            </>
          }
        >
          {!windowOk ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Choose a date that has not passed, a start before the end, and how many people. The free rooms appear here.</p>
          ) : loadError ? (
            <div role="alert" className="grid gap-2 rounded-lg border border-red-300 bg-[#fdecea] p-4 text-[#b3261e]">
              <p>{loadError}</p>
              <div>
                <Button variant="outline" size="sm" onClick={() => setRetryRooms((n) => n + 1)}>
                  Try again
                </Button>
              </div>
            </div>
          ) : !result ? (
            <div aria-busy="true" className="grid gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="grid gap-2 rounded-lg border border-dashed border-border p-8 text-center">
              <p className="font-medium">No free room fits.</p>
              <p className="text-sm text-muted-foreground">Try fewer people, fewer needs, another building or another time.</p>
              {onlyFree && (
                <div>
                  <Button variant="outline" size="sm" onClick={() => setOnlyFree(false)}>
                    Show booked rooms too
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className={cn('grid gap-3 transition-opacity duration-150', loading && 'opacity-60')} aria-busy={loading}>
              {groups.map(([building, rooms], gi) => (
                <details key={building} open={gi === 0 || rooms.some((r) => r.id === pickedId)} className="group overflow-hidden rounded-xl border border-border bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                    <span className="font-semibold">
                      {building} <span className="font-normal text-muted-foreground">{rooms.length} rooms</span>
                    </span>
                    <span className="text-sm text-[#1d6b3f]">{rooms.filter((r) => r.free).length} free</span>
                  </summary>
                  <ul className="divide-y divide-border border-t border-border">
                    {rooms.map((room) => {
                      const isPicked = room.id === pickedId
                      const clash = room.blocks.find((b) => from !== null && to !== null && b.startMin < to && b.endMin > from)
                      return (
                        <li key={room.id} className={cn('grid gap-2 px-3 py-2.5 transition-colors duration-150 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4', isPicked && 'bg-primary/5')}>
                          <div className="min-w-0">
                            <p className="font-medium">
                              {room.floor ? `${room.floor} · ` : ''}
                              {room.name}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                              <span>Seats {room.capacity}</span>
                              {room.features.slice(0, 3).map((f) => (
                                <Tag key={f}>{f}</Tag>
                              ))}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <MiniTimeline blocks={room.blocks} from={from ?? 0} to={to ?? 0} label={`${room.name}: ${describeDay(room.blocks)}`} />
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{room.free ? describeDay(room.blocks) : `Not free: ${clash ? `${clash.kind === 'class' ? clash.label : 'Booked'}, ${formatTime(clash.startMin)} to ${formatTime(clash.endMin)}` : 'in use'}`}</p>
                          </div>
                          <div>
                            {room.free ? (
                              <Button size="sm" variant={isPicked ? 'secondary' : 'default'} aria-pressed={isPicked} onClick={() => pick(room)} className="min-w-24">
                                {isPicked ? (
                                  <>
                                    <Check className="h-4 w-4" aria-hidden="true" /> Picked
                                  </>
                                ) : (
                                  'Pick room'
                                )}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">In use</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </Panel>

        <aside ref={panelRef} aria-labelledby="panel-title" className="grid gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm xl:sticky xl:top-4">
          <header>
            <h2 id="panel-title">Your request</h2>
            <p className="text-sm text-muted-foreground">Name it, check the path, send it.</p>
          </header>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={picked?.id ?? 'none'} {...fade} className="grid gap-1 rounded-xl border border-dashed border-border bg-muted/50 p-3 text-sm">
              {picked ? (
                <>
                  <p className="font-semibold">{picked.label}</p>
                  <p className="text-muted-foreground">
                    {formatDay(v.date)}, {windowLabel} · {seats} people · seats {picked.capacity}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">No room picked yet. Pick one from the list.</p>
              )}
            </motion.div>
          </AnimatePresence>
          {errors.room && <p className="text-sm text-[#b3261e]">{errors.room}</p>}

          <label className="grid gap-1 text-sm font-medium">
            Event name
            <Input ref={nameRef} value={v.eventName} onChange={(e) => set('eventName', e.target.value)} autoComplete="off" aria-invalid={errors.eventName ? true : undefined} aria-describedby={errors.eventName ? 'name-error' : undefined} />
            {errors.eventName && (
              <span id="name-error" className="text-sm font-normal text-[#b3261e]">
                {errors.eventName}
              </span>
            )}
          </label>
          <div className="grid gap-1 text-sm font-medium">
            <span id="type-label">Event type</span>
            <Select value={v.category} onValueChange={(c) => set('category', c as CategoryId)}>
              <SelectTrigger className="w-full" aria-labelledby="type-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Anything the offices should know (optional)
            <Textarea value={v.description} onChange={(e) => set('description', e.target.value)} rows={3} />
          </label>

          <section aria-labelledby="path-title" className="grid gap-2 border-t border-border pt-3">
            <h3 id="path-title">It goes to</h3>
            <PathPreview path={path} loading={pathLoading} error={pathError} onRetry={() => setRetryPath((n) => n + 1)} />
          </section>

          {sendError && <p role="alert" className="text-sm text-[#b3261e]">{sendError} Nothing was sent. Your answers are still here.</p>}
          <Button onClick={send} disabled={sending} aria-busy={sending} className="w-full">
            {sending ? 'Sending request' : sendError ? 'Try sending again' : 'Send request'}
          </Button>
        </aside>
      </div>

      <AnimatePresence>
        {picked && (
          <motion.div
            {...(reduce ? { initial: false as const } : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 16 }, transition: { duration: 0.16, ease: 'easeOut' as const } })}
            className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-2 xl:hidden"
          >
            <p className="min-w-0 truncate text-sm">
              <strong>{picked.name}</strong> · {windowLabel}
            </p>
            <Button
              size="sm"
              onClick={() => {
                panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                window.setTimeout(() => nameRef.current?.focus(), 250)
              }}
            >
              Add details
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
