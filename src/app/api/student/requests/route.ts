import { getStudentService } from '@/app/student/_server/student'
import { newRequestSchema } from '@/app/student/schema'
import { authorise, fail, fromResult, ok, readJson } from '../helper'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    return ok(await (await getStudentService()).listMine(gate.actor))
  } catch (err) {
    platform.error('GET /api/student/requests error:', err)
    return fail(500, 'Internal server error')
  }
}

export async function POST(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = newRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Check the highlighted fields.')
    return fromResult(await (await getStudentService()).submit(gate.actor, parsed.data))
  } catch (err) {
    platform.error('POST /api/student/requests error:', err)
    return fail(500, 'Internal server error')
  }
}
