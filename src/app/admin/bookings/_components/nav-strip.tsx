'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavStripProps {
  inbox: number
  clashes: number
}

const ITEMS: Array<{ href: string; label: string; badge?: 'inbox' | 'clashes' }> = [
  { href: '/admin/bookings', label: 'Inbox', badge: 'inbox' },
  { href: '/admin/bookings/clashes', label: 'Clashes', badge: 'clashes' },
  { href: '/admin/bookings/rooms', label: 'Rooms' },
  { href: '/admin/bookings/calendar', label: 'Calendar' },
  { href: '/admin/bookings/organisations', label: 'Organisations' },
  { href: '/admin/bookings/outbox', label: 'Sent emails' },
  { href: '/admin/bookings/settings', label: 'Rules' },
]

/** Section tabs with live counts. The sidebar has the same links, but cannot show numbers. */
export function NavStrip({ inbox, clashes }: NavStripProps) {
  const pathname = usePathname()
  return (
    <nav aria-label="Room bookings" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {ITEMS.map((item) => {
          const active = item.href === '/admin/bookings' ? pathname === item.href : pathname.startsWith(item.href)
          const count = item.badge === 'inbox' ? inbox : item.badge === 'clashes' ? clashes : null
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', active ? 'bg-primary font-semibold text-white' : 'hover:bg-accent')}
              >
                {item.label}
                {count !== null && count > 0 && (
                  <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/25' : 'bg-muted')}>{count}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
