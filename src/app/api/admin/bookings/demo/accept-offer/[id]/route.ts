import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authoriseDemo, fail, fromResult } from '../../../helper'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    const { id } = await params
    const service = getBookingService()
    const organisationActor = { ...gate.actor, isSuperAdmin: true }
    const detail = await service.getRequestDetail(organisationActor, id)
    if (!detail.ok) return fromResult(detail)
    return fromResult(await service.performAction(organisationActor, id, { action: 'accept_offer', version: detail.data.request.version }))
  } catch (err) {
    platform.error('POST /api/admin/bookings/demo/accept-offer/[id] error:', err)
    return fail(500, 'Internal server error')
  }
}
