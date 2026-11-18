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
  green: 's-chip--green',
  red: 's-chip--red',
  slate: 's-chip--slate',
  amber: 's-chip--amber',
  muted: 's-chip--muted',
}

/** The status as an icon and a word, tinted. Colour is never the only signal. */
export function StatusChip({ status }: { status: Pick<DerivedStatus, 'icon' | 'tone' | 'label'> }) {
  const Icon = ICONS[status.icon]
  return (
    <span className={`s-chip ${TONE_CLASS[status.tone]}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {status.label}
    </span>
  )
}
