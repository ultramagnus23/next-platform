import type { BookingRequest, EventCategory, PriorityRank } from '../../types'
import { humanDuration } from '../../utils'

/**
 * Advisory ranking for a conflict group.
 * Reads the event category and submission time only. It never looks at the
 * organisation or its authority (decision D6).
 */

const UNKNOWN_TIER = 99

interface Ranked {
  request: BookingRequest
  tier: number
  label: string
}

function describe(request: BookingRequest, categories: EventCategory[]): Ranked {
  const category = categories.find((c) => c.id === request.category)
  return { request, tier: category?.tier ?? UNKNOWN_TIER, label: category?.label ?? 'Other' }
}

function compare(a: Ranked, b: Ranked): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  const byTime = Date.parse(a.request.createdAt) - Date.parse(b.request.createdAt)
  if (byTime !== 0) return byTime
  return a.request.id.localeCompare(b.request.id)
}

function reasonsAgainst(self: Ranked, other: Ranked): string[] {
  const reasons: string[] = []
  if (self.tier < other.tier) {
    reasons.push(`${self.label} (tier ${self.tier}) ranks above ${other.label} (tier ${other.tier})`)
  } else if (self.tier > other.tier) {
    reasons.push(`${self.label} (tier ${self.tier}) ranks below ${other.label} (tier ${other.tier})`)
  } else {
    reasons.push(`${self.label} and ${other.label} are in the same tier (${self.tier})`)
    const diff = Date.parse(self.request.createdAt) - Date.parse(other.request.createdAt)
    if (diff !== 0) {
      reasons.push(`Submitted ${humanDuration(diff)} ${diff < 0 ? 'earlier' : 'later'}`)
    } else {
      reasons.push('Submitted at the same time')
    }
  }
  return reasons
}

export function rankGroup(members: BookingRequest[], categories: EventCategory[]): PriorityRank[] {
  const ranked = members.map((m) => describe(m, categories)).sort(compare)
  const top = ranked[0]
  return ranked.map((entry, index) => {
    let reasons: string[] = []
    if (index === 0) {
      for (const other of ranked.slice(1)) reasons = reasons.concat(reasonsAgainst(entry, other))
    } else if (top) {
      reasons = reasonsAgainst(entry, top)
    }
    return { requestId: entry.request.id, rank: index + 1, tier: entry.tier, reasons }
  })
}
