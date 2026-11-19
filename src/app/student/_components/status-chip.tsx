import { Ban, Check, Clock, Hourglass, Pencil, X } from 'lucide-react'
import type { DerivedStatus } from '../logic/status'
import type { StatusIcon, StatusTone } from '../types'

const ICONS: Record<StatusIcon, typeof Check> = {
  pencil: Pencil,
  hourglass: Hourglass,
  clock: Clock,
  check: Check,
  x: X,
  ban: Ban,
}

const TONE_CLASS: Record<StatusTone, string> = {
  green: 'border-emerald-300 bg-[#e4f2e9] text-[#1d6b3f]',
  red: 'border-red-300 bg-[#fdecea] text-[#b3261e]',
  slate: 'border-slate-300 bg-slate-100 text-slate-800',
  amber: 'border-amber-300 bg-[#fff1cf] text-[#7a4b00]',
  muted: 'border-border bg-muted text-muted-foreground',
}

/** The status as an icon and a word, tinted. Colour is never the only signal. */
export function StatusChip({ status }: { status: Pick<DerivedStatus, 'icon' | 'tone' | 'label'> }) {
  const Icon = ICONS[status.icon]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[status.tone]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {status.label}
    </span>
  )
}
