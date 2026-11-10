import { z } from 'zod'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

const querySchema = z.object({ q: z.string().trim().min(1).max(80) })

export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    if (!parsed.success) return ok([])
    return ok(await getBookingService().search(gate.actor, parsed.data.q))
  } catch (err) {
    platform.error('GET /api/admin/bookings/search error:', err)
    return fail(500, 'Internal server error')
  }
}
