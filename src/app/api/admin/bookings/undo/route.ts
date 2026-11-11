import { undoSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, fromResult, readJson } from '../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = undoSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Nothing to undo.')
    return fromResult(await (await getBookingService()).undo(gate.actor, parsed.data.batchId))
  } catch (err) {
    platform.error('POST /api/admin/bookings/undo error:', err)
    return fail(500, 'Internal server error')
  }
}
