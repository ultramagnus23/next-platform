import { redirect } from 'next/navigation'
import { resolveActor } from '../_server/actor'
import { getBookingService } from '../_server/service'

export const dynamic = 'force-dynamic'

function Bar({ percent, tone = 'bg-primary' }: { percent: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-muted" aria-hidden="true">
      <div className={`h-full ${tone}`} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
    </div>
  )
}

export default async function InsightsPage() {
  const actor = await resolveActor()
  if (!actor) redirect('/unauthorized')
  const d = await getBookingService().getInsights(actor)

  return (
    <div className="grid gap-5">
      <header>
        <h1>Insights</h1>
        <p className="text-sm text-muted-foreground">How full the rooms are, how long approval takes and where requests are stuck. Numbers cover the demo data.</p>
      </header>

      <section aria-label="Approval speed" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-2xl font-extrabold tabular-nums">{d.medianApprovalHours === null ? 'None yet' : `${d.medianApprovalHours} h`}</p>
          <p className="text-sm text-muted-foreground">Typical time from request to confirmed ({d.approvedCount} confirmed)</p>
        </div>
        {d.waitingByOffice
          .filter((o) => o.waiting > 0)
          .slice(0, 2)
          .map((o) => (
            <div key={o.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-2xl font-extrabold tabular-nums">{o.waiting}</p>
              <p className="text-sm text-muted-foreground">
                waiting at {o.label}, {o.overdue} overdue
              </p>
            </div>
          ))}
      </section>

      <section aria-label="Room use" className="grid gap-2">
        <h2>Room use, next 7 days</h2>
        <p className="text-xs text-muted-foreground">Share of opening hours taken by classes and by confirmed events.</p>
        <ul className="grid gap-2">
          {d.buildings.map((b) => (
            <li key={b.building} className="grid grid-cols-[110px_minmax(0,1fr)_120px] items-center gap-3 text-sm">
              <span>
                {b.building} <span className="text-xs text-muted-foreground">{b.rooms} rooms</span>
              </span>
              <Bar percent={b.utilisationPercent} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {b.utilisationPercent}% ({b.classPercent}% classes, {b.eventPercent}% events)
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 md:grid-cols-3">
        <section aria-label="Requests by status" className="grid content-start gap-1.5">
          <h2>Requests by status</h2>
          <ul className="grid gap-1 text-sm">
            {d.statusCounts.map((s) => (
              <li key={s.label} className="flex justify-between">
                <span>{s.label}</span>
                <span className="tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Busiest rooms" className="grid content-start gap-1.5">
          <h2>Busiest rooms</h2>
          <ul className="grid gap-1 text-sm">
            {d.busiestRooms.map((r) => (
              <li key={r.label} className="flex justify-between">
                <span>{r.label}</span>
                <span className="tabular-nums">{r.events} events</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Busiest clubs" className="grid content-start gap-1.5">
          <h2>Most requests</h2>
          <ul className="grid gap-1 text-sm">
            {d.busiestClubs.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span>{c.name}</span>
                <span className="tabular-nums">{c.requests}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
