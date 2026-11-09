import { demoSubmitSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authoriseDemo, fail, fromResult, readJson } from '../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    const parsed = demoSubmitSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Check the request details.')
    const service = getBookingService()
    const orgs = await service.listOrganisations()
    const org = orgs.find((o) => o.id === parsed.data.organisationId)
    if (!org) return fail(400, 'Unknown organisation.')
    return fromResult(await service.submit({ ...parsed.data, submittedBy: org.contactEmail }))
  } catch (err) {
    platform.error('POST /api/admin/bookings/demo/submit error:', err)
    return fail(500, 'Internal server error')
  }
}
