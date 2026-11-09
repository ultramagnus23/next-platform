import { redirect } from 'next/navigation'
import { BookingsPageHeader } from '../_components/page-header'
import { SettingsView } from '../_components/settings-view'
import { resolveActor } from '../_server/actor'
import { isDemoMode } from '../_server/authorities'
import { getBookingService } from '../_server/service'

export const dynamic = 'force-dynamic'

export default async function BookingSettingsPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const service = getBookingService()
  const [settings, rooms] = await Promise.all([service.getSettings(), service.listRooms()])

  return (
    <>
      <BookingsPageHeader
        title="Settings"
        subheading="Priority tiers, approval chains, auto-approval rules and room details."
        crumbs={[{ label: 'Settings' }]}
      />
      <SettingsView initial={settings} rooms={rooms} canEdit={actor.canEditSettings} demo={isDemoMode()} />
    </>
  )
}
