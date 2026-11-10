import { redirect } from 'next/navigation'
import { SettingsView } from '../_components/settings-view'
import { resolveActor } from '../_server/actor'
import { isDemoMode } from '../_server/offices'
import { getBookingService } from '../_server/service'

export const dynamic = 'force-dynamic'

export default async function BookingSettingsPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const service = getBookingService()
  const [settings, rooms] = await Promise.all([service.getSettings(), service.listRooms()])

  return (
    <>
      <header>
        <h1>Rules</h1>
        <p className="text-sm text-muted-foreground">Priority tiers, approval chains, limits and auto-approval. Only a super admin can change them.</p>
      </header>
      <SettingsView initial={settings} rooms={rooms} canEdit={actor.canEditRules} demo={isDemoMode()} />
    </>
  )
}
