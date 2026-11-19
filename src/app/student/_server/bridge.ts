import { resolveStages } from '@/app/admin/bookings/_server/engine/workflow'
import { roomIdFor, seedActor, seedSuperAdmin } from '@/app/admin/bookings/_server/repo/fixtures'
import type { BookingService } from '@/app/admin/bookings/_server/service'
import type { CategoryId as AdminCategory, ApprovalLog, BookingRequest, TimelineBlock } from '@/app/admin/bookings/types'
import { formatVenue } from '@/app/admin/bookings/utils'
import type { ApprovalPath, CategoryId, NewRequestInput, StepState, StudentActor } from '../types'

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

/** One room as the club sees it. Other clubs' event names are never included. */
export interface RoomChoice {
  id: string
  label: string
  building: string
  floor: string
  name: string
  capacity: number
  features: string[]
  free: boolean
  /** What is in the room that day. Anything that is not a class is just "Booked". */
  blocks: Array<{ id: string; kind: TimelineBlock['kind']; label: string; startMin: number; endMin: number }>
}

export interface RoomQuery {
  date: string
  from: number
  to: number
  seats?: number
  needs?: string[]
  building?: string
}

export interface RoomsResult {
  rooms: RoomChoice[]
  buildings: string[]
  freeCount: number
  total: number
}

/**
 * The seam between the student portal and the admin portal. The student side keeps its own tables and the
 * admin side stays the system of record for rooms and decisions. Tests swap in a fake.
 */
export interface Bridge {
  /** The admin room for a space id (an admin room id, or one of the old named spaces), or null. */
  room(venueId: string): Promise<{ id: string; label: string; capacity: number } | null>
  rooms(query: RoomQuery): Promise<RoomsResult>
  /** The offices a request goes through for this club and event type, as the admin portal sets them. */
  pathFor(orgName: string, category: CategoryId): Promise<ApprovalPath | null>
  mirror(actor: StudentActor, input: NewRequestInput): Promise<{ ok: true; adminId: string } | { ok: false; error: string }>
  view(adminId: string): Promise<AdminView | null>
  decide(adminId: string, decision: 'approve' | 'reject', reason?: string): Promise<BridgeResult>
  withdraw(adminId: string): Promise<BridgeResult>
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

// An automatic clearance by rule is not an office approving, so it is not listed here.
const APPROVAL_ACTIONS = new Set(['forwarded', 'confirmed', 'override_confirmed'])

export class AdminBridge implements Bridge {
  constructor(private readonly getAdmin: () => Promise<BookingService>) {}

  private async resolveRoomId(venueId: string): Promise<string> {
    const alias = ADMIN_ROOM[venueId]
    return alias ? roomIdFor(alias[0], alias[1]) : venueId
  }

  async room(venueId: string) {
    const admin = await this.getAdmin()
    const id = await this.resolveRoomId(venueId)
    const found = (await admin.listRooms()).find((r) => r.id === id)
    return found ? { id: found.id, label: formatVenue(found), capacity: found.capacity } : null
  }

  async rooms(query: RoomQuery): Promise<RoomsResult> {
    const admin = await this.getAdmin()
    const data = await admin.getRoomsDay({ date: query.date, from: query.from, to: query.to, minSeats: query.seats || undefined, needs: query.needs?.length ? query.needs : undefined, building: query.building, freeOnly: false })
    const all = await admin.listRooms()
    const rooms: RoomChoice[] = data.rows
      .filter((r) => r.room.bookableByClubs)
      .map((r) => ({
        id: r.room.id,
        label: formatVenue(r.room),
        building: r.room.building,
        floor: r.room.floor,
        name: r.room.name,
        capacity: r.room.capacity,
        features: r.room.features,
        free: r.freeInWindow,
        blocks: r.blocks.map((b) => ({ id: b.id, kind: b.kind, label: b.kind === 'class' ? b.label : 'Booked', startMin: b.startMin, endMin: b.endMin })),
      }))
    return { rooms, buildings: [...new Set(all.filter((r) => r.bookableByClubs).map((r) => r.building))], freeCount: rooms.filter((r) => r.free).length, total: rooms.length }
  }

  async pathFor(orgName: string, category: CategoryId): Promise<ApprovalPath | null> {
    const admin = await this.getAdmin()
    const name = orgName.replace(/\s*\(sample\)\s*$/i, '').toLowerCase()
    const org = (await admin.listOrganisations()).find((o) => o.name.toLowerCase() === name)
    if (!org) return null
    const settings = await admin.getSettings()
    const stages = resolveStages(org, ADMIN_CATEGORY[category], settings.workflows).map((office) => ({
      role: settings.offices.find((o) => o.id === office)?.shortLabel ?? office,
      why: 'This office decides in the admin portal',
      confirmed: true,
    }))
    return { stages, noticeDays: null, latestSubmitAt: null, tooLate: false, nextBestDate: null, routeConfirmed: true, flags: [] }
  }

  async mirror(actor: StudentActor, input: NewRequestInput) {
    const admin = await this.getAdmin()
    const roomId = await this.resolveRoomId(input.venueId)
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

  async withdraw(adminId: string): Promise<BridgeResult> {
    const admin = await this.getAdmin()
    const detail = await admin.getRequestDetail(seedSuperAdmin(), adminId)
    if (!detail.ok) return { ok: false, error: detail.error }
    const status = detail.data.request.status
    if (status !== 'pending' && status !== 'changes_requested') return { ok: false, error: 'An office already decided this request, so it cannot be cancelled here.' }
    const result = await admin.performAction(seedSuperAdmin(), adminId, { action: 'reject', version: detail.data.request.version, reason: WITHDRAWN_TEXT })
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }

  async note(adminId: string, text: string): Promise<void> {
    const admin = await this.getAdmin()
    await admin.performAction(seedSuperAdmin(), adminId, { action: 'note', reason: text })
  }

  async advanceDays(days: number): Promise<void> {
    await (await this.getAdmin()).advanceDays(days)
  }
}
