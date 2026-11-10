import { NextResponse } from 'next/server'
import { auth } from './auth'
import { limitApiRequest } from '@/lib/rate-limit'
import { platform } from '@/lib/platform-logger'

// Routes that need a specific access grant. First match wins.
const ROUTE_ACCESS: Record<string, string[]> = {
  '/admin/bookings': ['booking_admin'],
  '/api/admin/bookings': ['booking_admin'],
}

const PUBLIC_PATHS = ['/', '/login', '/unauthorized']

export default auth(async function middleware(req) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Global per-user /api limit (src/lib/rate-limit.ts). Runs before any handler.
  const limited = limitApiRequest(pathname, req.method, req.headers, req.auth?.user?.email)
  if (limited) return limited

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next/') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next()
  }

  // Local demo only: with both flags set, the booking portal skips sign-in.
  // Never active in production builds.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.BOOKING_DEMO_MODE === 'true' &&
    process.env.BYPASS_AUTH === 'true' &&
    (pathname.startsWith('/admin/bookings') || pathname.startsWith('/api/admin/bookings'))
  ) {
    return NextResponse.next()
  }

  if (!req.auth?.user) {
    platform.log('User not authenticated, redirecting to sign in from:', pathname)
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const userAccess = req.auth.user.access || []
  for (const [routePath, requiredAccess] of Object.entries(ROUTE_ACCESS)) {
    if (pathname.startsWith(routePath)) {
      if (!requiredAccess.some((grant) => userAccess.includes(grant))) {
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
      break
    }
  }

  return NextResponse.next()
})

export const config = {
  // Node, not edge: the auth callback refreshes claims from Strapi (axios) as
  // they go stale, and that runs here on the first request after expiry.
  runtime: 'nodejs',
  matcher: [
    // Skips static assets by extension so auth() never runs for an image or font.
    '/((?!api/auth|_next/static|_next/image|favicon.ico|login|$|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|webmanifest)$).*)',
  ],
}
