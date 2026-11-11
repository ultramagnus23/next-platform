import { roomsDayQuerySchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, ok } from '../../helper'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = roomsDayQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    if (!parsed.success) return fail(400, 'Invalid query.')
    const { needs, freeOnly, ...rest } = parsed.data
    return ok(
      await (await getBookingService()).getRoomsDay({
        ...rest,
        needs: needs ? needs.split(',').filter(Boolean) : undefined,
        freeOnly: freeOnly === 'true' || freeOnly === '1',
      }),
    )
  } catch (err) {
    platform.error('GET /api/admin/bookings/rooms/day error:', err)
    return fail(500, 'Internal server error')
  }
}
