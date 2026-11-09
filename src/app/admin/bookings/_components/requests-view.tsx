'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { STAGE_OPTIONS, STATUS_OPTIONS, TAB_LABELS } from '../data'
import type { CategoryId, RequestFilters, RequestRow, RequestTab } from '../types'
import { formatDate, formatRange } from '../utils'
import { CategoryBadge, ConflictBadge, StatusBadge, TierChip } from './badges'

export interface RequestFilterOptions {
  organisations: Array<{ id: string; name: string }>
  buildings: string[]
  rooms: Array<{ id: string; label: string }>
  categories: Array<{ id: CategoryId; label: string }>
}

interface RequestsViewProps {
  rows: RequestRow[]
  counts: Record<RequestTab, number>
  filters: RequestFilters
  options: RequestFilterOptions
}

const ALL = 'all'
const TABS: RequestTab[] = ['needs_action', 'others', 'confirmed', 'closed', 'all']

export function RequestsView({ rows, counts, filters, options }: RequestsViewProps) {
  const router = useRouter()
  const pathname = usePathname()

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams()
      const current: Record<string, string | undefined> = {
        tab: filters.tab,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        organisationId: filters.organisationId,
        building: filters.building,
        roomId: filters.roomId,
        category: filters.category,
        status: filters.status,
        stage: filters.stage,
        conflictsOnly: filters.conflictsOnly ? 'true' : undefined,
      }
      for (const [key, value] of Object.entries({ ...current, ...patch })) {
        if (value && value !== ALL) params.set(key, value)
      }
      router.replace(`${pathname}?${params.toString()}`)
    },
    [filters, pathname, router],
  )

  const dropdown = (
    id: string,
    label: string,
    value: string | undefined,
    items: Array<{ value: string; label: string }>,
    key: string,
  ) => (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ALL} onValueChange={(v) => update({ [key]: v })}>
        <SelectTrigger id={id} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={filters.tab} onValueChange={(tab) => update({ tab })}>
        <div className="overflow-x-auto">
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="gap-1.5">
                {TAB_LABELS[tab]}
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                  {counts[tab]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <section
        aria-label="Filters"
        className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-4 xl:grid-cols-8"
      >
        <div className="grid gap-1">
          <Label htmlFor="f-from" className="text-xs text-muted-foreground">
            From date
          </Label>
          <Input
            id="f-from"
            type="date"
            className="h-8"
            value={filters.dateFrom ?? ''}
            onChange={(e) => update({ dateFrom: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-to" className="text-xs text-muted-foreground">
            To date
          </Label>
          <Input
            id="f-to"
            type="date"
            className="h-8"
            value={filters.dateTo ?? ''}
            onChange={(e) => update({ dateTo: e.target.value || undefined })}
          />
        </div>
        {dropdown(
          'f-org',
          'Organisation',
          filters.organisationId,
          options.organisations.map((o) => ({ value: o.id, label: o.name })),
          'organisationId',
        )}
        {dropdown(
          'f-building',
          'Building',
          filters.building,
          options.buildings.map((b) => ({ value: b, label: b })),
          'building',
        )}
        {dropdown(
          'f-room',
          'Room',
          filters.roomId,
          options.rooms.map((r) => ({ value: r.id, label: r.label })),
          'roomId',
        )}
        {dropdown(
          'f-category',
          'Category',
          filters.category,
          options.categories.map((c) => ({ value: c.id, label: c.label })),
          'category',
        )}
        {dropdown('f-status', 'Status', filters.status, [...STATUS_OPTIONS], 'status')}
        {dropdown('f-stage', 'Stage', filters.stage, [...STAGE_OPTIONS], 'stage')}
        <div className="col-span-2 flex items-center gap-2 md:col-span-4 xl:col-span-8">
          <Checkbox
            id="f-conflicts"
            checked={filters.conflictsOnly === true}
            onCheckedChange={(checked) => update({ conflictsOnly: checked === true ? 'true' : undefined })}
          />
          <Label htmlFor="f-conflicts" className="text-sm">
            Conflicts only
          </Label>
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyState tab={filters.tab} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Conflict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.request.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/bookings/requests/${row.request.id}`)}
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs">{row.request.id}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.organisationName}</TableCell>
                    <TableCell className="min-w-44 font-medium">
                      <Link
                        href={`/admin/bookings/requests/${row.request.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.request.eventName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CategoryBadge label={row.categoryLabel} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.roomLabel}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.request.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatRange(row.request.startMin, row.request.endMin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.request.expectedAttendance}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.request.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{row.stageLabel}</TableCell>
                    <TableCell>
                      <TierChip tier={row.tier} />
                    </TableCell>
                    <TableCell>
                      <ConflictBadge count={row.conflictCount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <li key={row.request.id}>
                <Link
                  href={`/admin/bookings/requests/${row.request.id}`}
                  className="block rounded-lg border border-border bg-card p-3 hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{row.request.eventName}</p>
                    <StatusBadge status={row.request.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{row.organisationName}</p>
                  <p className="mt-2 text-sm">
                    {formatDate(row.request.date)}, {formatRange(row.request.startMin, row.request.endMin)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.roomLabel} · {row.request.expectedAttendance} people
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CategoryBadge label={row.categoryLabel} />
                    <TierChip tier={row.tier} />
                    <ConflictBadge count={row.conflictCount} />
                    {row.stageLabel && <span className="text-xs text-muted-foreground">{row.stageLabel}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function EmptyState({ tab }: { tab: RequestTab }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="font-medium">{tab === 'needs_action' ? 'Nothing waiting on you.' : 'No requests match these filters.'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {tab === 'needs_action' ? (
          <>
            See{' '}
            <Link href="/admin/bookings/requests?tab=all" className="underline">
              all requests
            </Link>
            .
          </>
        ) : (
          'Change or clear a filter to see more.'
        )}
      </p>
    </div>
  )
}
