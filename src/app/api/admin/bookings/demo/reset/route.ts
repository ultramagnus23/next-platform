import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authoriseDemo, fail, ok } from '../../helper'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    await getBookingService().reset()
    return ok({ reset: true })
  } catch (err) {
    platform.error('POST /api/admin/bookings/demo/reset error:', err)
    return fail(500, 'Internal server error')
  }
}
