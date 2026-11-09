import { settingsSchema } from '@/app/admin/bookings/schema'
import { getBookingService } from '@/app/admin/bookings/_server/service'
import { authorise, fail, fromResult, ok, readJson } from '../helper'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    return ok(await getBookingService().getSettings())
  } catch (err) {
    platform.error('GET /api/admin/bookings/settings error:', err)
    return fail(500, 'Internal server error')
  }
}

export async function PUT(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    if (!gate.actor.canEditSettings) return fail(403, 'Only a super admin can change settings.')
    const parsed = settingsSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      return fail(400, parsed.error.issues[0]?.message ?? 'Check the settings.')
    }
    return fromResult(await getBookingService().saveSettings(gate.actor, parsed.data))
  } catch (err) {
    platform.error('PUT /api/admin/bookings/settings error:', err)
    return fail(500, 'Internal server error')
  }
}
