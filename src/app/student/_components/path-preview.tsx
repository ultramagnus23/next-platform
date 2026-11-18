import { Clock } from 'lucide-react'
import type { ApprovalPath, PathFlag } from '../types'
import { formatDay, formatInstant, istDateOf } from '../utils'

const FLAG_TEXT: Partial<Record<PathFlag, string>> = {
  route_unconfirmed: 'Route unconfirmed, email SLO.',
  notice_unconfirmed: 'The notice this space needs is not confirmed yet. Ask the office how far ahead to book.',
  av_outside_hours: 'IT and AV support runs 8am to 8pm. Your event runs outside those hours, so AV may not be available.',
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
  if (error) {
    return (
      <div role="alert" className="grid gap-2">
        <p className="text-[var(--s-bad-fg)]">{error}</p>
        <div>
          <button type="button" className="s-btn s-btn--quiet" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (!path) return <p className="text-[var(--s-muted)]">Choose a space, a date and a time to see which offices approve it.</p>

  const summary = `${path.stages.length} ${path.stages.length === 1 ? 'office' : 'offices'}: ${path.stages.map((s) => s.role).join(', ')}.`
  const flags = path.flags.map((f) => FLAG_TEXT[f]).filter((t): t is string => Boolean(t))

  return (
    <div className="grid gap-3" aria-busy={loading}>
      <p className="sr-only" aria-live="polite">
        Approval path updated. {summary}
      </p>
      <ol className="grid gap-2" aria-label="Approval path">
        {path.stages.map((s, i) => (
          <li key={s.role} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
            <span className="font-semibold text-[var(--s-muted)]">{i + 1}.</span>
            <span>
              <span className="font-semibold">{s.role}</span>
              <span className="block text-[0.8125rem] text-[var(--s-muted)]">
                {s.why}
                {s.confirmed ? '' : '. To confirm with the office.'}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {path.noticeDays !== null && path.latestSubmitAt && (
        <p>
          This route needs {path.noticeDays} days of notice. Send your request by <strong>{formatDay(istDateOf(new Date(path.latestSubmitAt)))}</strong>.
        </p>
      )}

      {path.tooLate && (
        <div role="note" className="flex gap-2 rounded-lg border border-[var(--s-slow-fg)] bg-[var(--s-slow-bg)] p-3 text-[var(--s-slow-fg)]">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            Your date is closer than the notice needed, so the Director, Student Life Office must approve it too.
            {path.nextBestDate ? ` The next date that meets the notice is ${formatDay(path.nextBestDate)}.` : ''}
          </p>
        </div>
      )}

      {flags.length > 0 && (
        <ul className="grid gap-1 text-[0.9375rem]">
          {flags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {path.latestSubmitAt && <p className="sr-only">Latest submit time {formatInstant(path.latestSubmitAt)}</p>}
    </div>
  )
}
