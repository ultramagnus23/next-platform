import { resolveSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/booking'
import { authorise, fail, fromResult, readJson } from '../../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = resolveSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Check the decisions.')
    const { dryRun, ...input } = parsed.data
    const { groupId } = await params
    return fromResult(await (await getBookingService()).resolveClash(gate.actor, decodeURIComponent(groupId), input, dryRun === true))
  } catch (err) {
    platform.error('POST /api/admin/bookings/clashes/[groupId]/resolve error:', err)
    return fail(500, 'Internal server error')
  }
}
