import { z } from 'zod'
import { APPROVAL_SECRET } from '@/app/student/_server/config'
import { getStudentService } from '@/app/student/_server/student'
import { fail, fromResult, ok, readJson } from '../../helper'

export const dynamic = 'force-dynamic'

const bodySchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }).strict(),
  z.object({ decision: z.literal('reject'), reason: z.string().trim().min(1).max(1000) }).strict(),
])

/**
 * The link in an email is the credential, so these two routes are open to anyone holding a valid token and
 * to no one else. GET only reads. Only the POST, sent from the confirmation page, changes anything.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const result = await (await getStudentService()).previewApproval(token, APPROVAL_SECRET)
    if (!result.ok) return fromResult(result)
    const { request, role, expiresAt, remainingRoles } = result.data
    return ok({
      role,
      expiresAt,
      remainingRoles,
      request: { id: request.id, eventName: request.eventName, organisationName: request.organisationName, venueLabel: request.venueLabel, date: request.date, startMin: request.startMin, endMin: request.endMin, attendance: request.attendance },
    })
  } catch (err) {
    platform.error('GET /api/student/approve/[token] error:', err)
    return fail(500, 'Internal server error')
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const parsed = bodySchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'A reason is needed to not approve a request.')
    const { token } = await params
    const reason = parsed.data.decision === 'reject' ? parsed.data.reason : undefined
    const result = await (await getStudentService()).actViaToken(token, APPROVAL_SECRET, parsed.data.decision, reason)
    return result.ok ? ok({ status: result.data.status.label }) : fromResult(result)
  } catch (err) {
    platform.error('POST /api/student/approve/[token] error:', err)
    return fail(500, 'Internal server error')
  }
}
