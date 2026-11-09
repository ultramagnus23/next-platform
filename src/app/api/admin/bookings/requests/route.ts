import { requestFiltersSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const params = Object.fromEntries(new URL(request.url).searchParams.entries())
    const parsed = requestFiltersSchema.safeParse(params)
    if (!parsed.success) return fail(400, 'Invalid filters.')
    const result = await getBookingService().listRequests(gate.actor, parsed.data)
    return ok(result)
  } catch (err) {
    platform.error('GET /api/admin/bookings/requests error:', err)
    return fail(500, 'Internal server error')
  }
}
