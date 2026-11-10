import { redirect } from 'next/navigation'
import { OrganisationsTable } from '../_components/organisations-table'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/service'

export const dynamic = 'force-dynamic'

export default async function OrganisationsPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const service = getBookingService()
  const [rows, settings] = await Promise.all([service.getOrganisations(actor), service.getSettings()])
  const withOffice = rows.map((r) => ({
    ...r,
    officeLabel: settings.offices.find((o) => o.id === r.organisation.officeId)?.shortLabel ?? r.organisation.officeId,
  }))
  return (
    <div className="grid gap-4">
      <header>
        <h1>Organisations</h1>
        <p className="text-sm text-muted-foreground">How each club and office uses rooms. Sorted with the most no-shows first.</p>
      </header>
      <OrganisationsTable rows={withOffice} />
    </div>
  )
}
