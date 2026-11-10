'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { QueueGroup, QueueRow } from '../types'
import { formatDate, formatRange } from '../utils'
import { CategoryBadge, ConflictBadge, FlagBadge, OrgChip, TierChip } from './badges'
import { postJson, STALE_MESSAGE } from './use-booking-action'

function whenLabel(days: number): string {
  if (days < 0) return 'Past'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

function QueueLine({ row }: { row: QueueRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const r = row.request

  async function approve() {
    setBusy(true)
    const result = await postJson(`/requests/${r.id}/actions`, { action: 'approve', version: r.version })
    setBusy(false)
    if (result.success) {
      toast.success(`${r.eventName}: done.`)
      router.refresh()
      return
    }
    const stale = result.error?.startsWith('This request changed')
    toast.error(stale ? STALE_MESSAGE : (result.error ?? 'Something went wrong.'))
    if (stale) router.refresh()
  }

  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link href={`/admin/bookings/requests/${r.id}`} className="font-medium hover:underline">
          {r.eventName}
        </Link>
        <p className="text-sm text-muted-foreground">
          {row.roomLabel} · {formatDate(r.date)}, {formatRange(r.startMin, r.endMin)} · {r.expectedAttendance} people
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <FlagBadge tone={row.daysAway <= 1 ? 'warn' : 'neutral'}>{whenLabel(row.daysAway)}</FlagBadge>
          <CategoryBadge label={row.categoryLabel} />
          <TierChip tier={row.tier} />
          <ConflictBadge count={row.conflictCount} />
          {row.warnings.includes('over_capacity') && <FlagBadge tone="warn">Over capacity</FlagBadge>}
          {row.warnings.includes('outside_room_hours') && <FlagBadge tone="warn">Outside room hours</FlagBadge>}
          {row.warnings.includes('short_notice') && <FlagBadge>Short notice</FlagBadge>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {row.canQuickApprove && (
          <Button size="sm" onClick={approve} disabled={busy}>
            {busy ? 'Working…' : row.approveLabel.replace('Approve and forward to ', 'Forward to ')}
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/bookings/requests/${r.id}`}>{row.canQuickApprove ? 'Review' : 'Review and decide'}</Link>
        </Button>
      </div>
    </li>
  )
}

export function QueueView({ groups }: { groups: QueueGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="font-medium">Nothing waiting on you.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          New requests for your office show up here, grouped by organisation.
        </p>
      </div>
    )
  }
  return (
    <ul className="grid gap-3">
      {groups.map((group, index) => {
        const hasConflict = group.rows.some((r) => r.conflictCount > 0)
        const first = group.rows[0]
        return (
          <li key={group.organisation.id}>
            <details open={index < 4} className="group rounded-lg border border-border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                <OrgChip code={group.organisation.code} colour={group.organisation.colour} name={group.organisation.name} />
                <span className="text-sm text-muted-foreground">
                  {group.rows.length} waiting{first ? `, first on ${formatDate(first.request.date)}` : ''}
                </span>
                {hasConflict && <ConflictBadge count={group.rows.filter((r) => r.conflictCount > 0).length} />}
                <Link
                  href={`/admin/bookings/organisations/${group.organisation.code.toLowerCase()}`}
                  className="ml-auto text-sm underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  All {group.organisation.code} bookings
                </Link>
              </summary>
              <ul className="divide-y divide-border border-t border-border px-3">
                {group.rows.map((row) => (
                  <QueueLine key={row.request.id} row={row} />
                ))}
              </ul>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
