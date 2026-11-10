import { z } from 'zod'

/** Request and settings validation shared by pages and routes. */

export const authorityIdSchema = z.enum(['slo', 'oa', 'cfe', 'acad'])
export const categoryIdSchema = z.enum([
  'academic',
  'workshop',
  'seminar',
  'competition',
  'cultural',
  'club_event',
  'meeting',
  'other',
])
export const requestStatusSchema = z.enum([
  'pending',
  'changes_requested',
  'confirmed',
  'rejected',
  'withdrawn',
  'cancelled',
  'displaced',
])
export const personaSchema = z.enum(['slo_approver', 'oa_approver', 'cfe_approver', 'acad_approver', 'super_admin'])

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
const minuteSchema = z.number().int().min(0).max(1440)
const reasonSchema = z.string().max(2000)

export const actionInputSchema = z.object({
  action: z.enum([
    'approve',
    'escalate',
    'reject',
    'request_changes',
    'resubmit',
    'override_confirm',
    'cancel',
    'remark',
  ]),
  version: z.number().int().min(1).optional(),
  reason: reasonSchema.optional(),
  alternativeRoomId: z.string().min(1).nullable().optional(),
  changes: z
    .object({
      roomId: z.string().min(1).optional(),
      date: dateSchema.optional(),
      startMin: minuteSchema.optional(),
      endMin: minuteSchema.optional(),
    })
    .optional(),
})

export const requestFiltersSchema = z.object({
  tab: z.enum(['needs_action', 'others', 'confirmed', 'closed', 'all']).default('needs_action'),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  organisationId: z.string().min(1).optional(),
  building: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  category: categoryIdSchema.optional(),
  status: requestStatusSchema.optional(),
  stage: authorityIdSchema.optional(),
  conflictsOnly: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  page: z.coerce.number().int().min(1).max(500).optional(),
})

export const resolveSchema = z.object({
  winnerId: z.string().min(1),
  versions: z.record(z.string(), z.number().int().min(1)),
  others: z.array(
    z.object({
      id: z.string().min(1),
      action: z.enum(['reject', 'request_changes']),
      reason: reasonSchema,
      alternativeRoomId: z.string().min(1).nullable().optional(),
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

export const availabilityQuerySchema = z.union([
  z.object({ roomId: z.string().min(1), date: dateSchema }),
  z.object({
    date: dateSchema,
    startMin: z.coerce.number().int().min(0).max(1440),
    endMin: z.coerce.number().int().min(0).max(1440),
    minCapacity: z.coerce.number().int().min(0).max(1000).default(0),
    preferBuilding: z.string().min(1).optional(),
  }),
])

const categorySchema = z.object({
  id: categoryIdSchema,
  label: z.string().min(1).max(60),
  tier: z.number().int().min(1).max(20),
  description: z.string().max(300),
})

const authoritySchema = z.object({
  id: authorityIdSchema,
  label: z.string().min(1),
  shortLabel: z.string().min(1),
  inboxEmails: z.array(z.string().email()),
  memberEmails: z.array(z.string().email()),
  isFinal: z.boolean(),
})

const workflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  match: z.object({
    authorityId: authorityIdSchema.optional(),
    categories: z.array(categoryIdSchema).optional(),
  }),
  stages: z.array(authorityIdSchema).min(1),
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
    minLeadTimeHours: z.number().min(0).optional(),
    maxPerOrgPerWeek: z.number().int().min(1).optional(),
  }),
  effect: z.enum(['confirm', 'skip_to_final_stage']),
})

export const settingsSchema = z
  .object({
    categories: z.array(categorySchema).min(1),
    authorities: z.array(authoritySchema).min(1),
    workflows: z.array(workflowSchema),
    autoApproval: z.array(autoApprovalSchema),
    changeoverBufferMin: z.number().int().min(0).max(120),
  })
  .superRefine((value, ctx) => {
    const finals = new Set(value.authorities.filter((a) => a.isFinal).map((a) => a.id))
    value.workflows.forEach((workflow, index) => {
      const last = workflow.stages[workflow.stages.length - 1]
      if (!last || !finals.has(last)) {
        ctx.addIssue({
          code: 'custom',
          path: ['workflows', index, 'stages'],
          message: 'Every approval chain must end with a final authority.',
        })
      }
    })
  })

export const calendarFiltersSchema = z.object({
  view: z.enum(['day', 'week', 'month']).default('day'),
  date: dateSchema.optional(),
  building: z.string().min(1).optional(),
  floor: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  organisationId: z.string().min(1).optional(),
  category: categoryIdSchema.optional(),
  status: requestStatusSchema.optional(),
})
