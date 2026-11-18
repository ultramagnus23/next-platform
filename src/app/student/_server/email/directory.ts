import { ADMIN_MAILBOX, FALLBACK_ROLE, ROLE_DIRECTORY } from '../../data'
import type { DirectoryEntry } from '../../types'

export interface Resolved {
  email: string
  via: 'delegate' | 'backup' | 'assignee' | 'mailbox' | 'fallback'
}

function onLeave(leave: { from: string; to: string } | undefined, now: Date): boolean {
  if (!leave) return false
  return now.getTime() >= Date.parse(leave.from) && now.getTime() <= Date.parse(leave.to)
}

/**
 * Who gets the mail for a role, decided at send time and never stored: the delegate when the assignee is
 * on leave, then the role backup if there is no delegate, then the assignee, then the role mailbox. A role
 * with no entry goes to the SLO mailbox, so nothing is dropped.
 */
export function resolveRecipient(role: string, now: Date, directory: Record<string, DirectoryEntry> = ROLE_DIRECTORY): Resolved {
  const entry = directory[role]
  if (!entry) return { email: (directory[FALLBACK_ROLE] ?? ROLE_DIRECTORY[FALLBACK_ROLE])?.mailbox ?? ADMIN_MAILBOX, via: 'fallback' }
  if (entry.assignee && onLeave(entry.assignee.leave, now)) {
    if (entry.delegate) return { email: entry.delegate, via: 'delegate' }
    if (entry.backup) return { email: entry.backup, via: 'backup' }
    return { email: entry.mailbox, via: 'mailbox' }
  }
  if (entry.assignee) return { email: entry.assignee.email, via: 'assignee' }
  return { email: entry.mailbox, via: 'mailbox' }
}

/** The backup contact for escalation. Falls back to the role mailbox when none is set. */
export function resolveBackup(role: string, directory: Record<string, DirectoryEntry> = ROLE_DIRECTORY): string {
  const entry = directory[role]
  return entry?.backup ?? entry?.mailbox ?? ROLE_DIRECTORY[FALLBACK_ROLE]?.mailbox ?? ADMIN_MAILBOX
}
