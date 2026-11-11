'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEMO_BANNER, PERSONAS } from '../data'
import type { OfficeId, PersonaId } from '../types'
import { SIMULATE_EVENT, SimulateDialog, type SimulateOptions, type SimulatePrefill } from './simulate-dialog'
import { postJson } from './use-booking-action'

interface BookingBarProps {
  sandbox?: boolean
  demo: boolean
  persona: PersonaId | null
  actingFor: OfficeId
  offices: Array<{ id: OfficeId; label: string }>
  options: SimulateOptions
  clockLabel: string | null
}

/** Acting-for select for everyone, plus demo controls when demo mode is on. */
export function BookingBar({ sandbox = false, demo, persona, actingFor, offices, options, clockLabel }: BookingBarProps) {
  const router = useRouter()
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [prefill, setPrefill] = useState<SimulatePrefill | null>(null)

  useEffect(() => {
    const handler = (event: Event) => {
      setPrefill((event as CustomEvent<SimulatePrefill>).detail ?? null)
      setSimulateOpen(true)
    }
    window.addEventListener(SIMULATE_EVENT, handler)
    return () => window.removeEventListener(SIMULATE_EVENT, handler)
  }, [])

  async function post(path: string, body: unknown, ok: string) {
    const result = await postJson(path, body)
    if (!result.success) {
      toast.error(result.error ?? 'Something went wrong.')
      return
    }
    if (ok) toast.success(ok)
    router.refresh()
  }

  const actingSelect = offices.length > 1 && !demo && (
    <label className="flex items-center gap-2 text-sm">
      <span className="whitespace-nowrap">Acting for</span>
      <Select value={actingFor} onValueChange={(v) => post('/acting-for', { office: v }, '')}>
        <SelectTrigger className="h-8 w-52 bg-background" aria-label="Acting for">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {offices.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )

  if (!demo) return actingSelect || null

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        {sandbox ? 'Public sandbox: you are working on your own private copy of made-up data. Nothing is saved for long and no emails are sent.' : DEMO_BANNER}
        {clockLabel && <span className="ml-2 font-medium">{clockLabel}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Viewing as</span>
          <Select value={persona ?? undefined} onValueChange={(v) => post('/demo/persona', { persona: v }, '')}>
            <SelectTrigger className="h-8 w-44 bg-background" aria-label="Viewing as">
              <SelectValue placeholder="Choose a persona" />
            </SelectTrigger>
            <SelectContent>
              {PERSONAS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More demo actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setPrefill(null)
                setSimulateOpen(true)
              }}
            >
              Simulate a club request
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => post('/demo/advance-clock', { days: 1 }, 'Clock moved forward one day.')}>Advance clock 1 day</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => post('/demo/reset', {}, 'Demo data reset.')}>Reset demo data</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SimulateDialog open={simulateOpen} onOpenChange={setSimulateOpen} options={options} prefill={prefill} />
    </div>
  )
}
