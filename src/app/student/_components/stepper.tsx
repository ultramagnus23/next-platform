import { Check, Circle, CircleDot, X } from 'lucide-react'
import type { ApprovalStepRecord, StepState } from '../types'
import { formatInstant } from '../utils'

const WORD: Record<StepState, string> = {
  approved: 'Done',
  current: 'Current',
  not_started: 'Not started',
  rejected: 'Not approved',
}

function Mark({ state }: { state: StepState }) {
  const common = 'h-5 w-5 shrink-0'
  if (state === 'approved') return <Check className={`${common} text-[#1d6b3f]`} aria-hidden="true" />
  if (state === 'rejected') return <X className={`${common} text-[#b3261e]`} aria-hidden="true" />
  if (state === 'current') return <CircleDot className={`${common} text-primary`} aria-hidden="true" />
  return <Circle className={`${common} text-muted-foreground/60`} aria-hidden="true" />
}

/**
 * Every office the request goes through, in order. Each row has the office by role, a word for where it
 * stands, and an absolute date. A one pixel rule joins the marks. No row is colour only.
 */
export function Stepper({ steps, waitingSince }: { steps: ApprovalStepRecord[]; waitingSince: string | null }) {
  return (
    <ol aria-label="Approval path" className="grid">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        const when = step.decidedAt ? formatInstant(step.decidedAt) : step.state === 'current' && waitingSince ? `Waiting since ${formatInstant(waitingSince)}` : null
        return (
          <li key={step.id} className="grid grid-cols-[1.25rem_1fr] gap-x-3" aria-current={step.state === 'current' ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <Mark state={step.state} />
              {!last && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className={last ? 'pb-0' : 'pb-5'}>
              <p className="font-semibold">
                {step.role} <span className="font-normal text-muted-foreground">· {WORD[step.state]}</span>
              </p>
              {when && <p className="text-[0.8125rem] text-muted-foreground">{when}</p>}
              {step.state === 'rejected' && step.reason && <p className="mt-1">{step.reason}</p>}
              {!step.confirmed && <p className="text-[0.8125rem] text-muted-foreground">This step is still to confirm with the office.</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
