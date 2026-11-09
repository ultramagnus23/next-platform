import type { Actor, BookingRequest, BookingSettings, Visibility } from '../types'
import { conflictsFor } from './engine/conflicts'

/**
 * Who can see and do what. The client never sends authorities or ids that
 * decide access: everything here is derived from the resolved actor.
 */

export function actsForFinalAuthority(actor: Actor, settings: BookingSettings): boolean {
  if (actor.isSuperAdmin) return true
  const finals = settings.authorities.filter((a) => a.isFinal).map((a) => a.id)
  return actor.authorities.some((a) => finals.includes(a))
}

/**
 * full: the request's chain includes one of my authorities (Academic Booking
 * and super admins see everything).
 * summary: a competitor in a conflict with one of my requests. Read-only.
 */
export function visibilityOf(
  actor: Actor,
  request: BookingRequest,
  allRequests: BookingRequest[],
  settings: BookingSettings,
): Visibility {
  if (actsForFinalAuthority(actor, settings)) return 'full'
  if (request.stages.some((s) => actor.authorities.includes(s))) return 'full'
  const involvesMe = conflictsFor(request.id, allRequests, settings).some((item) =>
    item.request.stages.some((s) => actor.authorities.includes(s)),
  )
  return involvesMe ? 'summary' : 'none'
}

export function canResolveConflicts(actor: Actor, settings: BookingSettings): boolean {
  return actsForFinalAuthority(actor, settings)
}

export function canEditSettings(actor: Actor): boolean {
  return actor.canEditSettings
}

/** True when this request is waiting on something the actor can do. */
export function needsMyAction(actor: Actor, request: BookingRequest): boolean {
  if (request.status !== 'pending') return false
  if (actor.isSuperAdmin) return true
  const stage = request.stages[request.stageIndex]
  return stage !== undefined && actor.authorities.includes(stage)
}
