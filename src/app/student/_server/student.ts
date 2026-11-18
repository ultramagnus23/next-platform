import 'server-only'

import { isSandbox } from '@/app/admin/bookings/_server/offices'
import { MAX_VISITORS, TTL_MS, visitorId } from '@/app/admin/bookings/_server/booking'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { AdminBridge } from './bridge'
import { APPROVAL_SECRET, BASE_URL, EMAIL_LIVE, MESSAGE_ID_DOMAIN } from './config'
import { seedStudentDemo } from './demo-seed'
import { DryRunTransport, SmtpTransport } from './email/transport'
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
  const demo = isSandbox() || process.env.BOOKING_DEMO_MODE === 'true'
  // Demo and sandbox never send real mail, whatever else is set.
  const transport = EMAIL_LIVE && !demo ? new SmtpTransport() : new DryRunTransport((line) => platform.log(line))
  const service = new StudentService(new MemoryStudentRepository(), { transport, tokenSecret: APPROVAL_SECRET, baseUrl: BASE_URL, messageIdDomain: MESSAGE_ID_DOMAIN, bridge: new AdminBridge(() => getBookingService()) })
  if (demo) await seedStudentDemo(service)
  return service
}

function shared(holder: Holder): Promise<StudentService> {
  const existing = holder[SHARED_KEY]
  if (existing) return existing
  const created = build().catch((err: unknown) => {
    // Do not remember a failed build, or every later request fails the same way.
    holder[SHARED_KEY] = undefined
    throw err
  })
  holder[SHARED_KEY] = created
  return created
}

export async function getStudentService(): Promise<StudentService> {
  const holder = globalThis as Holder
  if (!isSandbox()) return shared(holder)

  const id = await visitorId()
  if (!id) return shared(holder)
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
