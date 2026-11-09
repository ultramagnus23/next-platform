import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { isDemoMode, isDevBypass } from '@/app/admin/bookings/_server/authorities'
import { resolveActor } from '@/app/admin/bookings/_server/actor'
import type { Actor, BookingRequest, ServiceResult } from '@/app/admin/bookings/types'

/**
 * Shared by every booking route. Order matters: requireAuth first, then the
 * actor lookup, then the action rules inside the service.
 */

export type ApiBody<T> =
  | { success: true; data: T }
  | { success: false; error: string; blocking?: BookingRequest[] }

export function ok<T>(data: T): NextResponse<ApiBody<T>> {
  return NextResponse.json({ success: true, data })
}

export function fail(status: number, error: string, blocking?: BookingRequest[]): NextResponse<ApiBody<never>> {
  return NextResponse.json(blocking ? { success: false, error, blocking } : { success: false, error }, { status })
}

export function fromResult<T>(result: ServiceResult<T>): NextResponse<ApiBody<T>> {
  return result.ok ? ok(result.data) : fail(result.code, result.error, result.blocking)
}

export async function authorise(): Promise<{ actor: Actor } | { response: NextResponse<ApiBody<never>> }> {
  const gate = await requireAuth(['booking_admin'])
  if (gate instanceof NextResponse && !isDevBypass()) {
    return { response: fail(gate.status, gate.status === 401 ? 'Authentication required' : 'Insufficient permissions') }
  }
  const actor = await resolveActor()
  if (!actor) return { response: fail(403, 'You do not act for any booking authority.') }
  return { actor }
}

/** Demo-only routes answer 404 when demo mode is off. */
export async function authoriseDemo(): Promise<{ actor: Actor } | { response: NextResponse<ApiBody<never>> }> {
  if (!isDemoMode()) return { response: fail(404, 'Not found') }
  return authorise()
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
