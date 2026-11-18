import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../data'
import type { RequestListRow, StudentRequest } from '../types'
import { groupRequests } from './groups'
import { deriveStatus } from './status'

const NOW = new Date('2026-11-18T05:00:00.000Z')

function row(id: string, status: StudentRequest['status'], date: string, submittedAt = '2026-11-17T05:00:00.000Z'): RequestListRow {
  const request = { id, status, date, submittedAt, lastApproverActivityAt: null } as StudentRequest
  return { request, status: deriveStatus(request, DEFAULT_CONFIG, NOW), currentRole: null }
}

describe('groupRequests', () => {
  it('orders groups by what needs attention and hides empty ones', () => {
    const groups = groupRequests(
      [row('a', 'approved', '2026-12-01'), row('b', 'pending', '2026-12-05'), row('c', 'pending', '2026-12-10', '2026-11-01T05:00:00.000Z'), row('d', 'rejected', '2026-12-02')],
      '2026-11-18',
    )
    expect(groups.map((g) => g.id)).toEqual(['taking_longer', 'pending', 'approved_upcoming', 'past'])
    expect(groups[0]?.rows[0]?.request.id).toBe('c')
  })

  it('puts an approved event that already happened in the past group', () => {
    const groups = groupRequests([row('a', 'approved', '2026-11-10')], '2026-11-18')
    expect(groups.map((g) => g.id)).toEqual(['past'])
  })

  it('returns nothing for no requests', () => {
    expect(groupRequests([], '2026-11-18')).toEqual([])
  })
})
