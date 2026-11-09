'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { QUICK_REASONS } from '../data'
import {
  cancelledEmails,
  changesRequestedEmails,
  displacedEmails,
  finalApprovalEmails,
  rejectedEmails,
  type MailContext,
} from '../_server/engine/notifications'
import type { Authority, BookingRequest, EmailDraft, Organisation, Room } from '../types'
import { formatDate, formatRange, formatVenue } from '../utils'

const MIN_REASON = 10
const NONE = 'none'

export function EmailPreview({ email, title = 'Email the organisation will receive' }: { email: EmailDraft | undefined; title?: string }) {
  if (!email) return null
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 font-medium">{email.subject}</p>
      <p className="text-xs text-muted-foreground">
        To: {email.to.join(', ')}
        {email.cc.length > 0 ? ` · Cc: ${email.cc.join(', ')}` : ''}
      </p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">{email.text}</pre>
    </div>
  )
}

/* ---------------- Reject, request changes, cancel ---------------- */

export type ReasonMode = 'reject' | 'request_changes' | 'cancel'

const COPY: Record<ReasonMode, { title: string; description: string; confirm: string }> = {
  reject: {
    title: 'Reject this request',
    description: 'The organisation gets an email with your reason. This closes the request.',
    confirm: 'Reject request',
  },
  request_changes: {
    title: 'Request changes',
    description: 'The request goes back to the organisation. They can update it and resubmit.',
    confirm: 'Request changes',
  },
  cancel: {
    title: 'Cancel this booking',
    description: 'The slot is released and the organisation gets an email with your reason.',
    confirm: 'Cancel booking',
  },
}

interface ReasonDialogProps {
  mode: ReasonMode | null
  onClose: () => void
  onConfirm: (mode: ReasonMode, reason: string, alternativeRoomId: string | null) => Promise<void>
  pending: boolean
  mail: MailContext
  alternatives: Room[]
  /** Reasons offered as chips, with the priority advice first when there is one. */
  suggestedReasons?: string[]
}

export function ReasonDialog({ mode, onClose, onConfirm, pending, mail, alternatives, suggestedReasons = [] }: ReasonDialogProps) {
  const [reason, setReason] = useState('')
  const [alternativeId, setAlternativeId] = useState<string>(NONE)

  useEffect(() => {
    if (mode) {
      setReason('')
      setAlternativeId(NONE)
    }
  }, [mode])

  const alternative = alternatives.find((r) => r.id === alternativeId) ?? null
  const email = useMemo(() => {
    if (!mode) return undefined
    const text = reason.trim() || '(your reason)'
    if (mode === 'reject') return rejectedEmails(mail, text, alternative)[0]
    if (mode === 'request_changes') return changesRequestedEmails(mail, text, alternative)[0]
    return cancelledEmails(mail, text)[0]
  }, [mode, reason, alternative, mail])

  if (!mode) return null
  const copy = COPY[mode]
  const tooShort = reason.trim().length < MIN_REASON
  const chips = [...suggestedReasons, ...QUICK_REASONS]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="reason-help"
            />
            <p id="reason-help" className={tooShort && reason.length > 0 ? 'text-xs text-red-700' : 'text-xs text-muted-foreground'}>
              At least {MIN_REASON} characters. The organisation sees this.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <Button
                  key={chip}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setReason((prev) => (prev.trim() ? `${prev.trim()} ${chip}.` : `${chip}.`))}
                >
                  {chip}
                </Button>
              ))}
            </div>
          </div>
          {mode !== 'cancel' && (
            <div className="grid gap-1.5">
              <Label htmlFor="alt-room">Suggest an alternative room (optional)</Label>
              <Select value={alternativeId} onValueChange={setAlternativeId}>
                <SelectTrigger id="alt-room">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No suggestion</SelectItem>
                  {alternatives.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {formatVenue(room)} ({room.capacity} seats)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {alternatives.length === 0 && (
                <p className="text-xs text-muted-foreground">No other room is free at this time with enough seats.</p>
              )}
            </div>
          )}
          <EmailPreview email={email} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep as it is
          </Button>
          <Button
            onClick={() => onConfirm(mode, reason.trim(), alternativeId === NONE ? null : alternativeId)}
            disabled={pending || tooShort}
          >
            {pending ? 'Working…' : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Override ---------------- */

interface OverrideDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
  pending: boolean
  mail: MailContext
  blocking: BookingRequest[]
  organisations: Organisation[]
  authorities: Authority[]
}

export function OverrideDialog({ open, onClose, onConfirm, pending, mail, blocking, organisations }: OverrideDialogProps) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const text = reason.trim() || '(your reason)'
  const emails = useMemo(() => {
    const out: Array<{ label: string; email: EmailDraft | undefined }> = []
    const updated: BookingRequest = { ...mail.request, status: 'confirmed' }
    out.push({ label: `Confirmation to ${mail.organisation.name}`, email: finalApprovalEmails({ ...mail, request: updated })[0] })
    for (const b of blocking) {
      const org = organisations.find((o) => o.id === b.organisationId)
      if (!org) continue
      out.push({
        label: `Displaced booking, to ${org.name} and its authority`,
        email: displacedEmails({ ...mail, request: { ...b, status: 'displaced' }, organisation: org }, text, mail.request.eventName)[0],
      })
    }
    return out
  }, [mail, blocking, organisations, text])

  const tooShort = reason.trim().length < MIN_REASON

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Override and confirm</DialogTitle>
          <DialogDescription>
            This confirms the request and displaces the booking{blocking.length === 1 ? '' : 's'} below. The displaced
            organisations are emailed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ul className="grid gap-2" aria-label="Bookings that will be displaced">
            {blocking.map((b) => (
              <li key={b.id} className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
                <p className="font-medium">{b.eventName}</p>
                <p className="text-xs">
                  {organisations.find((o) => o.id === b.organisationId)?.name ?? b.organisationId} · {formatDate(b.date)},{' '}
                  {formatRange(b.startMin, b.endMin)}
                </p>
              </li>
            ))}
          </ul>
          <div className="grid gap-1.5">
            <Label htmlFor="override-reason">Reason</Label>
            <Textarea id="override-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">At least {MIN_REASON} characters. The displaced organisations see this.</p>
          </div>
          {emails.map((item) => (
            <EmailPreview key={item.label} email={item.email} title={item.label} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep the existing booking
          </Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={pending || tooShort}>
            {pending ? 'Working…' : 'Override and confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Simulated resubmission (demo) ---------------- */

interface ResubmitDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (roomId: string | null) => Promise<void>
  pending: boolean
  currentRoomId: string
  rooms: Room[]
  suggestedRoomIds: string[]
}

export function ResubmitDialog({ open, onClose, onConfirm, pending, currentRoomId, rooms, suggestedRoomIds }: ResubmitDialogProps) {
  const [roomId, setRoomId] = useState(currentRoomId)
  useEffect(() => {
    if (open) setRoomId(suggestedRoomIds[0] ?? currentRoomId)
  }, [open, currentRoomId, suggestedRoomIds])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simulate resubmission</DialogTitle>
          <DialogDescription>
            Acts as the organisation. Changing the room restarts the request at the first approval stage.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="resubmit-room">Room</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger id="resubmit-room">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {formatVenue(room)} ({room.capacity} seats){room.id === currentRoomId ? ' · current' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(roomId === currentRoomId ? null : roomId)} disabled={pending}>
            {pending ? 'Working…' : 'Resubmit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
