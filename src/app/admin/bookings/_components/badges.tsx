import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RequestStatus } from '../types'
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
