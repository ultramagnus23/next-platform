import { timingSafeEqual } from 'node:crypto'
import { getStudentService } from '@/app/student/_server/student'
import { fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

// Read once. With no secret set the route refuses everyone, so it cannot be left open by accident.
const CRON_SECRET = process.env.CRON_SECRET ?? ''

function authorised(header: string | null): boolean {
  if (!CRON_SECRET || !header) return false
  const given = Buffer.from(header.replace(/^Bearer /, ''))
  const wanted = Buffer.from(CRON_SECRET)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

/** Run every 15 minutes by a system cron. Writes reminder, escalation and flag events once each. */
export async function POST(request: Request) {
  try {
    if (!authorised(request.headers.get('authorization'))) return fail(401, 'Not allowed')
    const written = await (await getStudentService()).tick()
    return ok({ written: written.length })
  } catch (err) {
    platform.error('POST /api/student/tick error:', err)
    return fail(500, 'Internal server error')
  }
}
