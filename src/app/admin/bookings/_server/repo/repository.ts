import type {
  ApprovalLog,
  BatchSnapshot,
  BookingRequest,
  BookingSettings,
  Organisation,
  OutboxEmail,
  Room,
  TimetableBlock,
} from '../../types'

/**
 * The only way the service reaches booking data. The demo implementation is
 * in memory. A Strapi implementation replaces it later without touching pages.
 * `saveRequests` must be atomic: every request is stored or none.
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
  /** Marks every email in a batch as failed, for example after an undo. */
  voidOutboxByBatch(batchId: string, reason: string): Promise<void>
  saveBatch(batch: BatchSnapshot): Promise<void>
  getBatch(id: string): Promise<BatchSnapshot | null>
  getSettings(): Promise<BookingSettings>
  saveSettings(settings: BookingSettings): Promise<void>
  listRooms(): Promise<Room[]>
  listOrganisations(): Promise<Organisation[]>
  /** Read-only. The timetable changes only through an import. */
  listTimetable(): Promise<readonly TimetableBlock[]>
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
  timetable: TimetableBlock[]
}
