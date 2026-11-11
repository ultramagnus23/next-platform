import { inboxFiltersSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = inboxFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    if (!parsed.success) return fail(400, 'Invalid filters.')
    return ok(await (await getBookingService()).getInbox(gate.actor, parsed.data))
  } catch (err) {
    platform.error('GET /api/admin/bookings/inbox error:', err)
    return fail(500, 'Internal server error')
  }
}
