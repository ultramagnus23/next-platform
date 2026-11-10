import type { BookingRequest, EventCategory, PriorityRank } from '../../types'
import { humanDuration } from '../../utils'

/**
 * Advisory ranking for a clash. Reads event category and submission time only.
 * It never looks at the organisation or its office (decision D5).
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
  if (self.tier !== other.tier) {
    return [`${self.label} is tier ${self.tier}, ${other.label.toLowerCase()} is tier ${other.tier}`]
  }
  const diff = Date.parse(self.request.createdAt) - Date.parse(other.request.createdAt)
  const reasons = [`Both are tier ${self.tier}`]
  reasons.push(diff === 0 ? 'Submitted at the same time' : `Submitted ${humanDuration(diff)} ${diff < 0 ? 'earlier' : 'later'}`)
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
      // A lower-ranked request is compared with the winner, reversed so it reads naturally.
      reasons = reasonsAgainst(top, entry)
    }
    return { requestId: entry.request.id, rank: index + 1, tier: entry.tier, reasons }
  })
}
