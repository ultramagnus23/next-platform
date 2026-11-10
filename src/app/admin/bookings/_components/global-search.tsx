'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { API_BASE } from '../data'
import type { SearchHit } from '../types'
import { OrgChip } from './badges'

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  organisation: 'Organisations',
  room: 'Rooms',
  request: 'Bookings',
}

/** One search box for organisations (by code or name), rooms and bookings. Press / to focus. */
export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length === 0) {
      setHits([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`)
        const json = (await response.json()) as { success: boolean; data?: SearchHit[] }
        setHits(json.success && json.data ? json.data : [])
      } catch {
        setHits([])
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (event.key === '/' && !typing) {
        event.preventDefault()
        document.getElementById('booking-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const kinds: SearchHit['kind'][] = ['organisation', 'room', 'request']

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <Command shouldFilter={false} className="overflow-visible rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id="booking-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            placeholder="Find an organisation (CSS), a room (AC-02 201) or a booking…"
            aria-label="Search organisations, rooms and bookings"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 text-xs text-muted-foreground sm:inline">/</kbd>
        </div>
        {open && query.trim().length > 0 && (
          <CommandList className="absolute left-0 right-0 top-12 z-40 max-h-96 rounded-lg border border-border bg-popover shadow-lg">
            <CommandEmpty>No matches.</CommandEmpty>
            {kinds.map((kind) => {
              const items = hits.filter((h) => h.kind === kind)
              if (items.length === 0) return null
              return (
                <CommandGroup key={kind} heading={KIND_LABEL[kind]}>
                  {items.map((hit) => (
                    <CommandItem
                      key={`${hit.kind}-${hit.href}`}
                      value={`${hit.kind}-${hit.href}`}
                      onSelect={() => {
                        setOpen(false)
                        setQuery('')
                        router.push(hit.href)
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {hit.code && hit.colour && <OrgChip code={hit.code} colour={hit.colour} />}
                        <div className="min-w-0">
                          <p className="truncate">{hit.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{hit.detail}</p>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        )}
      </Command>
    </div>
  )
}
