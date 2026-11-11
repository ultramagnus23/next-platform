'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface TourStep {
  /** CSS selector of the thing to point at. Without a match the card is shown in the middle. */
  target?: string
  title: string
  body: string
}

interface GuidedTourProps {
  steps: TourStep[]
  open: boolean
  onClose: () => void
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const CARD_WIDTH = 340

/**
 * A short walkthrough. Dims the page, rings the target and puts a card next to it.
 * Keyboard: Enter or the right arrow goes on, the left arrow goes back, Escape leaves.
 */
export function GuidedTour({ steps, open, onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = steps[index]

  const measure = useCallback(() => {
    const el = step?.target ? document.querySelector<HTMLElement>(step.target) : null
    if (!el) {
      setBox(null)
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const r = el.getBoundingClientRect()
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    // The page may still be scrolling or loading, so measure again shortly.
    const timer = window.setTimeout(measure, 350)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, measure])

  const last = index === steps.length - 1
  const next = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, onClose])

  if (!open || !step) return null

  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const width = Math.min(CARD_WIDTH, vw - 24)
  let cardStyle: React.CSSProperties
  if (box) {
    const below = box.top + box.height + 12 + 200 < vh
    const top = below ? box.top + box.height + 12 : Math.max(12, box.top - 12 - 200)
    const left = Math.min(Math.max(12, box.left), vw - width - 12)
    cardStyle = { top, left, width }
  } else {
    cardStyle = { top: Math.max(12, vh / 2 - 100), left: Math.max(12, vw / 2 - width / 2), width }
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {box ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all"
          style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      )}
      <div className="absolute rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl" style={cardStyle}>
        <p className="text-xs text-muted-foreground">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
        <p className="mt-1 text-sm">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Skip
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button size="sm" variant="outline" onClick={() => setIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={next} autoFocus>
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
