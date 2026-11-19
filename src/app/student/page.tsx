import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DoorOpen, Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ACCENT, Panel, Tray } from './_components/panel'
import { StatusChip } from './_components/status-chip'
import { resolveStudent } from './_server/actor'
import { getStudentService } from './_server/student'
import { groupRequests, type GroupId, type RequestGroup } from './logic/groups'
import type { RequestListRow } from './types'
import { formatDay, formatInstant, formatTime } from './utils'

export const dynamic = 'force-dynamic'

type Tab = 'overview' | 'attention' | 'approved' | 'closed'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'approved', label: 'Approved' },
  { id: 'closed', label: 'Closed' },
]
const TAB_GROUPS: Record<Exclude<Tab, 'overview'>, GroupId[]> = { attention: ['taking_longer', 'pending', 'drafts'], approved: ['approved_upcoming'], closed: ['past'] }

function greeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function Item({ row }: { row: RequestListRow }) {
  const { request, status, currentRole } = row
  return (
    <li>
      <Link
        href={`/student/requests/${request.id}`}
        className={cn('grid gap-1 rounded-lg border border-l-[3px] border-border bg-background px-3 py-2.5 text-foreground no-underline transition-colors duration-150 hover:bg-accent/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4', ACCENT[status.tone])}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{request.eventName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {request.venueLabel} · {formatDay(request.date)}, {formatTime(request.startMin)} to {formatTime(request.endMin)}
          </span>
          {currentRole && status.stored === 'pending' && <span className="block truncate text-xs text-muted-foreground">With {currentRole}</span>}
        </span>
        <span>
          <StatusChip status={status} />
        </span>
      </Link>
    </li>
  )
}

function GroupList({ groups, empty }: { groups: RequestGroup[]; empty: string }) {
  if (groups.length === 0) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <Tray>
      {groups.map((g) => (
        <div key={g.id} className="grid gap-1.5">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.title} <span className="font-normal">{g.rows.length}</span>
          </h3>
          <ul className="grid gap-1.5">
            {g.rows.map((row) => (
              <Item key={row.request.id} row={row} />
            ))}
          </ul>
        </div>
      ))}
    </Tray>
  )
}

export default async function YourRequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await resolveStudent()
  if (!actor) redirect('/unauthorized')
  const { tab: tabParam } = await searchParams
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'overview'
  const service = await getStudentService()
  const rows = await service.listMine(actor)
  const groups = groupRequests(rows, service.today())
  const only = (ids: GroupId[]) => groups.filter((g) => ids.includes(g.id))
  const count = (ids: GroupId[]) => only(ids).reduce((n, g) => n + g.rows.length, 0)
  const now = service.now()
  const hour = new Date(now.getTime() + 330 * 60_000).getUTCHours()
  const next = groups.find((g) => g.id === 'approved_upcoming')?.rows[0]

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <h1>
            {greeting(hour)}, {actor.organisationName.replace(/\s*\(sample\)\s*$/i, '')}
          </h1>
          <nav aria-label="Views" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={t.id === 'overview' ? '/student' : `/student?tab=${t.id}`}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn('inline-flex h-8 items-center rounded-full px-3.5 text-sm no-underline transition-colors duration-150', tab === t.id ? 'bg-foreground text-background' : 'bg-background text-foreground ring-1 ring-border hover:bg-accent')}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link href="/student/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New request
        </Link>
      </header>

      {rows.length === 0 ? (
        <Panel id="empty" title="You have not asked for a space yet" description="Say when and how many people. You see the free rooms, pick one, and see every office your request goes through before you send it.">
          <div>
            <Link href="/student/new" className={buttonVariants()}>
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
              Find a space
            </Link>
          </div>
        </Panel>
      ) : tab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            id="attention"
            title="Needs attention"
            description="Waiting on an office."
            action={
              <Link href="/student?tab=attention" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                View all
              </Link>
            }
            footer={<span>{count(TAB_GROUPS.attention)} open</span>}
          >
            <GroupList groups={only(TAB_GROUPS.attention)} empty="Nothing is waiting. Every request has an answer." />
          </Panel>
          <div className="grid content-start gap-4">
            <Panel
              id="coming-up"
              title="Approved and coming up"
              description="These spaces are yours."
              action={
                <Link href="/student?tab=approved" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  View all
                </Link>
              }
              footer={next ? <span>Next event on {formatDay(next.request.date)}, {formatTime(next.request.startMin)}</span> : <span>No approved events yet</span>}
            >
              <GroupList groups={only(TAB_GROUPS.approved)} empty="Approved requests appear here." />
            </Panel>
            <Panel
              id="closed"
              title="Closed"
              description="Not approved, cancelled or finished."
              action={
                <Link href="/student?tab=closed" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  View all
                </Link>
              }
              footer={<span>Updated {formatInstant(now.toISOString())}</span>}
            >
              <GroupList groups={only(TAB_GROUPS.closed)} empty="Nothing closed yet." />
            </Panel>
          </div>
        </div>
      ) : (
        <Panel id="tab-panel" title={TABS.find((t) => t.id === tab)?.label ?? ''} description={`${count(TAB_GROUPS[tab as Exclude<Tab, 'overview'>])} requests`} footer={<span>Updated {formatInstant(now.toISOString())}</span>}>
          <GroupList groups={only(TAB_GROUPS[tab as Exclude<Tab, 'overview'>])} empty="Nothing here yet." />
        </Panel>
      )}
    </div>
  )
}
