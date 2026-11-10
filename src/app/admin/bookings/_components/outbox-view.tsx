'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { NotificationTrigger, OutboxEmail } from '../types'
import { formatTimestamp } from '../utils'

const ALL = 'all'

export const TRIGGER_LABELS: Record<NotificationTrigger, string> = {
  request_submitted: 'Submitted',
  request_forwarded: 'Forwarded',
  request_confirmed: 'Confirmed',
  request_rejected: 'Declined or cancelled',
  changes_requested: 'Changes needed',
  room_offered: 'Room offered',
  offer_lapsed: 'Offer ended',
  clash_detected: 'Clash',
  booking_displaced: 'Booking replaced',
  request_expired: 'Expired',
  auto_approved: 'Auto-approved',
  step_overdue: 'Overdue',
  step_escalated: 'Escalated, no decision',
  weekly_digest: 'Weekly summary',
}

interface OutboxViewProps {
  emails: OutboxEmail[]
  trigger?: string
  requestId?: string
}

export function OutboxView({ emails, trigger, requestId }: OutboxViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState<OutboxEmail | null>(null)

  function setTrigger(value: string) {
    const params = new URLSearchParams()
    if (value !== ALL) params.set('trigger', value)
    if (requestId) params.set('requestId', requestId)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="grid gap-4">
      <p
        role="status"
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      >
        Simulated. Nothing has been sent.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="o-trigger" className="text-xs text-muted-foreground">
            Trigger
          </Label>
          <Select value={trigger ?? ALL} onValueChange={setTrigger}>
            <SelectTrigger id="o-trigger" className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {requestId && (
          <p className="text-sm">
            Showing emails for <span className="font-mono">{requestId}</span>.{' '}
            <Link href="/admin/bookings/outbox" className="underline">
              Show all
            </Link>
          </p>
        )}
      </div>

      {emails.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">No emails to show.</p>
          <p className="mt-1 text-sm text-muted-foreground">Emails appear here as requests move through approval.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email) => (
                  <TableRow key={email.id} className="cursor-pointer" onClick={() => setOpen(email)}>
                    <TableCell className="whitespace-nowrap text-xs">{formatTimestamp(email.at)}</TableCell>
                    <TableCell>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">{TRIGGER_LABELS[email.trigger]}</span>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-xs">{email.to.join(', ')}</TableCell>
                    <TableCell className="min-w-64">
                      <button type="button" className="text-left hover:underline" onClick={() => setOpen(email)}>
                        {email.subject}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/bookings/requests/${email.requestId}`}
                        className="font-mono text-xs hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {email.requestId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{email.status === 'failed' ? email.failReason ?? 'Cancelled' : 'Simulated'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="grid gap-2 md:hidden">
            {emails.map((email) => (
              <li key={email.id}>
                <button
                  type="button"
                  onClick={() => setOpen(email)}
                  className="block w-full rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/40"
                >
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">{TRIGGER_LABELS[email.trigger]}</span>
                  <p className="mt-1 text-sm font-medium">{email.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(email.at)} · To {email.to.join(', ')}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.subject}</SheetTitle>
                <SheetDescription>Simulated. Nothing has been sent.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3 px-4 pb-6 text-sm">
                <dl className="grid gap-1 text-xs text-muted-foreground">
                  <div>
                    <dt className="inline font-medium">To: </dt>
                    <dd className="inline">{open.to.join(', ')}</dd>
                  </div>
                  {open.cc.length > 0 && (
                    <div>
                      <dt className="inline font-medium">Cc: </dt>
                      <dd className="inline">{open.cc.join(', ')}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline font-medium">Time: </dt>
                    <dd className="inline">{formatTimestamp(open.at)}</dd>
                  </div>
                </dl>
                <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-sans text-sm leading-relaxed">
                  {open.text}
                </pre>
                <Link href={`/admin/bookings/requests/${open.requestId}`} className="text-sm underline">
                  Open request {open.requestId}
                </Link>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
