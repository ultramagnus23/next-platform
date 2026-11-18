import { isDemoMode } from '@/app/admin/bookings/_server/offices'
import { getStudentService } from '@/app/student/_server/student'
import { authorise, fail, fromResult } from '../../../helper'

export const dynamic = 'force-dynamic'

/** The emails sent for one request, so the club and the demo can see what went out and when. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const { id } = await params
    return fromResult(await (await getStudentService()).listEmails(gate.actor, id, isDemoMode()))
  } catch (err) {
    platform.error('GET /api/student/requests/[id]/emails error:', err)
    return fail(500, 'Internal server error')
  }
}
