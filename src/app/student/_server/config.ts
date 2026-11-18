import 'server-only'

/**
 * Email and approve-link settings, read once at start. Everything here fails closed.
 *
 * EMAIL_MODE=live is not enough on its own: EMAIL_DOMAIN_VERIFIED=true must also be set, which you only do
 * once SPF, DKIM and DMARC are published for the sending domain. Anything else means dry-run.
 */

const live = process.env.EMAIL_MODE === 'live' && process.env.EMAIL_DOMAIN_VERIFIED === 'true'

export const EMAIL_LIVE: boolean = live

/** Secret for signing approve links. Empty in production unless set, which turns approve links off. */
export const APPROVAL_SECRET: string = process.env.APPROVAL_TOKEN_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'dev-only-approval-secret')

export const BASE_URL: string = (process.env.RENDER_EXTERNAL_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export const MESSAGE_ID_DOMAIN: string = process.env.EMAIL_MESSAGE_ID_DOMAIN ?? 'booking.example.test'
