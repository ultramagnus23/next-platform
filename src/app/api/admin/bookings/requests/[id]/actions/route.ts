import { actionInputSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, fromResult, readJson } from '../../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = actionInputSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Invalid action.')
    const { id } = await params
    return fromResult(await getBookingService().performAction(gate.actor, id, parsed.data))
  } catch (err) {
    platform.error('POST /api/admin/bookings/requests/[id]/actions error:', err)
    return fail(500, 'Internal server error')
  }
}
