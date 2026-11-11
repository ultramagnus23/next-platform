import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, fromResult } from '../../helper'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const { id } = await params
    return fromResult(await (await getBookingService()).getRequestDetail(gate.actor, id))
  } catch (err) {
    platform.error('GET /api/admin/bookings/requests/[id] error:', err)
    return fail(500, 'Internal server error')
  }
}
