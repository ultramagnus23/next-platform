import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    return ok(await getBookingService().listConflictGroups(gate.actor))
  } catch (err) {
    platform.error('GET /api/admin/bookings/conflicts error:', err)
    return fail(500, 'Internal server error')
  }
}
