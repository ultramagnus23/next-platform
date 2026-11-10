import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, fromResult } from '../../helper'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const { groupId } = await params
    return fromResult(await getBookingService().getClash(gate.actor, decodeURIComponent(groupId)))
  } catch (err) {
    platform.error('GET /api/admin/bookings/clashes/[groupId] error:', err)
    return fail(500, 'Internal server error')
  }
}
