'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { LANE_TEXT } from '../data'
import type { BulkResult, InboxData, InboxRow, InboxTab, Lane, RequestDetail } from '../types'
import { formatCompactRange, formatDate } from '../utils'
import { RequestPane } from './request-pane'
import { postJson, useUndoToast } from './use-booking-action'

const LANES: Lane[] = ['clash', 'look', 'clear']
const SHOW_FIRST = 8
const ONBOARD_KEY = 'booking-onboarding-v1'
const SNOOZE_KEY = 'booking-snoozed-v1'

const CHIP_TONE: Record<Lane, string> = {
  clash: 'bg-[#fdecea] text-[#b3261e] border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800',
  look: 'bg-[#fff1cf] text-[#7a4b00] border-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-700',
  clear: 'bg-[#e4f2e9] text-[#1d6b3f] border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800',
}

const TABS: Array<{ id: InboxTab; label: string }> = [
  { id: 'review', label: 'To review' },
  { id: 'changes', label: 'Changes needed' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
]

const SHORTCUTS: Array<[string, string]> = [
  ['J / K', 'Next or previous request'],
  ['A', 'Approve the open request'],
  ['O', 'Suggest another room'],
  ['R', 'Ask the club for changes'],
  ['D', 'Decline'],
  ['S', 'Snooze until tomorrow'],
  ['/', 'Search'],
  ['?', 'Show this list'],
]

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return desktop
}

function readSnoozed(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

interface InboxViewProps {
  data: InboxData
  detail: RequestDetail | null
  selectedId: string | null
  lane: Lane | undefined
  q: string
  demo: boolean
  officeName: string
  nextOffice: string
}

export function InboxView({ data, detail, selectedId, lane, q, demo, officeName, nextOffice }: InboxViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const undoToast = useUndoToast()
  const isDesktop = useIsDesktop()
  const [expanded, setExpanded] = useState<Record<Lane, boolean>>({ clash: false, look: false, clear: false })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState(q)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [onboard, setOnboard] = useState(false)
  const [snoozed, setSnoozed] = useState<Record<string, number>>({})
  const [showSnoozed, setShowSnoozed] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      setOnboard(window.localStorage.getItem(ONBOARD_KEY) !== 'done')
    } catch {
      setOnboard(true)
    }
    setSnoozed(readSnoozed())
  }, [])

  const nowMs = Date.now()
  const isSnoozed = (id: string) => (snoozed[id] ?? 0) > nowMs
  const rows = useMemo(() => (showSnoozed ? data.rows : data.rows.filter((r) => !((snoozed[r.request.id] ?? 0) > nowMs))), [data.rows, snoozed, showSnoozed, nowMs])
  const snoozedCount = data.rows.filter((r) => isSnoozed(r.request.id)).length

  const grouped = useMemo(() => {
    const out: Record<Lane, InboxRow[]> = { clash: [], look: [], clear: [] }
    for (const r of rows) out[r.lane].push(r)
    return out
  }, [rows])

  const visible = useMemo(() => {
    if (data.tab !== 'review') return rows
    const list: InboxRow[] = []
    for (const l of LANES) list.push(...(expanded[l] ? grouped[l] : grouped[l].slice(0, SHOW_FIRST)))
    return list
  }, [data.tab, rows, grouped, expanded])

  const go = useCallback(
    (patch: { r?: string | null; lane?: Lane | null; q?: string | null; page?: number | null; tab?: InboxTab | null }) => {
      const params = new URLSearchParams()
      const next = {
        tab: patch.tab === undefined ? (data.tab === 'review' ? undefined : data.tab) : (patch.tab && patch.tab !== 'review' ? patch.tab : undefined),
        lane: patch.lane === undefined ? lane : (patch.lane ?? undefined),
        q: patch.q === undefined ? q : (patch.q ?? undefined),
        r: patch.r === undefined ? selectedId : (patch.r ?? undefined),
        page: patch.page === undefined ? (data.page > 1 ? data.page : undefined) : (patch.page ?? undefined),
      }
      for (const [k, v] of Object.entries(next)) if (v) params.set(k, String(v))
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
    },
    [router, pathname, lane, q, selectedId, data.page, data.tab],
  )

  useEffect(() => {
    if (query === q) return
    const t = setTimeout(() => go({ q: query || null, r: null, page: null }), 300)
    return () => clearTimeout(t)
  }, [query, q, go])

  const snooze = useCallback(
    (id: string) => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(8, 0, 0, 0)
      const next = { ...readSnoozed(), [id]: tomorrow.getTime() }
      try {
        window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(next))
      } catch {
        /* snooze lasts for this visit only */
      }
      setSnoozed(next)
      const idx = visible.findIndex((r) => r.request.id === id)
      const after = visible[idx + 1] ?? visible[idx - 1]
      toast('Snoozed until tomorrow morning.')
      go({ r: after && after.request.id !== id ? after.request.id : null })
    },
    [visible, go],
  )

  // J and K move, / searches, ? shows the list, S snoozes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const idx = visible.findIndex((r) => r.request.id === selectedId)
      if (k === 'j') {
        const next = visible[idx + 1] ?? visible[0]
        if (next) go({ r: next.request.id })
      } else if (k === 'k') {
        const prev = visible[idx - 1] ?? visible[visible.length - 1]
        if (prev) go({ r: prev.request.id })
      } else if (k === '/') searchRef.current?.focus()
      else if (e.key === '?') setShowHelp(true)
      else if (k === 's' && selectedId && data.tab === 'review') snooze(selectedId)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, selectedId, go, snooze, data.tab])

  const onDone = useCallback(() => {
    const idx = visible.findIndex((r) => r.request.id === selectedId)
    const next = visible[idx + 1] ?? visible[idx - 1]
    setSheetOpen(false)
    go({ r: next && next.request.id !== selectedId ? next.request.id : null })
    router.refresh()
  }, [visible, selectedId, go, router])

  async function approveAllClear() {
    const items = grouped.clear.map((r) => ({ id: r.request.id, version: r.request.version }))
    if (items.length === 0) return
    setBulkBusy(true)
    const result = await postJson<BulkResult>('/bulk/approve', { items })
    setBulkBusy(false)
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Could not approve.')
      return
    }
    const { approved, skipped, batchId } = result.data
    const why = skipped.length > 0 ? `, ${skipped.length} skipped because they changed` : ''
    undoToast(`${approved.length} requests approved and sent to ${nextOffice}. Clubs have been emailed${why}.`, batchId)
    go({ r: null })
    router.refresh()
  }

  function dismissOnboarding() {
    setOnboard(false)
    try {
      window.localStorage.setItem(ONBOARD_KEY, 'done')
    } catch {
      /* it will show again next visit */
    }
  }

  const rowButton = (row: InboxRow) => {
    const selected = row.request.id === selectedId
    return (
      <li key={row.request.id}>
        <button
          type="button"
          aria-current={selected}
          onClick={() => {
            go({ r: row.request.id })
            setSheetOpen(true)
          }}
          className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left', selected ? 'bg-primary/10' : 'hover:bg-accent/50', isSnoozed(row.request.id) && 'opacity-50')}
        >
          <span className="min-w-0">
            <span className={cn('block truncate text-sm', selected ? 'font-semibold' : 'font-medium')}>{row.request.eventName}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.organisationName} · {row.roomLabel} · {formatDate(row.request.date)}, {formatCompactRange(row.request.startMin, row.request.endMin)}
            </span>
          </span>
          <span
            className={cn(
              'whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
              data.tab !== 'review' ? 'border-border bg-muted' : row.overdueDays > 0 && row.lane === 'clear' ? CHIP_TONE.look : CHIP_TONE[row.lane],
            )}
          >
            {row.chip}
          </span>
        </button>
      </li>
    )
  }

  const list = (
    <div className="grid min-w-0 content-start gap-5">
      {data.tab === 'review' && data.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show only">
          {[
            { id: null, label: 'All', count: data.counts.clash + data.counts.look + data.counts.clear },
            { id: 'clash' as Lane, label: 'Clashes', count: data.counts.clash },
            { id: 'look' as Lane, label: 'Needs a look', count: data.counts.look },
            { id: 'clear' as Lane, label: 'Clear', count: data.counts.clear },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={(lane ?? null) === p.id}
              onClick={() => go({ lane: p.id, r: null, page: null })}
              className={cn('rounded-full border px-3 py-1 text-xs', (lane ?? null) === p.id ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')}
            >
              {p.label} {p.count}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">{data.tab === 'review' ? 'Nothing waiting on you.' : 'Nothing here yet.'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.tab === 'review'
              ? data.elsewhere > 0
                ? `${data.elsewhere} requests you approved are with other offices.`
                : 'New requests for your office appear here.'
              : 'Requests will show up here as they move.'}
          </p>
        </div>
      )}

      {data.tab === 'review'
        ? LANES.map((l) => {
            const laneRows = grouped[l]
            if (laneRows.length === 0) return null
            const shown = expanded[l] ? laneRows : laneRows.slice(0, SHOW_FIRST)
            return (
              <section key={l} aria-label={LANE_TEXT[l].title} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2>
                      {LANE_TEXT[l].title} <span className="font-normal text-muted-foreground tabular-nums">{laneRows.length}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground">{LANE_TEXT[l].blurb}</p>
                  </div>
                  {l === 'clear' && (
                    <Button size="sm" className="bg-[#1d6b3f] text-white hover:bg-[#175a34]" disabled={bulkBusy} onClick={approveAllClear}>
                      {bulkBusy ? 'Approving…' : `Approve all ${laneRows.length}`}
                    </Button>
                  )}
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{shown.map(rowButton)}</ul>
                {laneRows.length > SHOW_FIRST && (
                  <button type="button" className="justify-self-start text-sm underline" onClick={() => setExpanded((e) => ({ ...e, [l]: !e[l] }))}>
                    {expanded[l] ? 'Show fewer' : `Show ${laneRows.length - SHOW_FIRST} more`}
                  </button>
                )}
              </section>
            )
          })
        : rows.length > 0 && <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{rows.map(rowButton)}</ul>}

      {snoozedCount > 0 && (
        <button type="button" className="justify-self-start text-sm underline" onClick={() => setShowSnoozed((v) => !v)}>
          {showSnoozed ? 'Hide snoozed' : `${snoozedCount} snoozed until tomorrow. Show`}
        </button>
      )}

      {data.total > data.pageSize && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.page} of {Math.ceil(data.total / data.pageSize)}
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => go({ page: data.page - 1, r: null })}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={data.page * data.pageSize >= data.total} onClick={() => go({ page: data.page + 1, r: null })}>
              Next
            </Button>
          </span>
        </nav>
      )}
      {data.tab === 'review' && data.elsewhere > 0 && (
        <p className="text-sm text-muted-foreground">
          {data.elsewhere} more you approved {data.elsewhere === 1 ? 'is' : 'are'} waiting on {nextOffice}.{' '}
          <a className="underline" href="/admin/bookings/calendar?status=pending">
            See them
          </a>
        </p>
      )}
    </div>
  )

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Inbox</h1>
          <p className="text-sm text-muted-foreground">{data.summary}</p>
        </div>
        <button type="button" className="text-sm underline" onClick={() => setShowHelp(true)}>
          Keyboard shortcuts
        </button>
      </header>

      {onboard && (
        <section aria-label="How this works" className="rounded-xl border border-border bg-card p-4">
          <h2>New here? Three things to know</h2>
          <ol className="mt-2 grid gap-1.5 text-sm">
            <li>
              <strong>1. Requests are sorted for you.</strong> Clashes need a decision. Needs a look has a warning. Clear means there is nothing to check.
            </li>
            <li>
              <strong>2. Approve the Clear ones together.</strong> For the rest, open the request and pick what to do. If a room will not work, suggest another one.
            </li>
            <li>
              <strong>3. You can undo.</strong> Every decision can be undone for 10 seconds. The club is emailed for you.
            </li>
          </ol>
          <Button size="sm" className="mt-3" onClick={dismissOnboarding}>
            Got it
          </Button>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Inbox sections" className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={data.tab === t.id}
              onClick={() => go({ tab: t.id, r: null, lane: null, page: null })}
              className={cn('-mb-px border-b-2 px-3 py-2 text-sm', data.tab === t.id ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {t.label} <span className="tabular-nums text-muted-foreground">{data.tabCounts[t.id]}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto block w-full max-w-xs">
          <span className="sr-only">Search</span>
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,500px)]">
        {list}
        {isDesktop && (
          <aside aria-label="Request details" className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            <div className="rounded-xl border border-border bg-card p-4">
              {detail ? <RequestPane detail={detail} demo={demo} onDone={onDone} /> : <p className="text-sm text-muted-foreground">Choose a request on the left to see it here.</p>}
            </div>
          </aside>
        )}
      </div>

      {!isDesktop && (
        <Sheet open={sheetOpen && detail !== null} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader>
              <SheetTitle className="sr-only">{detail?.request.eventName ?? 'Request'}</SheetTitle>
              <SheetDescription className="sr-only">Request details and actions for {officeName}.</SheetDescription>
            </SheetHeader>
            <div className="p-4">{detail && <RequestPane detail={detail} demo={demo} onDone={onDone} />}</div>
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Work through the Inbox without the mouse.</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-1.5 text-sm">
            {SHORTCUTS.map(([key, what]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <dt>{what}</dt>
                <dd>
                  <kbd className="rounded border border-border px-1.5 py-0.5 text-xs">{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  )
}
