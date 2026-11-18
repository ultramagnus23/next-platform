import { APPROVAL_SECRET } from '../../_server/config'
import { getStudentService } from '../../_server/student'
import { formatDay, formatTime } from '../../utils'
import { ApproveForm } from './approve-form'

export const dynamic = 'force-dynamic'

/**
 * Opened from the link in an email. Showing this page never changes anything. The buttons below post to the
 * approve route, which spends the link once.
 */
export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await (await getStudentService()).previewApproval(token, APPROVAL_SECRET)

  if (!result.ok) {
    return (
      <main className="mx-auto grid max-w-xl gap-3 p-4">
        <h1 className="text-2xl font-semibold">This link cannot be used</h1>
        <p role="alert">{result.error}</p>
        <p className="text-sm text-muted-foreground">Nothing was changed.</p>
      </main>
    )
  }

  const { request, role, remainingRoles } = result.data
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-4">
      <header>
        <p className="text-sm text-muted-foreground">Decision for {role}</p>
        <h1 className="text-2xl font-semibold">{request.eventName}</h1>
      </header>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Club</dt>
        <dd>{request.organisationName}</dd>
        <dt className="text-muted-foreground">Space</dt>
        <dd>{request.venueLabel}</dd>
        <dt className="text-muted-foreground">When</dt>
        <dd className="tabular-nums">
          {formatDay(request.date)}, {formatTime(request.startMin)} to {formatTime(request.endMin)}
        </dd>
        <dt className="text-muted-foreground">People</dt>
        <dd className="tabular-nums">{request.attendance}</dd>
        <dt className="text-muted-foreground">After you</dt>
        <dd>{remainingRoles.length > 0 ? remainingRoles.join(', ') : 'Nobody. Your decision is the last one.'}</dd>
      </dl>
      <ApproveForm token={token} />
    </main>
  )
}
