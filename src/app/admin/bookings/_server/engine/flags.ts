import type {
  BookingRequest,
  EngineContext,
  Flag,
  FlagKind,
  Lane,
  Organisation,
  OrgStanding,
  Room,
} from '../../types'
import { daysBetween, eventStartMs, formatMinutes, isoWeekKey, todayIST } from '../../utils'
import { clashesFor } from './occupancy'

/** Flags, lanes and organisation standing. Pure: `now` is always passed in. */

const ACTIVE = ['pending', 'changes_requested', 'offered', 'confirmed']

// Weekly counts are cached per requests array: org id, week key, count.
const weekCache = new WeakMap<BookingRequest[], Map<string, number>>()

export function weekBookings(ctx: Pick<EngineContext, 'requests'>, organisationId: string, date: string): number {
  let map = weekCache.get(ctx.requests)
  if (!map) {
    map = new Map()
    for (const r of ctx.requests) {
      if (!ACTIVE.includes(r.status)) continue
      const key = `${r.organisationId}|${isoWeekKey(r.date)}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    weekCache.set(ctx.requests, map)
  }
  return map.get(`${organisationId}|${isoWeekKey(date)}`) ?? 0
}

export function weeklyCapFor(org: Organisation, defaultCap: number): number | null {
  if (org.weeklyCap !== null) return org.weeklyCap
  return org.kind === 'club' || org.kind === 'society' ? defaultCap : null
}

export function overdueHours(ctx: Pick<EngineContext, 'settings'>, request: BookingRequest, now: string): number {
  if (request.status !== 'pending') return 0
  const stage = request.stages[request.stageIndex]
  const target = ctx.settings.offices.find((o) => o.id === stage)?.responseTargetHours ?? 48
  const waited = (Date.parse(now) - Date.parse(request.stageEnteredAt)) / 3_600_000
  return waited > target ? waited : 0
}

export function flagsFor(ctx: EngineContext, request: BookingRequest, room: Room, now: string): Flag[] {
  const flags: Flag[] = []
  const org = ctx.organisations.find((o) => o.id === request.organisationId)
  const { settings } = ctx

  if (request.expectedAttendance > room.capacity) {
    const extra = request.expectedAttendance - room.capacity
    flags.push({
      kind: 'over_capacity',
      title: `${extra} more ${extra === 1 ? 'person' : 'people'} than seats`,
      body: `Expected attendance is ${request.expectedAttendance} and the room seats ${room.capacity}.`,
    })
  }

  const hoursAway = (eventStartMs(request.date, request.startMin) - Date.parse(now)) / 3_600_000
  if (hoursAway < settings.minNoticeHours) {
    flags.push({
      kind: 'short_notice',
      title: `Starts in ${Math.max(0, Math.round(hoursAway))} hours`,
      body: `Requests need ${settings.minNoticeHours} hours' notice.`,
    })
  }

  if (request.endMin > room.openUntilMin) {
    flags.push({
      kind: 'outside_hours',
      title: `Ends after the room closes at ${formatMinutes(room.openUntilMin)}`,
      body: `The room is open from ${formatMinutes(room.openFromMin)} to ${formatMinutes(room.openUntilMin)}.`,
    })
  } else if (request.startMin < room.openFromMin) {
    flags.push({
      kind: 'outside_hours',
      title: `Starts before the room opens at ${formatMinutes(room.openFromMin)}`,
      body: `The room is open from ${formatMinutes(room.openFromMin)} to ${formatMinutes(room.openUntilMin)}.`,
    })
  }

  if (org) {
    const cap = weeklyCapFor(org, settings.defaultWeeklyCap)
    if (cap !== null) {
      const count = weekBookings(ctx, org.id, request.date)
      if (count >= cap) {
        flags.push({
          kind: 'over_weekly_cap',
          title: 'Club at its weekly limit',
          body: `${org.name} has ${count} bookings in this week. The weekly limit is ${cap}.`,
        })
      }
    }
    if ((org.kind === 'club' || org.kind === 'society') && !room.bookableByClubs) {
      flags.push({
        kind: 'room_not_for_clubs',
        title: 'This room is for classes only',
        body: 'Clubs and societies cannot book this room. Offer a different one.',
      })
    }
    if (org.record.noShows >= 2) {
      flags.push({
        kind: 'poor_record',
        title: `${org.record.noShows} of their last ${Math.min(6, org.record.bookings)} rooms were never used`,
        body: 'Taken from this semester. Check-in is not tracked yet, so these numbers are mocked.',
      })
    }
  }

  if (request.endMin - request.startMin > settings.maxDurationMin) {
    const hours = Math.round(((request.endMin - request.startMin) / 60) * 10) / 10
    flags.push({
      kind: 'too_long',
      title: `Longer than ${Math.round(settings.maxDurationMin / 60)} hours`,
      body: `The booking is ${hours} hours. The usual limit for one booking is ${Math.round(settings.maxDurationMin / 60)} hours.`,
    })
  }

  const daysAhead = daysBetween(todayIST(now), request.date)
  if (daysAhead > settings.bookingWindowDays) {
    flags.push({
      kind: 'too_far_ahead',
      title: `${daysAhead} days ahead`,
      body: `Bookings can be made up to ${settings.bookingWindowDays} days ahead.`,
    })
  }

  if (request.previous) {
    flags.push({
      kind: 'reopened',
      title: 'Changed after approval',
      body: 'The organisation changed the room, time or numbers after an approval, so it started again at the first step.',
    })
  }

  const late = overdueHours(ctx, request, now)
  if (late > 0) {
    const days = Math.floor(late / 24)
    const stage = request.stages[request.stageIndex]
    const target = settings.offices.find((o) => o.id === stage)?.responseTargetHours ?? 48
    flags.push({
      kind: 'overdue',
      title: days >= 1 ? `Waiting ${days} ${days === 1 ? 'day' : 'days'}` : `Waiting ${Math.floor(late)} hours`,
      body: `This step has a ${target} hour response target.`,
    })
  }
  return flags
}

export const FLAG_CHIP: Record<FlagKind, string> = {
  over_capacity: 'Over capacity',
  short_notice: 'Short notice',
  outside_hours: 'Outside hours',
  over_weekly_cap: 'Weekly limit',
  room_not_for_clubs: 'Classes-only room',
  poor_record: 'Poor record',
  reopened: 'Changed',
  too_long: 'Long booking',
  too_far_ahead: 'Too far ahead',
  overdue: 'Overdue',
}

/** Clash, else look if any flag other than overdue, else clear. */
export function laneFor(ctx: EngineContext, request: BookingRequest, flags: Flag[]): Lane {
  if (clashesFor(ctx, request.id).length > 0) return 'clash'
  return flags.some((f) => f.kind !== 'overdue') ? 'look' : 'clear'
}

export function chipFor(lane: Lane, flags: Flag[]): string {
  if (lane === 'clash') return 'Clash'
  const first = flags.find((f) => f.kind !== 'overdue')
  if (first) return FLAG_CHIP[first.kind]
  const late = flags.find((f) => f.kind === 'overdue')
  return late ? late.title : 'Clear'
}

export function orgStanding(ctx: EngineContext, org: Organisation, now: string): OrgStanding {
  const own = ctx.requests.filter((r) => r.organisationId === org.id)
  const uses = new Map<string, number>()
  for (const r of own) uses.set(r.roomId, (uses.get(r.roomId) ?? 0) + 1)
  const top = [...uses.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const latest = own.map((r) => r.createdAt).sort().pop() ?? null
  return {
    organisationId: org.id,
    weekBookings: weekBookings(ctx, org.id, todayIST(now)),
    weeklyCap: weeklyCapFor(org, ctx.settings.defaultWeeklyCap),
    semester: org.record,
    confirmed: own.filter((r) => r.status === 'confirmed').length,
    rejected: own.filter((r) => r.status === 'rejected').length,
    cancellations: own.filter((r) => r.status === 'cancelled').length,
    displaced: own.filter((r) => r.status === 'displaced').length,
    autoApproved: own.filter((r) => r.autoApprovedBy !== null).length,
    mostUsedRoomId: top ? top[0] : null,
    lastRequestAt: latest,
  }
}
