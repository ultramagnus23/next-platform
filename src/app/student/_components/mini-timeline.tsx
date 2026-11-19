import { cn } from '@/lib/utils'
import { formatTime } from '../utils'

interface Block {
  id: string
  kind: 'class' | 'booked' | 'competes' | 'held'
  startMin: number
  endMin: number
}

const START = 8 * 60
const END = 23 * 60
const SPAN = END - START

const STYLE: Record<Block['kind'], string> = {
  class: 'border-border bg-muted',
  booked: 'border-slate-700 bg-slate-700',
  competes: 'border-primary/60 bg-primary/10',
  held: 'border-primary/60 bg-primary/10',
}

/**
 * One room, one day, 8am to 11pm. Grey is a class, dark is another booking, the green wash is the time you
 * asked for. The text summary beside it carries the same facts, so the bar is never the only signal.
 */
export function MiniTimeline({ blocks, from, to, label }: { blocks: Block[]; from: number; to: number; label: string }) {
  const pct = (m: number) => `${Math.min(Math.max(((m - START) / SPAN) * 100, 0), 100)}%`
  return (
    <div role="img" aria-label={label} className="relative h-6 w-full overflow-hidden rounded-md border border-border bg-background">
      {[10, 12, 14, 16, 18, 20, 22].map((h) => (
        <span key={h} className="absolute top-0 h-full border-l border-border/60" style={{ left: pct(h * 60) }} aria-hidden="true" />
      ))}
      {to > from && <span className="absolute top-0 h-full bg-emerald-500/20" style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }} aria-hidden="true" />}
      {blocks.map((b) => (
        <span key={b.id} className={cn('absolute top-1 h-4 rounded-sm border', STYLE[b.kind])} style={{ left: pct(b.startMin), width: `max(calc(${pct(b.endMin)} - ${pct(b.startMin)}), 3px)` }} aria-hidden="true" />
      ))}
    </div>
  )
}

export function describeDay(blocks: Block[]): string {
  if (blocks.length === 0) return 'Nothing booked all day'
  return `In use ${blocks
    .slice()
    .sort((a, b) => a.startMin - b.startMin)
    .slice(0, 3)
    .map((b) => `${formatTime(b.startMin)} to ${formatTime(b.endMin)}`)
    .join(', ')}${blocks.length > 3 ? ' and more' : ''}`
}
