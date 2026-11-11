import { demoResubmitSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authoriseDemo, fail, fromResult, readJson } from '../../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    const parsed = demoResubmitSchema.safeParse((await readJson(request)) ?? {})
    if (!parsed.success) return fail(400, 'Check the new details.')
    const { id } = await params
    const service = (await getBookingService())
    // The organisation acts here, so the demo borrows super admin rights for this one step.
    const organisationActor = { ...gate.actor, isSuperAdmin: true }
    const detail = await service.getRequestDetail(organisationActor, id)
    if (!detail.ok) return fromResult(detail)
    return fromResult(await service.performAction(organisationActor, id, { action: 'resubmit', version: detail.data.request.version, changes: parsed.data }))
  } catch (err) {
    platform.error('POST /api/admin/bookings/demo/resubmit/[id] error:', err)
    return fail(500, 'Internal server error')
  }
}
