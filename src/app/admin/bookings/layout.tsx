import { redirect } from 'next/navigation'
import { BookingBar } from './_components/demo-bar'
import { resolveActor } from './_server/actor'
import { isDemoMode, isSandbox } from './_server/offices'
import { getBookingService } from './_server/booking'

export const dynamic = 'force-dynamic'

export default async function BookingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')

  const service = (await getBookingService())
  const demo = isDemoMode()
  const [settings, rooms, organisations] = await Promise.all([service.getSettings(), service.listRooms(), service.listOrganisations()])
  const clock = service.clockState()

  return (
    <div className="booking-scope mx-auto flex w-full max-w-[1500px] flex-col gap-4 pb-8">
      <BookingBar
        demo={demo}
        sandbox={isSandbox()}
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
      {children}
    </div>
  )
}
