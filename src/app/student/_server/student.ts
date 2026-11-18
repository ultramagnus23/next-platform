import 'server-only'

import { isSandbox } from '@/app/admin/bookings/_server/offices'
import { MAX_VISITORS, TTL_MS, visitorId } from '@/app/admin/bookings/_server/booking'
import { seedStudentDemo } from './demo-seed'
import { MemoryStudentRepository } from './repo/memory'
import { StudentService } from './service'

/**
 * The one way pages and routes get the student service. Same idea as the booking registry: one shared
 * service normally, one private copy per visitor in the public sandbox. Everything is in memory.
 */

const SHARED_KEY = '__studentServiceV1__'
const VISITORS_KEY = '__studentSandboxVisitors__'

type Entry = { service: StudentService; last: number }
type Holder = typeof globalThis & { [SHARED_KEY]?: Promise<StudentService>; [VISITORS_KEY]?: Map<string, Entry> }

async function build(): Promise<StudentService> {
  const service = new StudentService(new MemoryStudentRepository())
  if (isSandbox() || process.env.BOOKING_DEMO_MODE === 'true') await seedStudentDemo(service)
  return service
}

export async function getStudentService(): Promise<StudentService> {
  const holder = globalThis as Holder
  if (!isSandbox()) return (holder[SHARED_KEY] ??= build())

  const id = await visitorId()
  if (!id) return (holder[SHARED_KEY] ??= build())
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
  const service = await build()
  visitors.set(id, { service, last: now })
  return service
}
