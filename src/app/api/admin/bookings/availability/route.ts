import { availabilityQuerySchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const params = Object.fromEntries(new URL(request.url).searchParams.entries())
    const parsed = availabilityQuerySchema.safeParse(params)
    if (!parsed.success) return fail(400, 'Invalid query.')
    const service = getBookingService()
    if ('roomId' in parsed.data) {
      return ok({ schedule: await service.daySchedule(parsed.data.roomId, parsed.data.date) })
    }
    return ok({ rooms: await service.findFreeRooms(parsed.data) })
  } catch (err) {
    platform.error('GET /api/admin/bookings/availability error:', err)
    return fail(500, 'Internal server error')
  }
}
