import { getStudentService } from '@/app/student/_server/student'
import { authorise, fail, fromResult } from '../../../helper'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const { id } = await params
    return fromResult(await (await getStudentService()).cancel(gate.actor, id))
  } catch (err) {
    platform.error('POST /api/student/requests/[id]/cancel error:', err)
    return fail(500, 'Internal server error')
  }
}
