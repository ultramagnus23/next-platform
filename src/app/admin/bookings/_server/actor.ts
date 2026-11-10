import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { getAuthenticatedUser } from '@/lib/auth'
import type { Actor, OfficeId, PersonaId } from '../types'
import { isDemoMode, isDevBypass, officesForEmail } from './offices'
import { actorForPersona } from './repo/fixtures'

export const PERSONA_COOKIE = 'booking_demo_persona'
export const ACTING_FOR_COOKIE = 'booking_acting_for'
const DEFAULT_PERSONA: PersonaId = 'slo_approver'
const DEMO_IDENTITY = 'demo.admin@example.ashoka.edu.in'
const ALL_OFFICES: OfficeId[] = ['slo', 'oa', 'cfe', 'acad']
const PERSONAS: PersonaId[] = ['slo_approver', 'oa_approver', 'cfe_approver', 'acad_approver', 'super_admin']

function isOffice(value: string | undefined): value is OfficeId {
  return value !== undefined && ALL_OFFICES.some((o) => o === value)
}

function isPersona(value: string | undefined): value is PersonaId {
  return value !== undefined && PERSONAS.some((p) => p === value)
}

/**
 * Who is acting. The office is looked up here on every request, never read
 * from the session token. "Acting for" comes from a cookie and is validated
 * against the offices this person belongs to. In demo mode a second cookie
 * picks a persona; it never changes the signed-in identity and is ignored when
 * demo mode is off.
 */
export async function resolveActorUncached(): Promise<Actor | null> {
  const user = await getAuthenticatedUser()
  if (user && !user.access.includes('booking_admin')) return null
  const email = user?.email ?? (isDevBypass() ? DEMO_IDENTITY : null)
  if (!email) return null
  const jar = await cookies()

  if (isDemoMode()) {
    const persona = jar.get(PERSONA_COOKIE)?.value
    return actorForPersona(isPersona(persona) ? persona : DEFAULT_PERSONA, email)
  }

  if (!user) return null
  const isSuperAdmin = user.role === 'superadmin'
  const offices = isSuperAdmin ? [...ALL_OFFICES] : officesForEmail(email)
  const first = offices[0]
  if (!first) return null
  const wanted = jar.get(ACTING_FOR_COOKIE)?.value
  const actingFor = isOffice(wanted) && offices.includes(wanted) ? wanted : first
  return {
    email,
    offices,
    actingFor,
    isSuperAdmin,
    canOverride: isSuperAdmin || offices.includes('acad'),
    canEditRules: isSuperAdmin,
    demoPersona: null,
  }
}

/** One lookup per request, shared by the layout and the page. */
export const resolveActor = cache(resolveActorUncached)
