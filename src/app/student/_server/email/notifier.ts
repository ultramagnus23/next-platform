import type { ApprovalToken, EmailTemplate, OutboxRow, StudentRequest } from '../../types'
import type { StudentRepository } from '../repo/repository'
import { newPayload, signToken } from '../tokens'
import { renderEmail, type TemplateContext } from './templates'
import { toOutgoing, type MailTransport } from './transport'

export interface NotifierOptions {
  transport: MailTransport
  /** HMAC secret for approve links. Empty turns approve links off, and emails say to use the portal. */
  tokenSecret: string
  /** Site address used in links, no trailing slash. */
  baseUrl: string
  /** Domain for generated Message-IDs. Must be the verified sending domain when live. */
  messageIdDomain: string
}

export interface QueueArgs {
  template: EmailTemplate
  request: StudentRequest
  now: Date
  to: string
  cc?: string[]
  sequence: number
  context?: Partial<TemplateContext>
  /** When set, the email carries a one-time approve link for this step. */
  approveFor?: { stepId: string; role: string }
}

export const MAX_ATTEMPTS = 5
export const DRAIN_BATCH = 20
export const LEASE_MS = 10 * 60_000

/**
 * Builds, queues and sends the student booking emails. Every email for a request shares one subject and
 * one thread: the first carries Message-ID root, every later one sets In-Reply-To and References to it.
 * Queuing never sends. Sending only happens in drain, one claimed row at a time.
 */
export class Notifier {
  constructor(
    private readonly repo: StudentRepository,
    private readonly options: NotifierOptions,
  ) {}

  get transportName(): string {
    return this.options.transport.name
  }

  rootIdFor(requestId: string): string {
    return `<${requestId}.root@${this.options.messageIdDomain}>`
  }

  private async approveUrl(request: StudentRequest, who: { stepId: string; role: string }, now: Date): Promise<string | null> {
    if (!this.options.tokenSecret) return null
    const payload = newPayload(request.id, who.stepId, who.role, now)
    const token: ApprovalToken = { jti: payload.jti, requestId: request.id, stepId: who.stepId, role: who.role, expiresAt: new Date(payload.exp).toISOString(), usedAt: null }
    await this.repo.insertToken(token)
    return `${this.options.baseUrl}/student/approve/${signToken(payload, this.options.tokenSecret)}`
  }

  /** Returns false when this exact email was already queued, so a retried action never doubles it. */
  async queue(args: QueueArgs): Promise<boolean> {
    const { template, request, now, to, sequence } = args
    if (await this.repo.hasOutbox(request.id, template, to, sequence)) return false

    const approveUrl = args.approveFor ? await this.approveUrl(request, args.approveFor, now) : null
    const { subject, text } = renderEmail(template, { request, role: args.approveFor?.role, ...args.context, approveUrl })

    const isRoot = template === 'submitted' && sequence === 1
    const root = this.rootIdFor(request.id)
    const row: OutboxRow = {
      id: this.repo.nextId('ob'),
      requestId: request.id,
      template,
      sequence,
      to,
      cc: args.cc ?? [],
      subject,
      text,
      messageId: isRoot ? root : `<${request.id}.${template}.${sequence}.${to.replace(/[^a-z0-9]/gi, '')}@${this.options.messageIdDomain}>`,
      inReplyTo: isRoot ? null : root,
      references: isRoot ? [] : [root],
      idempotencyKey: '',
      status: 'queued',
      attempts: 0,
      nextAttemptAt: now.toISOString(),
      lockedUntil: null,
      lastError: null,
      providerId: null,
      createdAt: now.toISOString(),
      sentAt: null,
    }
    return this.repo.enqueueOutbox(row)
  }

  /** Sends what is due. A failure is counted and retried later with backoff, never thrown. */
  async drain(now: Date): Promise<{ sent: number; failed: number; suppressed: number }> {
    const tally = { sent: 0, failed: 0, suppressed: 0 }
    const rows = await this.repo.claimDueOutbox(now, DRAIN_BATCH, LEASE_MS)
    for (const row of rows) {
      if (await this.repo.isSuppressed(row.to)) {
        await this.repo.markOutboxSuppressed(row.id)
        tally.suppressed += 1
        continue
      }
      const cc: string[] = []
      for (const address of row.cc) if (!(await this.repo.isSuppressed(address))) cc.push(address)
      try {
        const providerId = await this.options.transport.send(toOutgoing(row, cc))
        await this.repo.markOutboxSent(row.id, providerId, now)
        tally.sent += 1
      } catch (err) {
        await this.repo.markOutboxFailed(row.id, err instanceof Error ? err.message : 'Send failed', now, MAX_ATTEMPTS)
        tally.failed += 1
      }
    }
    return tally
  }
}
