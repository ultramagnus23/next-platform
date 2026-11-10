import { cache } from 'react'
import { auth } from '../auth'
import { NextResponse } from 'next/server'
import type { PlatformRole } from './authz/roles'
import type { OrgMembership, Sport } from './authz/types'

export interface AuthenticatedUser {
  email: string
  /** Strapi user id — use this instead of `getUserIdByEmail`. Null if the user has no Strapi record. */
  uid: number | null
  role: PlatformRole
  access: string[]
  batch: string | null
  sports: Sport[]
  orgs: OrgMembership[]
}

/**
 * Get authenticated user from request
 * Returns null if user is not authenticated
 * Wrapped in React.cache so layout, page and components share one session read per request.
 */
export const getAuthenticatedUser = cache(async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const session = await auth()
    
    if (!session?.user?.email) {
      return null
    }
    
    return {
      email: session.user.email,
      uid: session.user.uid ?? null,
      role: session.user.role ?? 'user',
      access: session.user.access ?? ['none'],
      batch: session.user.batch ?? null,
      sports: session.user.sports ?? [],
      orgs: session.user.orgs ?? [],
    }
  } catch (error) {
    platform.error('Error getting authenticated user:', error)
    return null
  }
})

/**
 * Check if user has required access level
 */
export function hasAccess(user: AuthenticatedUser, requiredAccess: string[]): boolean {
  return requiredAccess.some(access => user.access.includes(access))
}

/**
 * Middleware function to protect API routes
 */
export async function requireAuth(
  requiredAccess: string[] = ['platform']
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const user = await getAuthenticatedUser()
  
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }
  
  if (!hasAccess(user, requiredAccess)) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    )
  }
  
  return { user }
}
