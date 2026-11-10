import { NextResponse } from 'next/server'
import { actingForSchema } from '@/app/admin/bookings/schema'
import { ACTING_FOR_COOKIE } from '@/app/admin/bookings/_server/actor'
import { authorise, fail, readJson, type ApiBody } from '../helper'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const parsed = actingForSchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Unknown office.')
    if (!gate.actor.offices.includes(parsed.data.office)) return fail(403, 'You do not belong to that office.')
    const response = NextResponse.json<ApiBody<{ office: string }>>({ success: true, data: { office: parsed.data.office } })
    response.cookies.set(ACTING_FOR_COOKIE, parsed.data.office, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  } catch (err) {
    platform.error('POST /api/admin/bookings/acting-for error:', err)
    return fail(500, 'Internal server error')
  }
}
