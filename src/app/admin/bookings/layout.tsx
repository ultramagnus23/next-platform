import { redirect } from 'next/navigation'
import { DemoBar } from './_components/demo-bar'
import { isDemoMode } from './_server/authorities'
import { resolveActor } from './_server/actor'
import { getBookingService } from './_server/service'
import { todayIST } from './utils'

export const dynamic = 'force-dynamic'

export default async function BookingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')

  let bar: React.ReactNode = null
  if (isDemoMode()) {
    const service = getBookingService()
    const [rooms, organisations, settings] = await Promise.all([
      service.listRooms(),
      service.listOrganisations(),
      service.getSettings(),
    ])
    bar = (
      <DemoBar
        persona={actor.demoPersona}
        options={{
          organisations: organisations.map((o) => ({ id: o.id, name: o.name })),
          rooms: rooms.map((r) => ({
            id: r.id,
            label: `${r.building} · ${r.floor} floor · ${r.name}`,
            capacity: r.capacity,
          })),
          categories: settings.categories.map((c) => ({ id: c.id, label: c.label })),
          today: todayIST(new Date().toISOString()),
        }}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 pb-8">
      {bar}
      {children}
    </div>
  )
}
