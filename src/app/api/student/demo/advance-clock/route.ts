import { getStudentService } from '@/app/student/_server/student'
import { advanceSchema } from '@/app/student/schema'
import { authoriseDemo, fail, ok, readJson } from '../../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    const parsed = advanceSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Choose between 1 and 60 days.')
    return ok((await getStudentService()).advanceDays(parsed.data.days))
  } catch (err) {
    platform.error('POST /api/student/demo/advance-clock error:', err)
    return fail(500, 'Internal server error')
  }
}
