'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEMO_BANNER, PERSONAS } from '../data'
import type { PersonaId } from '../types'
import { postJson } from './use-booking-action'
import { SIMULATE_EVENT, SimulateDialog, type SimulateOptions, type SimulatePrefill } from './simulate-dialog'

interface DemoBarProps {
  persona: PersonaId | null
  options: SimulateOptions
}

/** Demo-only controls: persona switcher, simulated submission and reset. */
export function DemoBar({ persona, options }: DemoBarProps) {
  const router = useRouter()
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [prefill, setPrefill] = useState<SimulatePrefill | null>(null)

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SimulatePrefill>).detail
      setPrefill(detail ?? null)
      setSimulateOpen(true)
    }
    window.addEventListener(SIMULATE_EVENT, handler)
    return () => window.removeEventListener(SIMULATE_EVENT, handler)
  }, [])

  async function switchPersona(next: string) {
    const result = await postJson('/demo/persona', { persona: next })
    if (!result.success) {
      toast.error(result.error ?? 'Could not switch persona.')
      return
    }
    router.refresh()
  }

  async function resetData() {
    const result = await postJson('/demo/reset', {})
    if (result.success) {
      toast.success('Demo data reset.')
      router.refresh()
    } else {
      toast.error(result.error ?? 'Could not reset demo data.')
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <p>{DEMO_BANNER}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Viewing as</span>
          <Select value={persona ?? undefined} onValueChange={switchPersona}>
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setPrefill(null)
            setSimulateOpen(true)
          }}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Simulate request
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More demo actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={resetData}>Reset demo data</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SimulateDialog open={simulateOpen} onOpenChange={setSimulateOpen} options={options} prefill={prefill} />
    </div>
  )
}
