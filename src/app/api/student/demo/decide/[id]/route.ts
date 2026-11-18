import { getStudentService } from '@/app/student/_server/student'
import { decisionSchema } from '@/app/student/schema'
import { authoriseDemo, fail, fromResult, readJson } from '../../../helper'

export const dynamic = 'force-dynamic'

/** Demo only: plays an office so the tracker can be watched changing. 404 when demo mode is off. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    const parsed = decisionSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'A reason is needed to not approve.')
    const { id } = await params
    const service = await getStudentService()
    const owned = await service.getDetail(gate.actor, id)
    if (!owned.ok) return fromResult(owned)
    return fromResult(await service.recordDecision(id, parsed.data))
  } catch (err) {
    platform.error('POST /api/student/demo/decide error:', err)
    return fail(500, 'Internal server error')
  }
}
