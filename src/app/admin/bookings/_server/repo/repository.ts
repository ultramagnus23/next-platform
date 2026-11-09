import type {
  ApprovalLog,
  BookingRequest,
  BookingSettings,
  Organisation,
  OutboxEmail,
  Room,
} from '../../types'

/**
 * The only way the service reaches booking data. The demo implementation is
 * in memory. A Strapi implementation replaces it later without touching pages.
 *
 * `saveRequests` must be atomic: either every request is stored or none.
 */
export interface BookingRepository {
  listRequests(): Promise<BookingRequest[]>
  getRequest(id: string): Promise<BookingRequest | null>
  /** Insert or replace, matched by id. */
  saveRequests(requests: BookingRequest[]): Promise<void>
  appendLogs(logs: ApprovalLog[]): Promise<void>
  /** Oldest first. Pass a request id to filter. */
  listLogs(requestId?: string): Promise<ApprovalLog[]>
  appendOutbox(emails: OutboxEmail[]): Promise<void>
  /** Newest first. */
  listOutbox(): Promise<OutboxEmail[]>
  getSettings(): Promise<BookingSettings>
  saveSettings(settings: BookingSettings): Promise<void>
  listRooms(): Promise<Room[]>
  listOrganisations(): Promise<Organisation[]>
  /** Restore the seed data. */
  reset(): Promise<void>
}

export interface BookingSeedData {
  requests: BookingRequest[]
  logs: ApprovalLog[]
  outbox: OutboxEmail[]
  settings: BookingSettings
  rooms: Room[]
  organisations: Organisation[]
}
