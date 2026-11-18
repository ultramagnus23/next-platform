import { getStudentService } from '@/app/student/_server/student'
import { previewSchema } from '@/app/student/schema'
import { authorise, fail, ok, readJson } from '../helper'

export const dynamic = 'force-dynamic'

/** The live approval path for the form. Read only. */
export async function POST(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = previewSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Check the highlighted fields.')
    return ok(await (await getStudentService()).previewPath(parsed.data))
  } catch (err) {
    platform.error('POST /api/student/preview error:', err)
    return fail(500, 'Internal server error')
  }
}
