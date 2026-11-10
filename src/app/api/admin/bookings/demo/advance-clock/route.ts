import { advanceClockSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authoriseDemo, fail, ok, readJson } from '../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    const parsed = advanceClockSchema.safeParse((await readJson(request)) ?? {})
    if (!parsed.success) return fail(400, 'Choose 1 to 14 days.')
    return ok(await getBookingService().advanceDays(parsed.data.days))
  } catch (err) {
    platform.error('POST /api/admin/bookings/demo/advance-clock error:', err)
    return fail(500, 'Internal server error')
  }
}
