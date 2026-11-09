import type { BookingRepository, BookingSeedData } from './repository'

/**
 * In-memory repository for the demo. This is the only file that holds booking
 * state. Nothing else imports it: go through `./index.ts`.
 *
 * Every read and write copies, so engine code can never change stored state by
 * accident. Works on a single Node process only.
 */

function copy<T>(value: T): T {
  return structuredClone(value)
}

export class MemoryBookingRepository implements BookingRepository {
  private data: BookingSeedData

  constructor(private readonly seedFactory: () => BookingSeedData) {
    this.data = copy(seedFactory())
  }

  async listRequests() {
    return copy(this.data.requests)
  }

  async getRequest(id: string) {
    const found = this.data.requests.find((r) => r.id === id)
    return found ? copy(found) : null
  }

  async saveRequests(requests: Parameters<BookingRepository['saveRequests']>[0]) {
    const next = [...this.data.requests]
    for (const request of requests) {
      const index = next.findIndex((r) => r.id === request.id)
      if (index === -1) next.push(copy(request))
      else next[index] = copy(request)
    }
    this.data.requests = next
  }

  async appendLogs(logs: Parameters<BookingRepository['appendLogs']>[0]) {
    this.data.logs = [...this.data.logs, ...copy(logs)]
  }

  async listLogs(requestId?: string) {
    const logs = requestId ? this.data.logs.filter((l) => l.requestId === requestId) : this.data.logs
    return copy(logs).sort((a, b) => a.at.localeCompare(b.at))
  }

  async appendOutbox(emails: Parameters<BookingRepository['appendOutbox']>[0]) {
    this.data.outbox = [...this.data.outbox, ...copy(emails)]
  }

  async listOutbox() {
    return copy(this.data.outbox).sort((a, b) => b.at.localeCompare(a.at))
  }

  async getSettings() {
    return copy(this.data.settings)
  }

  async saveSettings(settings: Parameters<BookingRepository['saveSettings']>[0]) {
    this.data.settings = copy(settings)
  }

  async listRooms() {
    return copy(this.data.rooms)
  }

  async listOrganisations() {
    return copy(this.data.organisations)
  }

  async reset() {
    this.data = copy(this.seedFactory())
  }
}
