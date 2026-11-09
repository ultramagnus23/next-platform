/**
 * Pure date, time and label helpers for the booking portal.
 * Campus time is IST (UTC+5:30). Dates are 'YYYY-MM-DD', times are minutes since midnight.
 */

import type { Room } from './types'

export const IST_OFFSET_MIN = 330
export const SLOT_MIN = 15
export const DAY_MIN = 1440

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/** The IST calendar date for an ISO timestamp. */
export function todayIST(nowIso: string): string {
  const ms = Date.parse(nowIso) + IST_OFFSET_MIN * 60_000
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

export function weekdayOf(date: string): number {
  return new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay()
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const day = weekdayOf(date)
  return addDays(date, day === 0 ? -6 : 1 - day)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Epoch milliseconds when an event starts. */
export function eventStartMs(date: string, startMin: number): number {
  return Date.parse(`${date}T00:00:00Z`) + (startMin - IST_OFFSET_MIN) * 60_000
}

export function hoursUntilStart(date: string, startMin: number, nowIso: string): number {
  return (eventStartMs(date, startMin) - Date.parse(nowIso)) / 3_600_000
}

/** ISO week key such as '2026-W46'. */
export function isoWeekKey(date: string): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

/** 'Thu 12 Nov' */
export function formatDate(date: string): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`))
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** '6:00 PM' */
export function formatMinutes(min: number): string {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${pad(m)} ${suffix}`
}

/** '18:00' */
export function formatClock(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

/** '6:00 PM to 8:00 PM' */
export function formatRange(startMin: number, endMin: number): string {
  return `${formatMinutes(startMin)} to ${formatMinutes(endMin)}`
}

/** 'Thu 12 Nov, 6:00 PM to 8:00 PM' */
export function formatDateTime(date: string, startMin: number, endMin: number): string {
  return `${formatDate(date)}, ${formatRange(startMin, endMin)}`
}

/** 'AC-02 · First floor · 201' */
export function formatVenue(room: Pick<Room, 'building' | 'floor' | 'name'>): string {
  return `${room.building} · ${room.floor} floor · ${room.name}`
}

/** '2 days', '5 hours', '12 minutes' */
export function humanDuration(ms: number): string {
  const abs = Math.abs(ms)
  const minutes = Math.round(abs / 60_000)
  if (minutes < 60) return `${Math.max(minutes, 1)} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** '4 min ago' */
export function relativeTime(iso: string, nowIso: string): string {
  const diff = Date.parse(nowIso) - Date.parse(iso)
  if (!Number.isFinite(diff)) return ''
  const minutes = Math.round(Math.abs(diff) / 60_000)
  const suffix = diff >= 0 ? 'ago' : 'from now'
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ${suffix}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ${suffix}`
  return `${Math.round(hours / 24)} d ${suffix}`
}

export function isOnSlotGrid(min: number): boolean {
  return Number.isInteger(min) && min % SLOT_MIN === 0
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'changes_requested':
      return 'Changes requested'
    case 'confirmed':
      return 'Confirmed'
    case 'rejected':
      return 'Rejected'
    case 'withdrawn':
      return 'Withdrawn'
    case 'cancelled':
      return 'Cancelled'
    case 'displaced':
      return 'Displaced'
    default:
      return status
  }
}

/** 'Thu 12 Nov, 6:00 PM' for an ISO timestamp, in campus time. */
export function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const local = new Date(ms + IST_OFFSET_MIN * 60_000)
  const date = local.toISOString().slice(0, 10)
  return `${formatDate(date)}, ${formatMinutes(local.getUTCHours() * 60 + local.getUTCMinutes())}`
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: string): string {
  const d = new Date(Date.parse(`${startOfMonth(date)}T00:00:00Z`))
  d.setUTCMonth(d.getUTCMonth() + 1, 0)
  return d.toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number): string {
  const d = new Date(Date.parse(`${startOfMonth(date)}T00:00:00Z`))
  d.setUTCMonth(d.getUTCMonth() + months, 1)
  return d.toISOString().slice(0, 10)
}

/** 'November 2026' */
export function formatMonth(date: string): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`))
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
