import { redirect } from 'next/navigation'
import { RoomFinder } from '../_components/room-finder'
import { resolveStudent } from '../_server/actor'
import { getStudentService } from '../_server/student'
import { addDays, istDateOf, minToTime } from '../utils'

export const dynamic = 'force-dynamic'

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const actor = await resolveStudent()
  if (!actor) redirect('/unauthorized')
  const { from } = await searchParams
  const service = await getStudentService()
  const today = service.today()
  const defaultDate = istDateOf(addDays(service.now(), 7))

  // Editing a request that was not approved: start from its answers. The date is left for the club to pick.
  let initial = null
  let resubmitOf: string | null = null
  if (from) {
    const previous = await service.getDetail(actor, from)
    if (previous.ok && previous.data.request.status === 'rejected') {
      const r = previous.data.request
      resubmitOf = r.id
      initial = {
        eventName: r.eventName,
        category: r.category,
        from: minToTime(r.startMin),
        to: minToTime(r.endMin),
        seats: String(r.attendance),
        needs: r.needsAv ? ['Projector', 'Mic'] : [],
        description: r.description,
      }
    }
  }

  return <RoomFinder today={today} defaultDate={defaultDate} initial={initial} resubmitOf={resubmitOf} />
}
