/**
 * The role registry — the one place that decides who is what.
 *
 * Adding a role:
 *   1. Add a `defineRole({...})` entry to `ROLES` at the right priority.
 *   2. Give it an `assign` function. Use one from `./assigners.ts`, compose
 *      them with `anyOf` / `allOf`, or write your own — sync or async, reading
 *      the shared context (`ctx.user`, `ctx.orgs`, `ctx.batch`, …) or fetching
 *      whatever it needs.
 *   3. If the role needs its own sidebar, add it to the relevant interface's
 *      `roles` map in `src/components/sidebar/`.
 *
 * Order matters: roles are tried top to bottom and the first match wins.
 * Assignment re-runs on sign-in and every `CLAIMS_TTL_MS` after (see
 * `./claims.ts`), so a change here reaches signed-in users without a re-login.
 */

import { always, byEnvList } from './assigners'
import type { AssignContext, RoleDefinition, Sport, SportDefinition } from './types'
import { isBookingOfficeMember } from '@/app/admin/bookings/_server/offices'

function defineRole<const Id extends string>(role: RoleDefinition<Id>): RoleDefinition<Id> {
  return role
}

export const ROLES = [
  defineRole({
    id: 'superadmin',
    label: 'Super Admin',
    description: 'Listed in SUPERADMIN_EMAILS. Carries every access grant.',
    access: ['platform', 'booking_admin'],
    assign: byEnvList('SUPERADMIN_EMAILS'),
  }),
  defineRole({
    id: 'booking_authority',
    label: 'Booking Authority',
    description: 'Listed under an office in BOOKING_OFFICES. Reviews room booking requests.',
    access: ['platform', 'booking_admin'],
    assign: (ctx) => isBookingOfficeMember(ctx.email),
  }),
  defineRole({
    id: 'user',
    label: 'General User',
    description: 'Signed in but outside every other role. No access to the portal.',
    access: ['none'],
    assign: always(),
  }),
] as const

export type PlatformRole = (typeof ROLES)[number]['id']

export const DEFAULT_ROLE: PlatformRole = 'user'

/**
 * Leagues and their points of contact. Unlike roles, every sport is checked,
 * so one person can run several. Resolved before roles, so a role's assigner
 * can read `ctx.sports`.
 */
export const SPORT_POCS: Record<Sport, SportDefinition> = {} as Record<Sport, SportDefinition>

const ROLE_BY_ID = new Map<string, RoleDefinition<PlatformRole>>(ROLES.map((role) => [role.id, role]))

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && ROLE_BY_ID.has(value)
}

/** Access grants for a role plus every league the user runs. */
export function accessFor(role: PlatformRole, sports: readonly Sport[]): string[] {
  const access = new Set(ROLE_BY_ID.get(role)?.access ?? [])
  for (const sport of sports) {
    for (const grant of SPORT_POCS[sport].access) access.add(grant)
  }
  return [...access]
}
