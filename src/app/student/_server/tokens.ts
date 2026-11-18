import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000

export interface TokenPayload {
  /** Request id. */
  r: string
  /** Approval step id. */
  s: string
  /** Role the approval is for. */
  role: string
  /** Expiry, epoch milliseconds. */
  exp: number
  /** Unique id. The repository remembers it so a token works once. */
  jti: string
}

function b64(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function mac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

export function newPayload(requestId: string, stepId: string, role: string, now: Date): TokenPayload {
  return { r: requestId, s: stepId, role, exp: now.getTime() + TOKEN_LIFETIME_MS, jti: randomUUID() }
}

/** body.signature, both base64url. The signature covers the whole body, so nothing in it can be changed. */
export function signToken(payload: TokenPayload, secret: string): string {
  if (!secret) throw new Error('No approval token secret is set.')
  const body = b64(JSON.stringify(payload))
  return `${body}.${b64(mac(body, secret))}`
}

export type VerifyResult = { ok: true; payload: TokenPayload } | { ok: false; problem: 'invalid' | 'expired' }

export function verifyToken(token: string, secret: string, now: Date): VerifyResult {
  if (!secret) return { ok: false, problem: 'invalid' }
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return { ok: false, problem: 'invalid' }
  const given = Buffer.from(signature, 'base64url')
  const wanted = mac(body, secret)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return { ok: false, problem: 'invalid' }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<TokenPayload>
    if (typeof payload.r !== 'string' || typeof payload.s !== 'string' || typeof payload.role !== 'string' || typeof payload.exp !== 'number' || typeof payload.jti !== 'string') {
      return { ok: false, problem: 'invalid' }
    }
    if (now.getTime() > payload.exp) return { ok: false, problem: 'expired' }
    return { ok: true, payload: { r: payload.r, s: payload.s, role: payload.role, exp: payload.exp, jti: payload.jti } }
  } catch {
    return { ok: false, problem: 'invalid' }
  }
}
