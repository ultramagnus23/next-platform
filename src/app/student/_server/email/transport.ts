import type { OutboxRow } from '../../types'

export interface OutgoingMail {
  to: string
  cc: string[]
  subject: string
  text: string
  messageId: string
  inReplyTo: string | null
  references: string[]
  idempotencyKey: string
}

export interface MailTransport {
  readonly name: string
  /** Returns the provider's own id, or null when it gives none. Throws on failure. */
  send(mail: OutgoingMail): Promise<string | null>
}

export function toOutgoing(row: OutboxRow, cc: string[]): OutgoingMail {
  return {
    to: row.to,
    cc,
    subject: row.subject,
    text: row.text,
    messageId: row.messageId,
    inReplyTo: row.inReplyTo,
    references: row.references,
    idempotencyKey: row.idempotencyKey,
  }
}

/**
 * Prints every email and sends nothing. The default everywhere except an explicit live setup. Keeps what
 * it "sent" so the demo and the tests can read it back.
 */
export class DryRunTransport implements MailTransport {
  readonly name = 'dry-run'
  readonly sent: OutgoingMail[] = []

  constructor(private readonly log: (line: string) => void = () => undefined) {}

  async send(mail: OutgoingMail): Promise<string | null> {
    this.sent.push(mail)
    this.log(`[dry-run email] to=${mail.to} cc=${mail.cc.join(',') || '-'} subject="${mail.subject}" id=${mail.messageId} in-reply-to=${mail.inReplyTo ?? '-'}`)
    return null
  }
}

/**
 * Real sending through the platform mailer. Only built when EMAIL_MODE is live AND EMAIL_DOMAIN_VERIFIED is
 * true (see student.ts), so nothing goes out from an unverified domain. The mailer is imported on demand so
 * tests and dry-run never load it.
 */
export class SmtpTransport implements MailTransport {
  readonly name = 'smtp'

  async send(mail: OutgoingMail): Promise<string | null> {
    const { sendMail } = await import('@/lib/apis/mail')
    await sendMail({
      to: mail.to,
      cc: mail.cc,
      subject: mail.subject,
      text: mail.text,
      messageId: mail.messageId,
      inReplyTo: mail.inReplyTo ?? undefined,
      references: mail.references,
    })
    return mail.messageId
  }
}
