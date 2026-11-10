import { z } from 'zod'

/** Request and settings validation shared by pages and routes. */

export const officeIdSchema = z.enum(['slo', 'oa', 'cfe', 'acad'])
export const categoryIdSchema = z.enum(['academic', 'seminar', 'workshop', 'competition', 'club_event', 'cultural', 'meeting', 'other'])
export const personaSchema = z.enum(['slo_approver', 'oa_approver', 'cfe_approver', 'acad_approver', 'super_admin'])

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
const minuteSchema = z.number().int().min(0).max(1440)
const reasonSchema = z.string().max(2000)

export const actionInputSchema = z.object({
  action: z.enum(['approve', 'offer_room', 'accept_offer', 'escalate', 'request_changes', 'reject', 'resubmit', 'override_confirm', 'cancel', 'note']),
  version: z.number().int().min(1).optional(),
  reason: reasonSchema.optional(),
  roomId: z.string().min(1).optional(),
  changes: z
    .object({
      roomId: z.string().min(1).optional(),
      date: dateSchema.optional(),
      startMin: minuteSchema.optional(),
      endMin: minuteSchema.optional(),
      expectedAttendance: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
})

export const inboxFiltersSchema = z.object({
  lane: z.enum(['clash', 'look', 'clear']).optional(),
  q: z.string().max(80).optional(),
  office: officeIdSchema.optional(),
  building: z.string().min(1).optional(),
  category: categoryIdSchema.optional(),
  organisationId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
})

export const bulkApproveSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), version: z.number().int().min(1) })).min(1).max(200),
})

export const undoSchema = z.object({ batchId: z.string().min(1) })
export const actingForSchema = z.object({ office: officeIdSchema })

export const resolveSchema = z.object({
  winnerId: z.string().min(1),
  versions: z.record(z.string(), z.number().int().min(1)),
  others: z.array(
    z.object({
      id: z.string().min(1),
      action: z.enum(['offer_room', 'reject', 'request_changes']),
      reason: reasonSchema,
      roomId: z.string().min(1).optional(),
    }),
  ),
  dryRun: z.boolean().optional(),
})

export const demoSubmitSchema = z.object({
  organisationId: z.string().min(1),
  eventName: z.string().trim().min(1).max(200),
  category: categoryIdSchema,
  description: z.string().max(2000).default(''),
  roomId: z.string().min(1),
  date: dateSchema,
  startMin: minuteSchema,
  endMin: minuteSchema,
  expectedAttendance: z.number().int().min(1).max(1000),
})

export const demoResubmitSchema = z.object({
  roomId: z.string().min(1).optional(),
  date: dateSchema.optional(),
  startMin: minuteSchema.optional(),
  endMin: minuteSchema.optional(),
})

export const advanceClockSchema = z.object({ days: z.number().int().min(1).max(14).default(1) })

export const roomsDayQuerySchema = z.object({
  date: dateSchema,
  from: z.coerce.number().int().min(0).max(1440).optional(),
  to: z.coerce.number().int().min(0).max(1440).optional(),
  minSeats: z.coerce.number().int().min(0).max(1000).optional(),
  needs: z.string().optional(),
  building: z.string().min(1).optional(),
  freeOnly: z.enum(['true', 'false', '1', '0']).optional(),
})

export const freeRoomsQuerySchema = z.object({
  date: dateSchema,
  startMin: z.coerce.number().int().min(0).max(1440),
  endMin: z.coerce.number().int().min(0).max(1440),
  minSeats: z.coerce.number().int().min(0).max(1000).default(0),
  needs: z.string().optional(),
  building: z.string().min(1).optional(),
  excludeRoomId: z.string().min(1).optional(),
})

export const directBookingSchema = demoSubmitSchema

const categorySchema = z.object({ id: categoryIdSchema, label: z.string().min(1).max(60), tier: z.number().int().min(1).max(20), description: z.string().max(300) })
const officeSchema = z.object({
  id: officeIdSchema,
  label: z.string().min(1),
  shortLabel: z.string().min(1),
  inboxEmails: z.array(z.string().email()),
  memberEmails: z.array(z.string().email()),
  isFinal: z.boolean(),
  responseTargetHours: z.number().int().min(1).max(720),
})
const workflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  match: z.object({ officeId: officeIdSchema.optional(), categories: z.array(categoryIdSchema).optional() }),
  stages: z.array(officeIdSchema).min(1),
})
const autoApprovalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  conditions: z.object({
    categories: z.array(categoryIdSchema).optional(),
    startAtOrAfterMin: minuteSchema.optional(),
    endAtOrBeforeMin: minuteSchema.optional(),
    maxAttendance: z.number().int().min(1).optional(),
    buildings: z.array(z.string().min(1)).optional(),
    minNoticeHours: z.number().min(0).optional(),
    maxPerOrgPerWeek: z.number().int().min(1).optional(),
  }),
  effect: z.enum(['confirm', 'skip_to_final_stage']),
})

export const settingsSchema = z
  .object({
    categories: z.array(categorySchema).min(1),
    offices: z.array(officeSchema).min(1),
    workflows: z.array(workflowSchema),
    autoApproval: z.array(autoApprovalSchema),
    changeoverBufferMin: z.number().int().min(0).max(120),
    minNoticeHours: z.number().int().min(0).max(720),
    offerHoldHours: z.number().int().min(1).max(168),
    undoSeconds: z.number().int().min(0).max(120),
    defaultWeeklyCap: z.number().int().min(1).max(50),
  })
  .superRefine((value, ctx) => {
    const finals = new Set(value.offices.filter((o) => o.isFinal).map((o) => o.id))
    value.workflows.forEach((workflow, index) => {
      const last = workflow.stages[workflow.stages.length - 1]
      if (!last || !finals.has(last)) {
        ctx.addIssue({ code: 'custom', path: ['workflows', index, 'stages'], message: 'Every approval chain must end with a final office.' })
      }
    })
  })

export const agendaFiltersSchema = z.object({
  q: z.string().max(80).optional(),
  category: categoryIdSchema.optional(),
  building: z.string().min(1).optional(),
  status: z.enum(['pending', 'changes_requested', 'offered', 'confirmed']).optional(),
})
