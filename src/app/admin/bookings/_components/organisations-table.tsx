'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OrganisationStats } from '../types'
import { formatTimestamp } from '../utils'

export interface OrganisationRow extends OrganisationStats {
  authorityLabel: string
  mostUsedRoomLabel: string
}

type SortKey = 'name' | 'authority' | 'requests' | 'confirmed' | 'rejected' | 'cancellations' | 'displaced' | 'autoApproved' | 'last'

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'name', label: 'Organisation' },
  { key: 'authority', label: 'Governing authority' },
  { key: 'requests', label: 'Requests', numeric: true },
  { key: 'confirmed', label: 'Confirmed', numeric: true },
  { key: 'rejected', label: 'Rejected', numeric: true },
  { key: 'cancellations', label: 'Cancelled', numeric: true },
  { key: 'displaced', label: 'Displaced', numeric: true },
  { key: 'autoApproved', label: 'Auto-approved', numeric: true },
  { key: 'last', label: 'Last request' },
]

function valueOf(row: OrganisationRow, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return row.organisation.name
    case 'authority':
      return row.authorityLabel
    case 'last':
      return row.lastRequestAt ?? ''
    default:
      return row[key]
  }
}

export function OrganisationsTable({ rows }: { rows: OrganisationRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'requests', dir: 'desc' })

  const sorted = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      const av = valueOf(a, sort.key)
      const bv = valueOf(b, sort.key)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return list
  }, [rows, sort])

  function toggle(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className={c.numeric ? 'text-right' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => toggle(c.key)}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
                  </button>
                </TableHead>
              ))}
              <TableHead>Most used room</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.organisation.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/bookings/requests?tab=all&organisationId=${row.organisation.id}`} className="hover:underline">
                    {row.organisation.name}
                  </Link>
                </TableCell>
                <TableCell>{row.authorityLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{row.requests}</TableCell>
                <TableCell className="text-right tabular-nums">{row.confirmed}</TableCell>
                <TableCell className="text-right tabular-nums">{row.rejected}</TableCell>
                <TableCell className="text-right tabular-nums">{row.cancellations}</TableCell>
                <TableCell className="text-right tabular-nums">{row.displaced}</TableCell>
                <TableCell className="text-right tabular-nums">{row.autoApproved}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{row.lastRequestAt ? formatTimestamp(row.lastRequestAt) : 'None'}</TableCell>
                <TableCell className="whitespace-nowrap">{row.mostUsedRoomLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {sorted.map((row) => (
          <li key={row.organisation.id}>
            <Link
              href={`/admin/bookings/requests?tab=all&organisationId=${row.organisation.id}`}
              className="block rounded-lg border border-border bg-card p-3 hover:bg-accent/40"
            >
              <p className="font-medium">{row.organisation.name}</p>
              <p className="text-xs text-muted-foreground">{row.authorityLabel}</p>
              <p className="mt-2 text-sm">
                {row.requests} requests · {row.confirmed} confirmed · {row.rejected} rejected
              </p>
              <p className="text-xs text-muted-foreground">
                {row.cancellations} cancelled · {row.displaced} displaced · {row.autoApproved} auto-approved
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
