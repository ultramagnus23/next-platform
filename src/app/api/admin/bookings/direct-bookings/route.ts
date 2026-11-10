import { directBookingSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, fromResult, readJson } from '../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = directBookingSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Check the booking details.')
    const service = getBookingService()
    const org = (await service.listOrganisations()).find((o) => o.id === parsed.data.organisationId)
    if (!org) return fail(400, 'Unknown organisation.')
    return fromResult(await service.createDirectBooking(gate.actor, { ...parsed.data, submittedBy: gate.actor.email }))
  } catch (err) {
    platform.error('POST /api/admin/bookings/direct-bookings error:', err)
    return fail(500, 'Internal server error')
  }
}
