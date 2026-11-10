import { redirect } from 'next/navigation'
import { BookingBar } from './_components/demo-bar'
import { NavStrip } from './_components/nav-strip'
import { resolveActor } from './_server/actor'
import { isDemoMode } from './_server/offices'
import { getBookingService } from './_server/service'

export const dynamic = 'force-dynamic'

export default async function BookingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')

  const service = getBookingService()
  const demo = isDemoMode()
  const [settings, rooms, organisations] = await Promise.all([service.getSettings(), service.listRooms(), service.listOrganisations()])
  const clock = service.clockState()
  const counts = await service.counts(actor)

  return (
    <div className="booking-scope mx-auto flex w-full max-w-[1500px] flex-col gap-4 pb-8">
      <BookingBar
        demo={demo}
        persona={actor.demoPersona}
        actingFor={actor.actingFor}
        offices={settings.offices.filter((o) => actor.offices.includes(o.id)).map((o) => ({ id: o.id, label: o.label }))}
        clockLabel={clock.offsetDays > 0 ? `Clock is ${clock.offsetDays} day${clock.offsetDays === 1 ? '' : 's'} ahead.` : null}
        options={{
          organisations: organisations.filter((o) => o.kind === 'club' || o.kind === 'society').map((o) => ({ id: o.id, name: o.name })),
          rooms: rooms.map((r) => ({ id: r.id, label: `${r.building}, ${r.floor} floor, ${r.name}`, capacity: r.capacity })),
          categories: settings.categories.map((c) => ({ id: c.id, label: c.label })),
          today: service.today(),
        }}
      />
      <NavStrip inbox={counts.inbox} clashes={counts.clashes} />
      {children}
    </div>
  )
}
