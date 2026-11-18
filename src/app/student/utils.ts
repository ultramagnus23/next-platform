/** Ashoka runs on Asia/Kolkata, which has no daylight saving: always UTC+5:30. */
export const IST_OFFSET_MIN = 330
export const MS_PER_DAY = 86_400_000

/** The instant an event starts, from its IST date (YYYY-MM-DD) and start time in minutes after midnight. */
export function eventInstant(date: string, startMin: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, startMin) - IST_OFFSET_MIN * 60_000)
}

/** The IST calendar date (YYYY-MM-DD) an instant falls on. */
export function istDateOf(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10)
}

/** Minutes after midnight IST. */
export function istMinuteOf(instant: Date): number {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MIN * 60_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * MS_PER_DAY)
}

/** The latest of the instants given, ignoring nulls. Null when there are none. */
export function latestOf(values: Array<string | null>): Date | null {
  let best: Date | null = null
  for (const v of values) {
    if (!v) continue
    const d = new Date(v)
    if (!Number.isNaN(d.getTime()) && (best === null || d.getTime() > best.getTime())) best = d
  }
  return best
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Fri 5 Dec" from a YYYY-MM-DD date. Absolute, never "tomorrow". */
export function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  return `${DAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
}

/** "6:30pm" from minutes after midnight. */
export function formatTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** "Tue 25 Nov, 9:06pm" in IST from an instant. */
export function formatInstant(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60_000)
  const date = shifted.toISOString().slice(0, 10)
  return `${formatDay(date)}, ${formatTime(shifted.getUTCHours() * 60 + shifted.getUTCMinutes())}`
}

/** "18:30" for a time input, from minutes after midnight. */
export function minToTime(min: number): string {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
