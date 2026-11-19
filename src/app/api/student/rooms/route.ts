import { getStudentService } from '@/app/student/_server/student'
import { roomsQuerySchema } from '@/app/student/schema'
import { authorise, fail, ok } from '../helper'

export const dynamic = 'force-dynamic'

/** Rooms with their day and whether each is free in the window. Read only. */
export async function GET(request: Request) {
  try {
    const gate = await authorise()
    if ('response' in gate) return gate.response
    const url = new URL(request.url)
    const parsed = roomsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) return fail(400, 'Check the date and the times.')
    const q = parsed.data
    const result = await (await getStudentService()).findRooms({ date: q.date, from: q.from, to: q.to, seats: q.seats, needs: q.needs ? q.needs.split(',').filter(Boolean) : [], building: q.building })
    return result ? ok(result) : fail(503, 'Room availability is not available right now.')
  } catch (err) {
    platform.error('GET /api/student/rooms error:', err)
    return fail(500, 'Internal server error')
  }
}
