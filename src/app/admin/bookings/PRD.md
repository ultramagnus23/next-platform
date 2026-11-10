# Room Booking Admin Portal: PRD (v2)
> Status: approved (brief v2) · Area: admin · Owner: Ministry of Technology
> Demo Wednesday 11 November 2026. v2 replaces the v1 spec. The v1 build is the starting point.

## 1. Summary

**Problem.** Clubs request rooms, chase their governing office, then go to Academic Booking before
anything reaches AMS. At about 100 rooms, 75 clubs and 200 to 300 requests a week, a flat list of
requests cannot be run by hand.

**Solution.** One admin portal where the system sorts every request on arrival and people judge only
the exceptions. Every request sits in a lane (Clash, Needs a look, Clear). Clear requests are
approved in bulk. A room that cannot be given is replaced by an offer of a free room held for 24
hours. A clash is one decision on one screen. Every action has a log entry and an email.

**Scale.** About 151 venues (the real inventory), 90 organisations (75 clubs, 15 other bodies), a two-week timetable and
about 450 requests in the demo window.

**Success criteria**
1. The 13-step demo script (section 11) runs end to end with no page errors.
2. All 35 scenario checks (S1 to S35) pass.
3. Lanes for every pending request and the Rooms day summary compute in under 200 ms on seed data.
4. Two simultaneous final approvals on overlapping requests: exactly one wins, the other gets 409.
5. Replacing the in-memory repository with Strapi changes only files in `_server/repo/`.

## 2. Principles (apply to every screen)

1. The system sorts, people judge. 2. Never a bare no: offer a room. 3. A clash is one decision.
4. Explain every flag in one plain sentence that cites the rule. 5. Status names are not room
effects: each maps to competes, held, booked or none. 6. Classes are the floor. 7. Undo, don't
confirm: single decisions apply at once with a 10 second undo, confirmations only for bulk and
override. 8. Keyboard first (J K A O C D /). 9. Rows not cards at volume. 10. Status is never colour
alone; at most six statuses per screen; text contrast at least 4.5:1. 11. Nothing waits forever:
48 hour response targets, overdue items first, undecided requests expire at event start.
12. Everything leaves a trail.

Visual language: existing platform tokens (page `#f7f4f2`, panels `#fffdfb`, crimson `#87281b` as the
single accent, semantic colours only for state). Nunito headings, Nunito Sans text. Radii 8, 10, 12
and full pills. No side-stripe borders, gradients, glass or giant KPI tiles.

## 3. Users and access

| Who | Gets in by | Can do |
|-----|-----------|--------|
| SLO, OA, CFE member | `booking_admin` via role `booking_authority` | See requests whose chain includes their office. Act at their step: approve, offer a room, ask for changes, decline, escalate a clash. |
| Academic Booking member | Same | See all. Final approval, resolve clashes, override, cancel, direct bookings, edit the timetable. |
| Super admin | `SUPERADMIN_EMAILS` | Everything, any step. Only role that edits rules. |

- The office is data: looked up per request from `BOOKING_OFFICES`, never in the session token.
  People on two offices pick an **Acting for** office (httpOnly cookie `booking_acting_for`,
  validated every request).
- `src/app/admin/layout.tsx` admits `booking_admin`. `src/middleware.ts` pins `/admin/bookings` to
  `booking_admin`. Sidebar category "Room bookings": Inbox, Clashes, Rooms, Calendar, Organisations,
  Sent emails, Rules.
- Self-approval is blocked: an actor whose email is the organisation's contact cannot act on that
  organisation's requests.
- Demo mode (`BOOKING_DEMO_MODE=true`): cookie `booking_demo_persona` selects one of
  `slo_approver | oa_approver | cfe_approver | acad_approver | super_admin`. Ignored otherwise.

## 4. Decisions D1 to D22 (binding)

D1 portal at `/admin/bookings`. D2 office is data. D3 chain snapshotted at submission, default
`[governing office, ACAD]`, templates override by office and category. D4 room effects: pending and
changes_requested compete, offered holds the offered room 24 hours, confirmed and classes book.
D5 priority is advisory, from category only, never organisation or office. D6 cross-office clashes
are decided by ACAD only. D7 offer a room is first-class; accepting counts as approved at the step
that offered. D8 final approval re-checks under a per-room-date lock plus `version`; stale is 409.
D9 override is ACAD or super admin with a reason, never over a class. D10 lanes are computed, never
stored. D11 bulk approve only for Clear, re-validated per item, one undo for the batch. D12 every
transition writes logs and emails; decline and ask-for-changes need a reason of 10 or more
characters. D13 emails go through an outbox. D14 auto-approval exists, off by default, only for
Clear requests. D15 response targets and expiry. D16 organisation standing is shown, not enforced.
D17 material edits reopen approval. D18 direct bookings for non-club bodies. D19 "confirmed" means
ready for AMS (simulated). D20 times are date plus minutes in IST, half-open, 15 minute grid. D21 no
map, recurring bookings or check-in. D22 fork cleanup after the demo (already done on `main`).

## 5. Data

Types in `types.ts`, zod in `schema.ts` (see brief section 3 for the full model): Office, Room
(with `bookableByClubs`), Organisation (kind, officeId, weeklyCap), TimetableBlock, BookingRequest
(status adds `offered` and `expired`; `offer`, `stageEnteredAt`, `previous`, `source`, `needs`),
ApprovalLog (adds `batchId`, new actions), OutboxEmail (adds `batchId`), WorkflowTemplate,
AutoApprovalRule, BookingSettings (adds `minNoticeHours`, `offerHoldHours`, `undoSeconds`,
per-office `responseTargetHours`).

Derived, never stored: lanes, flags, clash groups, ranks, alternatives, standing, overdue.

**Strapi collection types for the later swap:** `booking-requests`, `booking-logs`,
`booking-outbox`, `booking-rooms`, `booking-timetable`, `booking-settings` (single type),
`booking-office-members`. Existing `organisations` gains `booking_office`, `booking_weekly_cap`,
`booking_code`, `booking_colour`.

**Repository.** `BookingRepository` with an in-memory implementation (`_server/repo/memory.ts`) held
on `globalThis` with `roomId:date` indexes. Single Node process only: it does not work across
instances or serverless hosting. Seed is deterministic (seeded PRNG), all names are placeholders.

## 6. Engines (pure, `now` passed in)

`effects`, `overlap`, `clashes`, `flags`, `lanes`, `priority`, `workflow` (`transition`,
`availableActions`, `sweep`), `availability`, `auto-approval`, `notifications`, `standing`.
Flags: over_capacity, short_notice, outside_hours, over_weekly_cap, room_not_for_clubs, poor_record,
reopened, overdue (sort only). Lane: clash, else look if any flag other than overdue, else clear.
Actions: approve, offer_room, accept_offer, lapse_offer, escalate, request_changes, reject,
resubmit, override_confirm, cancel, note, undo. `sweep(now)` runs at the start of every service read:
lapses offers, expires started events, emits overdue emails once per step.

## 7. Volume and performance

Server-filtered, paginated inbox (50 rows) with server counts per lane. In-memory indexes by
`roomId:date`. Rooms grid: buildings collapsed except the active one, plain divs with percentage
positions, no per-cell components. All filters in URL params.

## 8. API contract

Under `src/app/api/admin/bookings/`, each method gated `requireAuth(['booking_admin'])` then actor
then `access.ts`: `GET /inbox`, `GET /requests`, `GET /requests/[id]`, `POST /requests/[id]/actions`,
`POST /bulk/approve`, `POST /undo`, `GET /clashes`, `GET /clashes/[groupId]`,
`POST /clashes/[groupId]/resolve`, `GET /rooms/day`, `GET /rooms/free`, `POST /direct-bookings`,
`GET /outbox`, `GET|PUT /settings`, `POST /acting-for`, and demo routes (persona, reset, submit,
resubmit, accept-offer, advance-clock), 404 unless demo mode. Errors: 400 validation, 403 not
allowed, 404, 409 stale version or blocked.

Locking: every mutation runs `sweep(now)`, takes the room-date lock (sorted keys for multi-key),
loads, runs the engine, checks versions, saves, appends logs and outbox. The Strapi version needs a
custom controller with a database transaction, because Strapi's REST API cannot do this.

## 9. Screens

Inbox `/admin/bookings` (split view, lanes, detail pane, bulk approve, undo, keyboard). Clashes
`/admin/bookings/clashes` and `/[groupId]` (overlap strip, side-by-side, decision panel). Rooms
`/admin/bookings/rooms` (find bar, day grid, week, month). Calendar agenda. Organisations table
(standing, no-shows first). Sent emails. Rules (priority, chains, limits, auto-approval, offices,
rooms and timetable). Detail in the brief, sections 9.1 to 9.7. Every page has loading, empty and
error states and works at 390 px.

## 10. Integrations and env

| Key | Purpose | Scope | Example |
|-----|---------|-------|---------|
| `BOOKING_OFFICES` | Office membership | Server only | `slo:a@x.in,b@x.in;oa:c@x.in;cfe:d@x.in;acad:e@x.in` |
| `BOOKING_DEMO_MODE` | Persona switcher, reset, simulation | Server only | `true` |

Email: outbox page now, `sendMail()` later. AMS: simulated badge. Local sign-in bypass (demo mode
plus `BYPASS_AUTH`, never in production) exists in `src/middleware.ts`.

## 11. Demo script (acceptance test)

1. SLO approver: Inbox shows Clashes, Needs a look and 21 Clear. Overdue first.
2. Approve all 21, Undo (emails marked undone), approve all again.
3. "Crisis committee" is over capacity. Offer AC-01 G04. Sent emails shows the 24 hour offer.
4. "Intro to ML Workshop": clash names Open Mic Night. Press A: forwarded, next row selected.
5. OA approver: Open Mic Night in Clashes, workshop read-only. Escalate.
6. Academic Booking: open the AC-02 201 clash, suggested winner is the workshop with a tier reason.
7. Keep the workshop, AC-03 104 preselected for Open Mic Night, Confirm decision.
8. Workshop Confirmed with AMS badge. Open Mic Night Offered. Emails to both.
9. Accept offer: Open Mic Night confirmed in AC-03 104.
10. Rooms, Thu, 6 to 8 PM, 40 seats, free only: both rooms gone; with the switch off, crimson blocks.
11. Override case: final approval disabled "Already booked by …", Override offered. Class case:
    disabled "A class is booked here at this time", no override.
12. Super admin enables the rule, simulates a 9:30 PM meeting for 20: confirmed by `system`.
13. Advance clock 1 day: Crisis committee offer lapses, an overdue request shows "Waiting 3 days".

## 12. Milestones

- [x] M0: PRD and plan · acceptance: plan confirmed
- [x] M1: Types, schemas, engines, repository, full-scale seed, service, actor, access, scenarios · S1 to S35 pass, typecheck clean
- [x] M2: Auth wiring, persona and acting-for, Inbox with approve, offer, changes, decline, undo, bulk, keyboard · demo steps 1 to 5
- [x] M3: Clash list and group page with resolve · steps 6 to 9
- [x] M4: Rooms day grid, find bar, free-only · step 10
- [x] M5: Sent emails, override and class-blocked cases, simulate request, advance clock · steps 8, 11, 13
- [x] M6: Rules, Organisations table · step 12
- [ ] M7: Rooms week and month, Calendar agenda, direct booking, mobile pass, audit
- [ ] M8: Strapi repository, real mail, timetable import (not in this build)

Wednesday cut: M0 to M4 polished, M5 if time. After the last milestone reached, write `README.md` and stop.

## 13. Non-goals

Organisation-facing portal beyond simulated submit, resubmit and accept; campus map; recurring
bookings; check-in and real no-show tracking; real AMS; real email; Strapi; analytics charts.

## 14. Open policy questions (all built as configuration)

1. Approval chain per office and whether steps can run in parallel. 2. Office members and what "OA"
stands for. 3. Priority order of categories, and whether it differs by space type. 4. Which
bookings may auto-approve. 5. Opening hours and equipment per venue, and which venues are classes-only. The venue list and capacities are now the real campus inventory (about 150 venues across Admin Block, AC-01 to AC-06, Dining Block, Sports Block, Outfield and the Open Amphitheatre).
6. How to get the timetable (AMS export or CSV) and how often it changes. 7. AMS integration method.
8. Email infrastructure and sender. 9. Weekly caps, minimum notice, add/drop period rule. 10. Whether
organisations can cancel or modify confirmed bookings, the cutoff, and what a material change is.
11. What happens to displaced bookings beyond the email. 12. Whether no-shows are tracked and the
consequences.

## 15. Build notes (10 November 2026)

- Venues: `_server/repo/fixtures.ts` holds the campus inventory. A venue's floor comes from the first digit of its room number. Opening hours (8 AM to 11 PM) and equipment are placeholders. Laboratories are classes-only. Timetable classes are generated only for classrooms and laboratories.
- Demo script rooms: the clash is AC-01 LR-106 (100 seats). AC-03 LR-003 is the only free fit for Open Mic Night. Crisis committee is 70 people in AC-01 LR-103 (50 seats), and AC-01 LR-207 is held free to offer. The class-blocked case is AC-04 LR-304. The override case is AC-03 LR-005.
- Not built yet (M7): Rooms week and month views, the Calendar agenda, mobile pass and the design audit. Direct booking is built (click an empty stretch of a room row as Academic Booking).
- Scenario checks: 37 pass (S1 to S35, plus S2b and S26b).
