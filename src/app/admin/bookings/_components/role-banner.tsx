import { ShieldCheck } from 'lucide-react'
import type { Actor, Authority } from '../types'

/** Says who is signed in, which office they act for, and what that lets them do. */
export function RoleBanner({ actor, authorities }: { actor: Actor; authorities: Authority[] }) {
  const labels = actor.authorities.map((id) => authorities.find((a) => a.id === id)?.shortLabel ?? id)
  const isFinal = actor.isSuperAdmin || actor.authorities.some((id) => authorities.find((a) => a.id === id)?.isFinal)

  const title = actor.isSuperAdmin
    ? 'Super admin: you act for every office'
    : `You act for ${labels.join(' and ')}`

  const can: string[] = actor.isSuperAdmin
    ? ['Decide any request at any stage', 'Resolve conflicts and override confirmed bookings', 'Change priority tiers, approval chains and auto-approval rules']
    : isFinal
      ? ['Give final approval and confirm bookings', 'Decide conflicts between offices', 'Override or cancel a confirmed booking, with a reason']
      : [
          `Approve and forward requests from organisations governed by ${labels.join(' or ')}`,
          'Escalate a conflicted request to Academic Booking',
          'Request changes or reject your own office’s requests',
        ]

  return (
    <section
      aria-label="Your role"
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start sm:gap-4"
    >
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{actor.email}</p>
        <ul className="mt-1.5 grid gap-0.5 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-x-6">
          {can.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {!isFinal && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Academic Booking decides between requests from different offices.
          </p>
        )}
      </div>
    </section>
  )
}
