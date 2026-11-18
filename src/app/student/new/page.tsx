import { redirect } from 'next/navigation'
import { RequestForm, type VenueOption } from '../_components/request-form'
import { resolveStudent } from '../_server/actor'
import { getStudentService } from '../_server/student'
import { ROUTE_RULES, STUDENT_VENUES } from '../data'
import { minToTime } from '../utils'

export const dynamic = 'force-dynamic'

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const actor = await resolveStudent()
  if (!actor) redirect('/unauthorized')
  const { from } = await searchParams
  const service = await getStudentService()

  const venues: VenueOption[] = STUDENT_VENUES.map((v) => ({
    id: v.id,
    label: v.label,
    capacity: v.capacity,
    owner: ROUTE_RULES.find((r) => r.venueIds.includes(v.id))?.stages[0]?.role ?? null,
  }))

  // Editing a request that was not approved: start from its answers.
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
        venueId: r.venueId,
        date: '',
        start: minToTime(r.startMin),
        end: minToTime(r.endMin),
        attendance: String(r.attendance),
        needsAv: r.needsAv,
        guestSpeaker: r.guestSpeaker,
        description: r.description,
      }
    }
  }

  return <RequestForm venues={venues} today={service.today()} initial={initial} resubmitOf={resubmitOf} />
}
