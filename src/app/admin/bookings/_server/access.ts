import type { Actor, BookingRequest, EngineContext } from '../types'
import { clashesFor } from './engine/occupancy'

/**
 * Who can see and do what. The client never sends offices or ids that decide
 * access: everything here is derived from the resolved actor.
 */

export function isFinalOffice(actor: Actor, ctx: Pick<EngineContext, 'settings'>): boolean {
  if (actor.isSuperAdmin) return true
  return ctx.settings.offices.some((o) => o.isFinal && actor.offices.includes(o.id))
}

/**
 * full: the request's chain includes one of my offices (Academic Booking and
 * super admins see everything). summary: it clashes with one of my requests,
 * so I may read it but not act on it. none: not mine.
 */
export function visibilityOf(actor: Actor, request: BookingRequest, ctx: EngineContext): 'full' | 'summary' | 'none' {
  if (isFinalOffice(actor, ctx)) return 'full'
  if (request.stages.some((s) => actor.offices.includes(s))) return 'full'
  const involvesMe = clashesFor(ctx, request.id).some(
    (c) => c.item.request?.stages.some((s) => actor.offices.includes(s)) ?? false,
  )
  return involvesMe ? 'summary' : 'none'
}

export function canResolveClashes(actor: Actor, ctx: Pick<EngineContext, 'settings'>): boolean {
  return isFinalOffice(actor, ctx)
}

/** True when this request waits on the office the actor is acting for. */
export function waitingOnMe(actor: Actor, request: BookingRequest): boolean {
  if (request.status !== 'pending') return false
  if (actor.isSuperAdmin) return true
  return request.stages[request.stageIndex] === actor.actingFor
}
