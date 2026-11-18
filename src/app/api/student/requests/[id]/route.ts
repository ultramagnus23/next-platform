import { getStudentService } from '@/app/student/_server/student'
import { authorise, fail, fromResult } from '../../helper'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const { id } = await params
    return fromResult(await (await getStudentService()).getDetail(gate.actor, id))
  } catch (err) {
    platform.error('GET /api/student/requests/[id] error:', err)
    return fail(500, 'Internal server error')
  }
}
