import { cn } from '@/lib/utils'

interface PanelProps {
  id: string
  title: string
  description?: string
  /** An outline button or link, top right. */
  action?: React.ReactNode
  /** A small meta line along the bottom edge. */
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * The one container for a block of content on the club side: a rounded white panel with a title, a short
 * description and an optional action, then the content, then an optional meta line. Same shape everywhere,
 * so every screen reads as one product.
 */
export function Panel({ id, title, description, action, footer, className, children }: PanelProps) {
  return (
    <section aria-labelledby={id} className={cn('grid content-start gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id}>{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      {children}
      {footer && <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">{footer}</footer>}
    </section>
  )
}

/** The tinted tray that holds a list inside a panel. */
export function Tray({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-2 rounded-xl border border-dashed border-border bg-muted/50 p-2', className)}>{children}</div>
}

/** A small rounded tag, for features and needs. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground', className)}>{children}</span>
}

export const ACCENT: Record<'green' | 'red' | 'slate' | 'amber' | 'muted', string> = {
  green: 'border-l-emerald-500',
  red: 'border-l-red-500',
  slate: 'border-l-slate-400',
  amber: 'border-l-amber-400',
  muted: 'border-l-border',
}
