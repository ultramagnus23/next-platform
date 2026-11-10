import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { OrgColour, RequestStatus } from '../types'
import { statusLabel } from '../utils'

const STATUS_STYLES: Record<RequestStatus, string> = {
  pending: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  changes_requested: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
  confirmed: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  rejected: 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200',
  withdrawn: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-border bg-muted text-muted-foreground',
  displaced: 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200',
}

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_STYLES[status], className)}>
      {statusLabel(status)}
    </Badge>
  )
}

export function CategoryBadge({ label, className }: { label: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', className)}>
      {label}
    </Badge>
  )
}

export function TierChip({ tier, className }: { tier: number; className?: string }) {
  return (
    <span
      title={`Priority tier ${tier}. Tier 1 is highest. Advice only.`}
      className={cn(
        'inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground',
        className,
      )}
    >
      Tier {tier}
    </span>
  )
}

export function ConflictBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-red-300 bg-red-50 font-medium text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200',
        className,
      )}
    >
      {count} conflict{count === 1 ? '' : 's'}
    </Badge>
  )
}

export function FlagBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'info' | 'warn' }) {
  const tones = {
    neutral: 'border-border bg-muted text-muted-foreground',
    info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
    warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  }
  return (
    <Badge variant="outline" className={cn('font-medium', tones[tone])}>
      {children}
    </Badge>
  )
}

/** Literal class names so Tailwind keeps them. Each code always shows in the same colour. */
const ORG_COLOURS: Record<OrgColour, string> = {
  red: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800',
  orange: 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800',
  amber: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800',
  lime: 'bg-lime-100 text-lime-900 border-lime-300 dark:bg-lime-950/50 dark:text-lime-200 dark:border-lime-800',
  emerald: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800',
  teal: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-800',
  sky: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800',
  indigo: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-800',
  violet: 'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300 dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:border-fuchsia-800',
  rose: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800',
  slate: 'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-600',
}

export function orgColourClass(colour: OrgColour): string {
  return ORG_COLOURS[colour]
}

/** The moniker: a coloured three-letter code. Optionally followed by the full name. */
export function OrgChip({
  code,
  colour,
  name,
  className,
}: {
  code: string
  colour: OrgColour
  name?: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn('inline-flex min-w-10 justify-center rounded border px-1.5 py-0.5 font-mono text-xs font-bold tracking-wide', ORG_COLOURS[colour])}
        title={name ?? code}
      >
        {code}
      </span>
      {name && <span className="text-sm">{name}</span>}
    </span>
  )
}
