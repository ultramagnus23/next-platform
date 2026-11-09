import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { getAuthenticatedUser } from '@/lib/auth'
import { personaSchema } from '../schema'
import type { Actor, AuthorityId } from '../types'
import { authoritiesForEmail, isDemoMode, isDevBypass } from './authorities'
import { actorForPersona } from './repo/fixtures'

export const PERSONA_COOKIE = 'booking_demo_persona'
const DEFAULT_PERSONA = 'slo_approver'
const ALL_AUTHORITIES: AuthorityId[] = ['slo', 'oa', 'cfe', 'acad']

/**
 * Who is acting. Authority is looked up here on every request, never read from
 * the session token. In demo mode a cookie picks a persona, and it never
 * changes the signed-in identity. The cookie is ignored when demo mode is off.
 */
export async function resolveActorUncached(): Promise<Actor | null> {
  const user = await getAuthenticatedUser()
  if (user && !user.access.includes('booking_admin')) return null
  const email = user?.email ?? (isDevBypass() ? 'demo.admin@example.ashoka.edu.in' : null)
  if (!email) return null

  if (isDemoMode()) {
    const jar = await cookies()
    const parsed = personaSchema.safeParse(jar.get(PERSONA_COOKIE)?.value)
    return actorForPersona(parsed.success ? parsed.data : DEFAULT_PERSONA, email)
  }

  if (!user) return null
  const isSuperAdmin = user.role === 'superadmin'
  const authorities = isSuperAdmin ? [...ALL_AUTHORITIES] : authoritiesForEmail(email)
  if (authorities.length === 0) return null
  return {
    email,
    authorities,
    isSuperAdmin,
    canOverride: isSuperAdmin || authorities.includes('acad'),
    canEditSettings: isSuperAdmin,
    demoPersona: null,
  }
}

/** One lookup per request, shared by the layout and the page. */
export const resolveActor = cache(resolveActorUncached)
