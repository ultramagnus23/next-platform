'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CategoryId } from '../types'
import { formatClock } from '../utils'
import { postJson } from './use-booking-action'

export const SIMULATE_EVENT = 'booking:simulate'

export interface SimulateOptions {
  organisations: Array<{ id: string; name: string }>
  rooms: Array<{ id: string; label: string; capacity: number }>
  categories: Array<{ id: CategoryId; label: string }>
  today: string
}

export interface SimulatePrefill {
  organisationId?: string
  roomId?: string
  date?: string
  startMin?: number
  endMin?: number
  category?: CategoryId
  eventName?: string
  expectedAttendance?: number
}

interface SimulateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: SimulateOptions
  prefill: SimulatePrefill | null
}

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Simulates an organisation submitting a request. Demo mode only. */
export function SimulateDialog({ open, onOpenChange, options, prefill }: SimulateDialogProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [organisationId, setOrganisationId] = useState(options.organisations[0]?.id ?? '')
  const [eventName, setEventName] = useState('')
  const [category, setCategory] = useState<CategoryId>('club_event')
  const [description, setDescription] = useState('')
  const [roomId, setRoomId] = useState(options.rooms[0]?.id ?? '')
  const [date, setDate] = useState(options.today)
  const [start, setStart] = useState('18:00')
  const [end, setEnd] = useState('20:00')
  const [attendance, setAttendance] = useState('30')

  useEffect(() => {
    if (!open) return
    setOrganisationId(prefill?.organisationId ?? options.organisations[0]?.id ?? '')
    setEventName(prefill?.eventName ?? '')
    setCategory(prefill?.category ?? 'club_event')
    setRoomId(prefill?.roomId ?? options.rooms[0]?.id ?? '')
    setDate(prefill?.date ?? options.today)
    setStart(formatClock(prefill?.startMin ?? 18 * 60))
    setEnd(formatClock(prefill?.endMin ?? 20 * 60))
    setAttendance(String(prefill?.expectedAttendance ?? 30))
  }, [open, prefill, options.rooms, options.organisations, options.today])

  async function submit() {
    setBusy(true)
    const result = await postJson('/demo/submit', {
      organisationId,
      eventName,
      category,
      description,
      roomId,
      date,
      startMin: toMinutes(start),
      endMin: toMinutes(end),
      expectedAttendance: Number(attendance),
    })
    setBusy(false)
    if (!result.success) {
      toast.error(result.error ?? 'Could not submit the request.')
      return
    }
    toast.success('Request submitted.')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Simulate a request</DialogTitle>
          <DialogDescription>
            Acts as the organisation. The request starts at the first stage of its approval chain.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sim-org">Organisation</Label>
            <Select value={organisationId} onValueChange={setOrganisationId}>
              <SelectTrigger id="sim-org">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.organisations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sim-name">Event name</Label>
            <Input id="sim-name" value={eventName} onChange={(e) => setEventName(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="sim-category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CategoryId)}>
                <SelectTrigger id="sim-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sim-attendance">Expected attendance</Label>
              <Input
                id="sim-attendance"
                type="number"
                min={1}
                value={attendance}
                onChange={(e) => setAttendance(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sim-room">Room</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger id="sim-room">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label} ({r.capacity} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sim-date">Date</Label>
              <Input id="sim-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sim-start">Starts</Label>
              <Input id="sim-start" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sim-end">Ends</Label>
              <Input id="sim-end" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sim-description">Description</Label>
            <Textarea
              id="sim-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || eventName.trim().length === 0}>
            {busy ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
