'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MailContext } from '../_server/engine/notifications'
import type {
  ActionAvailability,
  ActionId,
  Authority,
  BookingRequest,
  Organisation,
  Room,
} from '../types'
import { OverrideDialog, ReasonDialog, ResubmitDialog, type ReasonMode } from './decision-dialogs'
import { postJson, useBookingAction } from './use-booking-action'

interface ActionPanelProps {
  request: BookingRequest
  organisation: Organisation
  room: Room
  authorities: Authority[]
  actions: ActionAvailability[]
  alternatives: Room[]
  allRooms: Room[]
  blocking: BookingRequest[]
  organisations: Organisation[]
  inConflict: boolean
  demo: boolean
  /** Top priority reason for this request, offered as a one-tap chip. */
  suggestedReasons: string[]
}

function find(actions: ActionAvailability[], id: ActionId): ActionAvailability | undefined {
  return actions.find((a) => a.action === id)
}

export function ActionPanel(props: ActionPanelProps) {
  const { request, organisation, room, authorities, actions, alternatives, allRooms, blocking, organisations, inConflict, demo } = props
  const router = useRouter()
  const { run, pending } = useBookingAction(request.id)
  const [reasonMode, setReasonMode] = useState<ReasonMode | null>(null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [remark, setRemark] = useState('')

  const mail: MailContext = useMemo(
    () => ({ request, organisation, room, authorities }),
    [request, organisation, room, authorities],
  )

  const approve = find(actions, 'approve')
  const escalate = find(actions, 'escalate')
  const changes = find(actions, 'request_changes')
  const reject = find(actions, 'reject')
  const override = find(actions, 'override_confirm')
  const cancel = find(actions, 'cancel')
  const resubmit = find(actions, 'resubmit')
  const hasDecisionControls = Boolean(approve?.visible || escalate?.visible || changes?.visible || reject?.visible || override?.visible)

  async function confirmReason(mode: ReasonMode, reason: string, alternativeRoomId: string | null) {
    const action: ActionId = mode
    const messages: Record<ReasonMode, string> = {
      reject: 'Request rejected. The organisation has been emailed.',
      request_changes: 'Changes requested. The organisation has been emailed.',
      cancel: 'Booking cancelled. The organisation has been emailed.',
    }
    const ok = await run({ action, version: request.version, reason, alternativeRoomId }, messages[mode])
    if (ok) setReasonMode(null)
  }

  async function confirmOverride(reason: string) {
    const ok = await run(
      { action: 'override_confirm', version: request.version, reason },
      'Booking confirmed. The displaced organisations have been emailed.',
    )
    if (ok) setOverrideOpen(false)
  }

  async function confirmResubmit(roomId: string | null) {
    const result = await postJson(`/demo/resubmit/${request.id}`, roomId ? { roomId } : {})
    if (result.success) {
      toast.success('Resubmitted.')
      setResubmitOpen(false)
      router.refresh()
    } else {
      toast.error(result.error ?? 'Could not resubmit.')
    }
  }

  async function addRemark() {
    const ok = await run({ action: 'remark', reason: remark }, 'Remark added.')
    if (ok) setRemark('')
  }

  function Disabled({ label, reason }: { label: string; reason: string }) {
    return (
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="block" aria-describedby="approve-reason">
              <Button className="w-full" disabled>
                {label}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
        <p id="approve-reason" className="mt-1.5 text-xs text-muted-foreground">
          {reason}
        </p>
      </div>
    )
  }

  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {approve?.visible &&
          (approve.enabled ? (
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  { action: 'approve', version: request.version },
                  approve.label === 'Give final approval' ? 'Booking confirmed.' : 'Request forwarded.',
                )
              }
            >
              {approve.label}
            </Button>
          ) : (
            <Disabled label={approve.label} reason={approve.disabledReason ?? 'Not available'} />
          ))}

        {override?.visible && (
          <Button variant="outline" disabled={pending} onClick={() => setOverrideOpen(true)}>
            {override.label}
          </Button>
        )}

        {escalate?.visible && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run({ action: 'escalate', version: request.version }, 'Escalated to the final stage.')}
          >
            {escalate.label}
          </Button>
        )}

        {(changes?.visible || reject?.visible) && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {changes?.visible && (
              <Button variant="outline" disabled={pending} onClick={() => setReasonMode('request_changes')}>
                {changes.label}
              </Button>
            )}
            {reject?.visible && (
              <Button
                variant="outline"
                className="border-red-300 text-red-800 hover:bg-red-50 hover:text-red-900 dark:text-red-300"
                disabled={pending}
                onClick={() => setReasonMode('reject')}
              >
                {reject.label}
              </Button>
            )}
          </div>
        )}

        {cancel?.visible && (
          <Button variant="outline" disabled={pending} onClick={() => setReasonMode('cancel')}>
            {cancel.label}
          </Button>
        )}

        {resubmit?.visible && demo && (
          <Button variant="outline" disabled={pending} onClick={() => setResubmitOpen(true)}>
            {resubmit.label}
          </Button>
        )}

        {inConflict && !reject?.visible && request.status === 'pending' && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Academic Booking decides between requests from different offices. You can forward or escalate your own
            requests.
          </p>
        )}
        {!hasDecisionControls && !resubmit?.visible && !cancel?.visible && (
          <p className="text-sm text-muted-foreground">No decision is needed from you on this request.</p>
        )}

        <div className="grid gap-1.5 border-t border-border pt-3">
          <Label htmlFor="remark">Internal remark</Label>
          <Textarea
            id="remark"
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Visible to admins only. Never emailed."
          />
          <Button variant="outline" size="sm" disabled={pending || remark.trim().length === 0} onClick={addRemark}>
            Add remark
          </Button>
        </div>
      </CardContent>

      <ReasonDialog
        mode={reasonMode}
        onClose={() => setReasonMode(null)}
        onConfirm={confirmReason}
        pending={pending}
        mail={mail}
        alternatives={alternatives}
        suggestedReasons={props.suggestedReasons}
      />
      <OverrideDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onConfirm={confirmOverride}
        pending={pending}
        mail={mail}
        blocking={blocking}
        organisations={organisations}
        authorities={authorities}
      />
      <ResubmitDialog
        open={resubmitOpen}
        onClose={() => setResubmitOpen(false)}
        onConfirm={confirmResubmit}
        pending={pending}
        currentRoomId={request.roomId}
        rooms={allRooms}
        suggestedRoomIds={alternatives.map((r) => r.id)}
      />
    </Card>
  )
}
