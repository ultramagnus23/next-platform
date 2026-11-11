import 'server-only'

import { cookies, headers } from 'next/headers'
import { isSandbox } from './offices'
import { createDemoRepository, getBookingRepository } from './repo'
import { BookingService } from './service'

/**
 * The one way pages and routes get the booking service.
 *
 * Normally that is a single shared service. In the public sandbox every visitor gets a private copy of
 * the demo data, found by a cookie, so people playing at the same time never see each other's changes.
 * Copies are dropped after SANDBOX_TTL_MINUTES without use, and at most SANDBOX_MAX_VISITORS exist at
 * once. Everything is in memory, so a restart wipes it all.
 */

const SHARED_KEY = '__bookingServiceV2__'
const VISITORS_KEY = '__bookingSandboxVisitors__'

type Holder = typeof globalThis & {
  [SHARED_KEY]?: BookingService
  [VISITORS_KEY]?: Map<string, { service: BookingService; last: number }>
}

const MAX_VISITORS = Math.max(1, Number(process.env.SANDBOX_MAX_VISITORS) || 40)
const TTL_MS = Math.max(1, Number(process.env.SANDBOX_TTL_MINUTES) || 90) * 60_000

function shared(): BookingService {
  const holder = globalThis as Holder
  const existing = holder[SHARED_KEY]
  if (existing) return existing
  const created = new BookingService(getBookingRepository())
  holder[SHARED_KEY] = created
  return created
}

async function visitorId(): Promise<string | null> {
  try {
    const fromHeader = (await headers()).get('x-sandbox-id')
    if (fromHeader) return fromHeader
    return (await cookies()).get('booking_sandbox_id')?.value ?? null
  } catch {
    // Outside a request, such as the start-up warm-up.
    return null
  }
}

export async function getBookingService(): Promise<BookingService> {
  if (!isSandbox()) return shared()
  const id = await visitorId()
  if (!id) return shared()

  const holder = globalThis as Holder
  const visitors = (holder[VISITORS_KEY] ??= new Map())
  const now = Date.now()
  for (const [key, entry] of visitors) if (now - entry.last > TTL_MS) visitors.delete(key)
  const existing = visitors.get(id)
  if (existing) {
    existing.last = now
    return existing.service
  }
  if (visitors.size >= MAX_VISITORS) {
    const oldest = [...visitors.entries()].sort((a, b) => a[1].last - b[1].last)[0]
    if (oldest) visitors.delete(oldest[0])
  }
  const service = new BookingService(createDemoRepository())
  visitors.set(id, { service, last: now })
  return service
}
