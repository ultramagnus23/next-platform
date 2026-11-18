import { roomIdFor, seedActor, seedSuperAdmin } from '@/app/admin/bookings/_server/repo/fixtures'
import type { BookingService } from '@/app/admin/bookings/_server/service'
import type { CategoryId as AdminCategory, ApprovalLog, BookingRequest } from '@/app/admin/bookings/types'
import type { CategoryId, NewRequestInput, StepState, StudentActor } from '../types'

/** What the student side needs to know about its linked admin request. */
export interface AdminView {
  /** The admin status, mapped to the student stored status. */
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  stages: Array<{ role: string; state: StepState; decidedAt: string | null; decidedBy: string | null }>
  /** The office's reason when rejected. */
  reason: string | null
  lastApproverActivityAt: string | null
  logs: ApprovalLog[]
}

export type BridgeResult = { ok: true } | { ok: false; error: string }

/**
 * The seam between the student portal and the admin portal. The student side keeps its own tables and the
 * admin side stays the system of record for rooms and decisions. Tests swap in a fake.
 */
export interface Bridge {
  canMirror(venueId: string): boolean
  mirror(actor: StudentActor, input: NewRequestInput): Promise<{ ok: true; adminId: string } | { ok: false; error: string }>
  view(adminId: string): Promise<AdminView | null>
  decide(adminId: string, decision: 'approve' | 'reject', reason?: string): Promise<BridgeResult>
  withdraw(adminId: string): Promise<void>
  note(adminId: string, text: string): Promise<void>
  advanceDays(days: number): Promise<void>
}

/**
 * Student venue id to the admin room that stands for it, as [building, room name]. Only spaces that exist in
 * the admin room list are bridged. Takshila and the Residence Hall have no admin room, so those requests stay
 * on the student side. The Multi-Purpose Hall match is a guess (the admin list has "MPH" in the Admin Block
 * with 200 seats, the brief says 400) and is flagged for the offices to confirm.
 */
const ADMIN_ROOM: Record<string, [string, string]> = {
  'dr-reddys-auditorium': ['AC-01', 'Dr. Reddy’s Auditorium'],
  'black-box-theatre': ['AC-04', 'BlackBox'],
  'dance-studio': ['AC-04', 'Dance Studio'],
  'multi-purpose-hall': ['Admin Block', 'MPH'],
}

const ADMIN_CATEGORY: Record<CategoryId, AdminCategory> = {
  extracurricular: 'club_event',
  academic_society: 'seminar',
  performing_arts: 'cultural',
  other: 'other',
}

const WITHDRAWN_TEXT = 'Withdrawn by the club.'

function statusOf(admin: BookingRequest['status']): AdminView['status'] {
  if (admin === 'confirmed') return 'approved'
  if (admin === 'rejected') return 'rejected'
  if (admin === 'pending' || admin === 'changes_requested' || admin === 'offered') return 'pending'
  return 'cancelled'
}

const APPROVAL_ACTIONS = new Set(['forwarded', 'confirmed', 'auto_approved', 'override_confirmed'])

export class AdminBridge implements Bridge {
  constructor(private readonly getAdmin: () => Promise<BookingService>) {}

  canMirror(venueId: string): boolean {
    return venueId in ADMIN_ROOM
  }

  async mirror(actor: StudentActor, input: NewRequestInput) {
    const admin = await this.getAdmin()
    const target = ADMIN_ROOM[input.venueId]
    if (!target) return { ok: false as const, error: 'This space is not in the admin portal.' }
    const roomId = roomIdFor(target[0], target[1])
    const [rooms, organisations] = await Promise.all([admin.listRooms(), admin.listOrganisations()])
    if (!rooms.some((r) => r.id === roomId)) return { ok: false as const, error: 'This space is not in the admin portal.' }
    const name = actor.organisationName.replace(/\s*\(sample\)\s*$/i, '').toLowerCase()
    const organisation = organisations.find((o) => o.name.toLowerCase() === name)
    if (!organisation) return { ok: false as const, error: 'Your club is not set up in the admin portal yet. Email the Student Life Office.' }

    const result = await admin.submit({
      organisationId: organisation.id,
      submittedBy: actor.email,
      eventName: input.eventName,
      category: ADMIN_CATEGORY[input.category],
      description: input.description,
      roomId,
      date: input.date,
      startMin: input.startMin,
      endMin: input.endMin,
      expectedAttendance: input.attendance,
      needs: input.needsAv ? ['Projector', 'Mic'] : [],
    })
    if (!result.ok) return { ok: false as const, error: result.error }
    const created = result.data.requests[0]
    return created ? { ok: true as const, adminId: created.id } : { ok: false as const, error: 'The admin portal did not return the request.' }
  }

  async view(adminId: string): Promise<AdminView | null> {
    const admin = await this.getAdmin()
    const detail = await admin.getRequestDetail(seedSuperAdmin(), adminId)
    if (!detail.ok) return null
    const { request, logs, offices } = detail.data
    const status = statusOf(request.status)
    const approvals = logs.filter((l) => APPROVAL_ACTIONS.has(l.action)).sort((a, b) => a.at.localeCompare(b.at))

    const stages = request.stages.map((office, i) => {
      const label = offices.find((o) => o.id === office)?.shortLabel ?? office
      const log = approvals[i]
      let state: StepState
      if (status === 'approved' || i < request.stageIndex) state = 'approved'
      else if (i === request.stageIndex) state = status === 'rejected' ? 'rejected' : status === 'pending' ? 'current' : 'not_started'
      else state = 'not_started'
      return { role: label, state, decidedAt: state === 'approved' ? (log?.at ?? null) : null, decidedBy: state === 'approved' ? (log?.actorEmail ?? null) : null }
    })

    const rejection = [...logs].reverse().find((l) => l.action === 'rejected')
    const acted = logs.filter((l) => !l.internal && l.actorRole !== 'organisation' && l.actorRole !== 'system' && l.action !== 'submitted')
    return {
      status,
      stages,
      reason: status === 'rejected' ? (rejection?.reason ?? null) : null,
      lastApproverActivityAt: acted.length ? (acted.map((l) => l.at).sort().at(-1) ?? null) : null,
      logs: logs.filter((l) => !l.internal),
    }
  }

  async decide(adminId: string, decision: 'approve' | 'reject', reason?: string): Promise<BridgeResult> {
    const admin = await this.getAdmin()
    const detail = await admin.getRequestDetail(seedSuperAdmin(), adminId)
    if (!detail.ok) return { ok: false, error: detail.error }
    const { request } = detail.data
    const office = request.stages[request.stageIndex]
    if (!office) return { ok: false, error: 'No office is waiting on this request.' }
    const result = await admin.performAction(seedActor(office), adminId, { action: decision, version: request.version, reason })
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }

  async withdraw(adminId: string): Promise<void> {
    const admin = await this.getAdmin()
    const detail = await admin.getRequestDetail(seedSuperAdmin(), adminId)
    if (!detail.ok || (detail.data.request.status !== 'pending' && detail.data.request.status !== 'changes_requested')) return
    await admin.performAction(seedSuperAdmin(), adminId, { action: 'reject', version: detail.data.request.version, reason: WITHDRAWN_TEXT })
  }

  async note(adminId: string, text: string): Promise<void> {
    const admin = await this.getAdmin()
    await admin.performAction(seedSuperAdmin(), adminId, { action: 'note', reason: text })
  }

  async advanceDays(days: number): Promise<void> {
    await (await this.getAdmin()).advanceDays(days)
  }
}
