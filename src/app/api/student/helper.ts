import { NextResponse } from 'next/server'
import { isDemoMode } from '@/app/admin/bookings/_server/offices'
import { resolveStudent } from '@/app/student/_server/actor'
import type { Failure, Result, StudentActor } from '@/app/student/types'

export type ApiBody<T> = { success: true; data: T } | { success: false; error: string; reason?: string; unlockAt?: string | null }

export function ok<T>(data: T): NextResponse<ApiBody<T>> {
  return NextResponse.json({ success: true, data })
}

export function fail(status: number, error: string, extra: { reason?: string; unlockAt?: string | null } = {}): NextResponse<ApiBody<never>> {
  return NextResponse.json({ success: false, error, ...extra }, { status })
}

export function fromResult<T>(result: Result<T>): NextResponse<ApiBody<T>> {
  if (result.ok) return ok(result.data)
  const f: Failure = result
  return fail(f.code, f.error, { reason: f.reason, unlockAt: f.unlockAt })
}

export async function authorise(): Promise<{ actor: StudentActor } | { response: NextResponse<ApiBody<never>> }> {
  const actor = await resolveStudent()
  if (!actor) return { response: fail(403, 'You do not act for a student organisation.') }
  return { actor }
}

/** Demo-only routes answer 404 when demo mode is off. */
export async function authoriseDemo(): Promise<{ actor: StudentActor } | { response: NextResponse<ApiBody<never>> }> {
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
