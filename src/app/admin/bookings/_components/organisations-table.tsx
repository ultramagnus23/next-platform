'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OrgRow } from '../types'
import { formatTimestamp } from '../utils'

type SortKey = 'name' | 'kind' | 'office' | 'week' | 'bookings' | 'confirmed' | 'rejected' | 'lateCancels' | 'noShows' | 'displaced' | 'autoApproved' | 'last'

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'name', label: 'Organisation' },
  { key: 'kind', label: 'Type' },
  { key: 'office', label: 'Office' },
  { key: 'week', label: 'This week', numeric: true },
  { key: 'bookings', label: 'This semester', numeric: true },
  { key: 'confirmed', label: 'Confirmed', numeric: true },
  { key: 'rejected', label: 'Declined', numeric: true },
  { key: 'lateCancels', label: 'Late cancels', numeric: true },
  { key: 'noShows', label: 'No-shows', numeric: true },
  { key: 'displaced', label: 'Replaced', numeric: true },
  { key: 'autoApproved', label: 'Auto', numeric: true },
  { key: 'last', label: 'Last request' },
]

export interface OrgTableRow extends OrgRow {
  officeLabel: string
}

function valueOf(r: OrgTableRow, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return r.organisation.name
    case 'kind':
      return r.organisation.kind
    case 'office':
      return r.officeLabel
    case 'week':
      return r.standing.weekBookings
    case 'bookings':
      return r.standing.semester.bookings
    case 'confirmed':
      return r.standing.confirmed
    case 'rejected':
      return r.standing.rejected
    case 'lateCancels':
      return r.standing.semester.lateCancels
    case 'noShows':
      return r.standing.semester.noShows
    case 'displaced':
      return r.standing.displaced
    case 'autoApproved':
      return r.standing.autoApproved
    case 'last':
      return r.standing.lastRequestAt ?? ''
  }
}

export function OrganisationsTable({ rows }: { rows: OrgTableRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'noShows', dir: 'desc' })
  const [filter, setFilter] = useState('')

  const sorted = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = rows.filter((r) => !q || r.organisation.name.toLowerCase().includes(q))
    list.sort((a, b) => {
      const av = valueOf(a, sort.key)
      const bv = valueOf(b, sort.key)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return (sort.dir === 'asc' ? cmp : -cmp) || a.organisation.name.localeCompare(b.organisation.name)
    })
    return list
  }, [rows, sort, filter])

  const toggle = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'kind' || key === 'office' ? 'asc' : 'desc' }))

  return (
    <div className="grid gap-3">
      <Input type="search" autoComplete="off" placeholder="Filter by name…" aria-label="Filter organisations" className="max-w-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className={c.numeric ? 'text-right' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap font-medium" onClick={() => toggle(c.key)}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
                  </button>
                </TableHead>
              ))}
              <TableHead>Most used room</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.organisation.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/bookings?q=${encodeURIComponent(r.organisation.name)}`} className="hover:underline">
                    {r.organisation.name}
                  </Link>
                </TableCell>
                <TableCell className="capitalize">{r.organisation.kind}</TableCell>
                <TableCell>{r.officeLabel}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.standing.weekBookings}
                  {r.standing.weeklyCap ? ` / ${r.standing.weeklyCap}` : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.standing.semester.bookings}</TableCell>
                <TableCell className="text-right tabular-nums">{r.standing.confirmed}</TableCell>
                <TableCell className="text-right tabular-nums">{r.standing.rejected}</TableCell>
                <TableCell className="text-right tabular-nums">{r.standing.semester.lateCancels}</TableCell>
                <TableCell className="text-right tabular-nums">{r.standing.semester.noShows}</TableCell>
                <TableCell className="text-right tabular-nums">{r.standing.displaced}</TableCell>
                <TableCell className="text-right tabular-nums">{r.standing.autoApproved}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{r.standing.lastRequestAt ? formatTimestamp(r.standing.lastRequestAt) : 'None'}</TableCell>
                <TableCell className="whitespace-nowrap">{r.mostUsedRoom}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">No-shows, late cancels and the semester totals are mocked. Check-in is not tracked yet.</p>
    </div>
  )
}
