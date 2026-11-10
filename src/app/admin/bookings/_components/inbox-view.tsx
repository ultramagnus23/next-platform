'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { LANE_TEXT } from '../data'
import type { BulkResult, InboxData, InboxRow, Lane, RequestDetail } from '../types'
import { formatCompactRange, formatDate } from '../utils'
import { RequestPane } from './request-pane'
import { postJson, useUndoToast } from './use-booking-action'

const LANES: Lane[] = ['clash', 'look', 'clear']
const SHOW_FIRST = 10

const CHIP_TONE: Record<Lane, string> = {
  clash: 'bg-[#fdecea] text-[#b3261e] border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800',
  look: 'bg-[#fff1cf] text-[#7a4b00] border-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-700',
  clear: 'bg-[#e4f2e9] text-[#1d6b3f] border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800',
}

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
  const searchRef = useRef<HTMLInputElement>(null)

  const grouped = useMemo(() => {
    const out: Record<Lane, InboxRow[]> = { clash: [], look: [], clear: [] }
    for (const r of data.rows) out[r.lane].push(r)
    return out
  }, [data.rows])

  const visible = useMemo(() => {
    const list: InboxRow[] = []
    for (const l of LANES) list.push(...(expanded[l] ? grouped[l] : grouped[l].slice(0, SHOW_FIRST)))
    return list
  }, [grouped, expanded])

  const go = useCallback(
    (patch: { r?: string | null; lane?: Lane | null; q?: string | null; page?: number | null }) => {
      const params = new URLSearchParams()
      const next = {
        lane: patch.lane === undefined ? lane : (patch.lane ?? undefined),
        q: patch.q === undefined ? q : (patch.q ?? undefined),
        r: patch.r === undefined ? selectedId : (patch.r ?? undefined),
        page: patch.page === undefined ? (data.page > 1 ? data.page : undefined) : (patch.page ?? undefined),
      }
      for (const [k, v] of Object.entries(next)) if (v) params.set(k, String(v))
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
    },
    [router, pathname, lane, q, selectedId, data.page],
  )

  // Debounced search.
  useEffect(() => {
    if (query === q) return
    const t = setTimeout(() => go({ q: query || null, r: null, page: null }), 300)
    return () => clearTimeout(t)
  }, [query, q, go])

  // J and K move through the list, / focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const idx = visible.findIndex((r) => r.request.id === selectedId)
      if (e.key.toLowerCase() === 'j') {
        const next = visible[idx + 1] ?? visible[0]
        if (next) go({ r: next.request.id })
      } else if (e.key.toLowerCase() === 'k') {
        const prev = visible[idx - 1] ?? visible[visible.length - 1]
        if (prev) go({ r: prev.request.id })
      } else if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, selectedId, go])

  // After a decision, select the next row automatically.
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

  const pills: Array<{ id: Lane | null; label: string; count: number }> = [
    { id: null, label: 'All', count: data.counts.clash + data.counts.look + data.counts.clear },
    { id: 'clash', label: 'Clashes', count: data.counts.clash },
    { id: 'look', label: 'Needs a look', count: data.counts.look },
    { id: 'clear', label: 'Clear', count: data.counts.clear },
  ]

  const list = (
    <div className="grid min-w-0 content-start gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by lane">
        {pills.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={(lane ?? null) === p.id}
            onClick={() => go({ lane: p.id, r: null, page: null })}
            className={cn('rounded-full border px-3 py-1 text-sm', (lane ?? null) === p.id ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')}
          >
            {p.label} <span className="tabular-nums">{p.count}</span>
          </button>
        ))}
      </div>

      {data.rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">Nothing waiting on you.</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.elsewhere > 0 ? `${data.elsewhere} requests you passed on are with other offices.` : 'New requests for your office appear here.'}</p>
        </div>
      )}

      {LANES.map((l) => {
        const rows = grouped[l]
        if (rows.length === 0) return null
        const shown = expanded[l] ? rows : rows.slice(0, SHOW_FIRST)
        return (
          <section key={l} aria-label={LANE_TEXT[l].title} className="grid gap-1">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">
                  {LANE_TEXT[l].title} <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{LANE_TEXT[l].blurb}</p>
              </div>
              {l === 'clear' && (
                <Button size="sm" className="bg-[#1d6b3f] text-white hover:bg-[#175a34]" disabled={bulkBusy} onClick={approveAllClear}>
                  {bulkBusy ? 'Approving…' : `Approve all ${rows.length}`}
                </Button>
              )}
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {shown.map((row) => {
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
                      className={cn('grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left', selected ? 'bg-primary/10 font-semibold' : 'hover:bg-accent/50')}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{row.request.eventName}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {row.organisationName} · {row.categoryLabel}
                        </span>
                      </span>
                      <span className="min-w-0 text-xs font-normal">
                        <span className="block truncate">{row.roomLabel}</span>
                        <span className="block truncate text-muted-foreground">
                          {formatDate(row.request.date)}, {formatCompactRange(row.request.startMin, row.request.endMin)}
                        </span>
                      </span>
                      <span className={cn('whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', row.overdueDays > 0 && row.lane === 'clear' ? CHIP_TONE.look : CHIP_TONE[row.lane])}>{row.chip}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {rows.length > SHOW_FIRST && (
              <button type="button" className="justify-self-start text-sm underline" onClick={() => setExpanded((e) => ({ ...e, [l]: !e[l] }))}>
                {expanded[l] ? 'Show fewer' : `Show ${rows.length - SHOW_FIRST} more`}
              </button>
            )}
          </section>
        )
      })}

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
      {data.elsewhere > 0 && (
        <p className="text-sm text-muted-foreground">
          {data.elsewhere} more request{data.elsewhere === 1 ? '' : 's'} you approved {data.elsewhere === 1 ? 'is' : 'are'} waiting on {nextOffice}.
        </p>
      )}
    </div>
  )

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">{data.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block w-full max-w-md">
            <span className="sr-only">Search the inbox</span>
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by event, club, room or BK number…"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm"
            />
          </label>
          <p className="hidden text-xs text-muted-foreground md:block">
            <kbd className="rounded border border-border px-1">J</kbd> <kbd className="rounded border border-border px-1">K</kbd> move ·{' '}
            <kbd className="rounded border border-border px-1">A</kbd> approve · <kbd className="rounded border border-border px-1">O</kbd> offer room ·{' '}
            <kbd className="rounded border border-border px-1">C</kbd> changes · <kbd className="rounded border border-border px-1">D</kbd> decline
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(460px,1fr)_minmax(420px,520px)]">
        {list}
        {isDesktop && (
          <aside aria-label="Request details" className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            <div className="rounded-xl border border-border bg-card p-4">
              {detail ? <RequestPane detail={detail} demo={demo} onDone={onDone} /> : <p className="text-sm text-muted-foreground">Choose a request to see its details.</p>}
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
    </div>
  )
}
