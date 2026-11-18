import { getStudentService } from '@/app/student/_server/student'
import { newRequestSchema } from '@/app/student/schema'
import { authorise, fail, fromResult, readJson } from '../../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = newRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Check the highlighted fields.')
    const { id } = await params
    return fromResult(await (await getStudentService()).resubmit(gate.actor, id, parsed.data))
  } catch (err) {
    platform.error('POST /api/student/requests/[id]/resubmit error:', err)
    return fail(500, 'Internal server error')
  }
}
