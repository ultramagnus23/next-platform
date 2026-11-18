import 'server-only'

import { isOpenAccess } from '@/app/admin/bookings/_server/offices'
import { getAuthenticatedUser } from '@/lib/auth'
import type { StudentActor } from '../types'
import { DEMO_ACTOR } from './demo-seed'

/**
 * Who is asking. In the sandbox everyone is the sample Quiz Club lead. Otherwise a signed-in user is needed,
 * and mapping a person to their club is not decided yet (see PRD questions), so it answers null and the
 * caller refuses. That fails closed instead of guessing a club.
 */
export async function resolveStudent(): Promise<StudentActor | null> {
  if (isOpenAccess()) return DEMO_ACTOR
  const user = await getAuthenticatedUser()
  if (!user) return null
  return null
}
