import { z } from 'zod'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

const querySchema = z.object({ trigger: z.string().min(1).optional(), requestId: z.string().min(1).optional() })

export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    if (!parsed.success) return fail(400, 'Invalid filters.')
    return ok(await (await getBookingService()).getOutbox(gate.actor, parsed.data))
  } catch (err) {
    platform.error('GET /api/admin/bookings/outbox error:', err)
    return fail(500, 'Internal server error')
  }
}
