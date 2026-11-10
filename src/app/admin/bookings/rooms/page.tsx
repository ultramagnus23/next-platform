import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OrgChip } from '../_components/badges'
import { BookingsPageHeader } from '../_components/page-header'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/service'
import type { RoomBoardItem } from '../types'
import { formatDate, formatMinutes } from '../utils'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function RoomCard({ item }: { item: RoomBoardItem }) {
  const { room, now, next } = item
  return (
    <Link
      href={`/admin/bookings/rooms/${room.id}`}
      className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{room.name}</p>
          <p className="text-xs text-muted-foreground">
            {room.capacity} seats{room.features.length > 0 ? ` · ${room.features.join(', ')}` : ''}
          </p>
        </div>
        {item.conflictToday && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Conflict
          </span>
        )}
      </div>
      <div className="mt-2 min-h-10 text-sm">
        {now ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950/50 dark:text-red-200">In use</span>
            <OrgChip code={now.organisationCode} colour={now.organisationColour} />
            <span className="truncate">{now.eventName}</span>
            <span className="text-xs text-muted-foreground">until {formatMinutes(now.endMin)}</span>
          </div>
        ) : (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
            Free now
          </span>
        )}
        {next && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Next {formatMinutes(next.startMin)}
            <OrgChip code={next.organisationCode} colour={next.organisationColour} />
            {next.eventName}
          </p>
        )}
      </div>
      <div className="mt-2" aria-label={`${item.utilisationPercent}% booked today`}>
        <div className="h-1.5 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.min(item.utilisationPercent, 100)}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.utilisationPercent}% booked today{item.pendingToday > 0 ? ` · ${item.pendingToday} pending` : ''}
        </p>
      </div>
    </Link>
  )
}

export default async function RoomsBoardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const params = await searchParams
  const freeOnly = params.free === '1'
  const board = await getBookingService().getRoomsBoard(actor)

  const items = freeOnly ? board.items.filter((i) => i.now === null) : board.items
  const buildings = [...new Set(board.items.map((i) => i.room.building))].sort()

  return (
    <>
      <BookingsPageHeader
        title="Rooms"
        subheading={`${formatDate(board.today)}. Who holds each room now, and what is next.`}
        crumbs={[{ label: 'Rooms' }]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {buildings.map((b) => (
          <a key={b} href={`#${b}`} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent">
            {b}
          </a>
        ))}
        <Link
          href={freeOnly ? '?' : '?free=1'}
          className={cn('ml-auto rounded-md border px-3 py-1 text-sm', freeOnly ? 'border-primary bg-primary text-white' : 'border-border hover:bg-accent')}
          aria-pressed={freeOnly}
        >
          Free now only
        </Link>
      </div>

      {buildings.map((building) => {
        const inBuilding = items.filter((i) => i.room.building === building)
        if (inBuilding.length === 0) return null
        const floors = [...new Set(inBuilding.map((i) => i.room.floor))]
        return (
          <section key={building} id={building} aria-label={building} className="grid scroll-mt-20 gap-3">
            <h2 className="text-lg font-semibold">{building}</h2>
            {floors.map((floor) => (
              <div key={floor} className="grid gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">{floor} floor</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {inBuilding
                    .filter((i) => i.room.floor === floor)
                    .map((item) => (
                      <RoomCard key={item.room.id} item={item} />
                    ))}
                </div>
              </div>
            ))}
          </section>
        )
      })}
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm">No room is free right now.</p>
      )}
    </>
  )
}
