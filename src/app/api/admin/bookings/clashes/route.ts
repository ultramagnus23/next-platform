import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    return ok(await (await getBookingService()).listClashes(gate.actor))
  } catch (err) {
    platform.error('GET /api/admin/bookings/clashes error:', err)
    return fail(500, 'Internal server error')
  }
}
