import { freeRoomsQuerySchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, ok } from '../../helper'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = freeRoomsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    if (!parsed.success) return fail(400, 'Invalid query.')
    const { needs, ...rest } = parsed.data
    return ok(await (await getBookingService()).findFree({ ...rest, needs: needs ? needs.split(',').filter(Boolean) : undefined }))
  } catch (err) {
    platform.error('GET /api/admin/bookings/rooms/free error:', err)
    return fail(500, 'Internal server error')
  }
}
