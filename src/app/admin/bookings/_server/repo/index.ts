import { MemoryBookingRepository } from './memory'
import type { BookingRepository, BookingSeedData } from './repository'
import { buildSeed } from './seed'

/**
 * The one place that decides which repository the app uses.
 * Today: in memory. Later: a Strapi implementation returned from here.
 */

const GLOBAL_KEY = '__bookingRepositoryV2__'

type GlobalWithRepo = typeof globalThis & { [GLOBAL_KEY]?: BookingRepository }

export function getBookingRepository(): BookingRepository {
  const holder = globalThis as GlobalWithRepo
  const existing = holder[GLOBAL_KEY]
  if (existing) return existing
  const created = new MemoryBookingRepository(() => buildSeed(new Date().toISOString()))
  holder[GLOBAL_KEY] = created
  return created
}

/** An isolated repository with exactly the data you give it. For scenario checks. */
export function createIsolatedRepository(data: BookingSeedData): BookingRepository {
  return new MemoryBookingRepository(() => structuredClone(data))
}

export type { BookingRepository, BookingSeedData } from './repository'
