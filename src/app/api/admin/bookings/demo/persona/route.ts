import { NextResponse } from 'next/server'
import { z } from 'zod'
import { personaSchema } from '@/app/admin/bookings/schema'
import { PERSONA_COOKIE } from '@/app/admin/bookings/_server/actor'
import { authoriseDemo, fail, readJson, type ApiBody } from '../../helper'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ persona: personaSchema })

export async function POST(request: Request) {
  try {
    const gate = await authoriseDemo()
    if ('response' in gate) return gate.response
    const parsed = bodySchema.safeParse(await readJson(request))
    if (!parsed.success) return fail(400, 'Unknown persona.')
    const response = NextResponse.json<ApiBody<{ persona: string }>>({ success: true, data: { persona: parsed.data.persona } })
    response.cookies.set(PERSONA_COOKIE, parsed.data.persona, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  } catch (err) {
    platform.error('POST /api/admin/bookings/demo/persona error:', err)
    return fail(500, 'Internal server error')
  }
}
