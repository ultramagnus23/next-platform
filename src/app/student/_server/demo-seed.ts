import type { NewRequestInput, StudentActor } from '../types'
import type { StudentService } from './service'

export const DEMO_ACTOR: StudentActor = {
  organisationId: 'org-quiz-club',
  organisationName: 'Quiz Club (sample)',
  email: 'quiz.lead@example.test',
}

const DAY = 86_400_000

function dateFrom(service: StudentService, days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10)
}

/**
 * Four invented requests so every state is visible on first load: taking longer than usual, approved,
 * not approved with a reason, and freshly pending. Past submissions are made by moving the clock back and
 * then forward again. All names are sample data.
 */
export async function seedStudentDemo(service: StudentService): Promise<void> {
  const base = (patch: Partial<NewRequestInput>): NewRequestInput => ({
    eventName: 'Sample event',
    description: 'Sample data for the demo.',
    category: 'extracurricular',
    venueId: 'dr-reddys-auditorium',
    date: dateFrom(service, 20),
    startMin: 18 * 60 + 30,
    endMin: 20 * 60 + 30,
    attendance: 120,
    needsAv: false,
    guestSpeaker: false,
    ...patch,
  })

  service.advanceDays(-9)
  await service.submit(DEMO_ACTOR, base({ eventName: 'Inter-hostel quiz finals', date: dateFrom(service, 21) }))
  service.advanceDays(9)

  service.advanceDays(-12)
  const chess = await service.submit(DEMO_ACTOR, base({ eventName: 'Chess open', venueId: 'takshila', attendance: 90, date: dateFrom(service, 14) }))
  service.advanceDays(12)
  if (chess.ok) {
    await service.recordDecision(chess.data.request.id, { decision: 'approve', by: 'Student Life Office' })
    await service.recordDecision(chess.data.request.id, { decision: 'approve', by: 'Additional review' })
  }

  service.advanceDays(-5)
  const debate = await service.submit(DEMO_ACTOR, base({ eventName: 'Open debate night', venueId: 'multi-purpose-hall', attendance: 300, date: dateFrom(service, 16) }))
  service.advanceDays(5)
  if (debate.ok) {
    await service.recordDecision(debate.data.request.id, {
      decision: 'reject',
      by: 'Student Life Office',
      reason: 'The hall is held for a university event on that evening. Please pick another date or the Black Box Theatre.',
    })
  }

  service.advanceDays(-1)
  await service.submit(DEMO_ACTOR, base({ eventName: 'Robotics demo day', category: 'academic_society', venueId: 'takshila', attendance: 80, date: dateFrom(service, 25) }))
  service.advanceDays(1)
}
