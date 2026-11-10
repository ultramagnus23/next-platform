import type { ApprovalLog, BatchSnapshot, BookingRequest, OutboxEmail } from '../../types'
import type { BookingRepository, BookingSeedData } from './repository'

/**
 * In-memory repository for the demo. The only file that holds booking state.
 * Nothing else imports it: go through `./index.ts`.
 *
 * Requests, logs and settings are copied on every read and write so engine
 * code cannot change stored state by accident. Rooms, organisations and the
 * timetable are read-only, so they are shared. Works on one Node process only.
 */

function copy<T>(value: T): T {
  return structuredClone(value)
}

export class MemoryBookingRepository implements BookingRepository {
  private data: BookingSeedData
  private requestsById = new Map<string, BookingRequest>()
  private batches = new Map<string, BatchSnapshot>()

  constructor(private readonly seedFactory: () => BookingSeedData) {
    this.data = seedFactory()
    this.indexRequests()
  }

  private indexRequests(): void {
    this.requestsById = new Map(this.data.requests.map((r) => [r.id, r]))
  }

  async listRequests() {
    return copy(this.data.requests)
  }

  async getRequest(id: string) {
    const found = this.requestsById.get(id)
    return found ? copy(found) : null
  }

  async saveRequests(requests: BookingRequest[]) {
    const next = [...this.data.requests]
    for (const request of requests) {
      const index = next.findIndex((r) => r.id === request.id)
      if (index === -1) next.push(copy(request))
      else next[index] = copy(request)
    }
    this.data.requests = next
    this.indexRequests()
  }

  async appendLogs(logs: ApprovalLog[]) {
    this.data.logs = [...this.data.logs, ...copy(logs)]
  }

  async listLogs(requestId?: string) {
    const logs = requestId ? this.data.logs.filter((l) => l.requestId === requestId) : this.data.logs
    return copy(logs).sort((a, b) => a.at.localeCompare(b.at))
  }

  async appendOutbox(emails: OutboxEmail[]) {
    this.data.outbox = [...this.data.outbox, ...copy(emails)]
  }

  async listOutbox() {
    return copy(this.data.outbox).sort((a, b) => b.at.localeCompare(a.at))
  }

  async voidOutboxByBatch(batchId: string, reason: string) {
    this.data.outbox = this.data.outbox.map((e) => (e.batchId === batchId ? { ...e, status: 'failed' as const, failReason: reason } : e))
  }

  async saveBatch(batch: BatchSnapshot) {
    this.batches.set(batch.id, copy(batch))
  }

  async getBatch(id: string) {
    const found = this.batches.get(id)
    return found ? copy(found) : null
  }

  async getSettings() {
    return copy(this.data.settings)
  }

  async saveSettings(settings: Parameters<BookingRepository['saveSettings']>[0]) {
    this.data.settings = copy(settings)
  }

  async listRooms() {
    return this.data.rooms
  }

  async listOrganisations() {
    return this.data.organisations
  }

  async listTimetable() {
    return this.data.timetable
  }

  async reset() {
    this.data = this.seedFactory()
    this.batches = new Map()
    this.indexRequests()
  }
}
