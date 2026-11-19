import { z } from 'zod'

function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export const newRequestSchema = z
  .object({
    eventName: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).default(''),
    category: z.enum(['academic_society', 'extracurricular', 'performing_arts', 'other']),
    venueId: z.string().min(1).max(80),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, 'Choose a real date.'),
    startMin: z.number().int().min(0).max(1439),
    endMin: z.number().int().min(1).max(1440),
    attendance: z.number().int().min(1).max(5000),
    needsAv: z.boolean(),
    guestSpeaker: z.boolean(),
  })
  .strict()

export const previewSchema = z
  .object({
    venueId: z.string().min(1).max(80),
    category: z.enum(['academic_society', 'extracurricular', 'performing_arts', 'other']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, 'Choose a real date.'),
    startMin: z.number().int().min(0).max(1439),
    endMin: z.number().int().min(1).max(1440),
    needsAv: z.boolean(),
    guestSpeaker: z.boolean(),
  })
  .strict()

/** Demo only: stands in for an office until the admin portal is joined. */
export const decisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), by: z.string().min(1).max(80) }).strict(),
  z.object({ decision: z.literal('reject'), by: z.string().min(1).max(80), reason: z.string().min(1).max(1000) }).strict(),
  z.object({ decision: z.literal('comment'), by: z.string().min(1).max(80), reason: z.string().min(1).max(1000) }).strict(),
])

export const advanceSchema = z.object({ days: z.number().int().min(1).max(60) }).strict()

export const roomsQuerySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, 'Choose a real date.'),
    from: z.coerce.number().int().min(0).max(1439),
    to: z.coerce.number().int().min(1).max(1440),
    seats: z.coerce.number().int().min(0).max(5000).optional(),
    needs: z.string().max(200).optional(),
    building: z.string().max(80).optional(),
  })
  .strict()
