'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface EventPopoverOther {
  id: string
  label: string
  when: string
  kind: string
}

interface EventPopoverProps {
  /** The thing you click. Rendered as the popover trigger, so pass a button or a block. */
  children: ReactNode
  title: string
  /** Short lines under the title, such as time, room and club. */
  lines: string[]
  status?: string
  /** What else is in the same room at the same time. */
  overlaps?: EventPopoverOther[]
  inClash?: boolean
  href?: string | null
}

/**
 * The one popup for any event on any screen. A click shows the detail here, so lists and grids stay short.
 * Nothing navigates until the person picks "Open the request".
 */
export function EventPopover({ children, title, lines, status, overlaps, inClash = false, href }: EventPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 text-sm" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">{title}</p>
        {status && <p className="text-muted-foreground">{status}</p>}
        {lines.map((line) => (
          <p key={line} className="text-muted-foreground">
            {line}
          </p>
        ))}
        {overlaps === undefined ? null : overlaps.length > 0 ? (
          <div className="mt-2">
            <p className="font-medium text-[#b3261e] dark:text-red-300">{inClash ? 'Clashes with' : 'Overlaps with'}</p>
            <ul className="mt-1 grid gap-1">
              {overlaps.map((o) => (
                <li key={o.id}>
                  {o.label}{' '}
                  <span className="text-muted-foreground">
                    ({o.when}, {o.kind})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">Nothing else is in this room at that time.</p>
        )}
        {href && (
          <Link href={href} className="mt-3 inline-block underline">
            Open the request
          </Link>
        )}
      </PopoverContent>
    </Popover>
  )
}
