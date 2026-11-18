import type { RequestListRow } from '../types'

export type GroupId = 'taking_longer' | 'pending' | 'approved_upcoming' | 'drafts' | 'past'

export interface RequestGroup {
  id: GroupId
  title: string
  rows: RequestListRow[]
}

const TITLES: Record<GroupId, string> = {
  taking_longer: 'Taking longer than usual',
  pending: 'Pending',
  approved_upcoming: 'Approved, upcoming',
  drafts: 'Drafts',
  past: 'Past and closed',
}

/**
 * Groups by what needs attention. Only groups that have rows are returned, in this order. A request
 * counts as past once its event date is before today (IST), or when it is not approved or cancelled.
 */
export function groupRequests(rows: RequestListRow[], todayIst: string): RequestGroup[] {
  const buckets: Record<GroupId, RequestListRow[]> = { taking_longer: [], pending: [], approved_upcoming: [], drafts: [], past: [] }
  for (const row of rows) {
    const shown = row.status.shown
    if (shown === 'taking_longer') buckets.taking_longer.push(row)
    else if (shown === 'pending') buckets.pending.push(row)
    else if (shown === 'draft') buckets.drafts.push(row)
    else if (shown === 'approved' && row.request.date >= todayIst) buckets.approved_upcoming.push(row)
    else buckets.past.push(row)
  }
  const byDate = (a: RequestListRow, b: RequestListRow) => a.request.date.localeCompare(b.request.date)
  buckets.past.sort((a, b) => byDate(b, a))
  const order: GroupId[] = ['taking_longer', 'pending', 'approved_upcoming', 'drafts', 'past']
  return order.filter((id) => buckets[id].length > 0).map((id) => ({ id, title: TITLES[id], rows: id === 'past' ? buckets[id] : buckets[id].sort(byDate) }))
}
