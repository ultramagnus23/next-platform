'use client'

import { motion, useReducedMotion } from 'motion/react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AV_HOURS } from '../data'
import type { ApprovalPath, PathFlag } from '../types'
import { formatDay, formatTime, istDateOf } from '../utils'

const FLAG_TEXT: Partial<Record<PathFlag, string>> = {
  route_unconfirmed: 'Route unconfirmed, email SLO.',
  notice_unconfirmed: 'The notice this space needs is not confirmed yet. Ask the office how far ahead to book.',
  av_outside_hours: `IT and AV support runs ${formatTime(AV_HOURS.fromMin)} to ${formatTime(AV_HOURS.toMin)}. Your event runs outside those hours, so AV may not be available.`,
  semester_cap_reached: 'Your club has used all the booking days this space allows this semester. The office may not approve more.',
}

interface PathPreviewProps {
  path: ApprovalPath | null
  loading: boolean
  error: string | null
  onRetry: () => void
}

/** Every office this request goes through and why. Rebuilt on each change, announced politely. */
export function PathPreview({ path, loading, error, onRetry }: PathPreviewProps) {
  const reduce = useReducedMotion()

  if (error) {
    return (
      <div role="alert" className="grid gap-2">
        <p className="text-[#b3261e]">{error}</p>
        <div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
  if (!path) return <p className="text-sm text-muted-foreground">Pick a room to see which offices approve it.</p>

  const summary = `${path.stages.length} ${path.stages.length === 1 ? 'office' : 'offices'}: ${path.stages.map((s) => s.role).join(', ')}.`
  const flags = path.flags.map((f) => FLAG_TEXT[f]).filter((t): t is string => Boolean(t))

  return (
    <div className="grid gap-3" aria-busy={loading}>
      <p className="sr-only" aria-live="polite">
        Approval path updated. {summary}
      </p>
      <ol className="grid gap-2" aria-label="Approval path">
        {path.stages.map((s, i) => (
          <motion.li
            key={s.role}
            className="grid grid-cols-[1.5rem_1fr] gap-x-2"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut', delay: reduce ? 0 : i * 0.03 }}
          >
            <span className="font-semibold text-muted-foreground">{i + 1}.</span>
            <span>
              <span className="font-semibold">{s.role}</span>
              <span className="block text-xs text-muted-foreground">
                {s.why}
                {s.confirmed ? '' : '. To confirm with the office.'}
              </span>
            </span>
          </motion.li>
        ))}
      </ol>

      {path.noticeDays !== null && path.latestSubmitAt && (
        <p className="text-sm">
          This route needs {path.noticeDays} days of notice. Send your request by <strong>{formatDay(istDateOf(new Date(path.latestSubmitAt)))}</strong>.
        </p>
      )}

      {path.tooLate && (
        <div role="note" className="flex gap-2 rounded-lg border border-amber-300 bg-[#fff1cf] p-3 text-sm text-[#7a4b00]">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Your date is closer than the notice needed, so the Director, Student Life Office must approve it too.
            {path.nextBestDate ? ` The next date that meets the notice is ${formatDay(path.nextBestDate)}.` : ''}
          </p>
        </div>
      )}

      {flags.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {flags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
