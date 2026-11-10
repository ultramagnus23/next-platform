import { bulkApproveSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, fromResult, readJson } from '../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = bulkApproveSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Choose at least one request.')
    return fromResult(await getBookingService().bulkApprove(gate.actor, parsed.data.items))
  } catch (err) {
    platform.error('POST /api/admin/bookings/bulk/approve error:', err)
    return fail(500, 'Internal server error')
  }
}
