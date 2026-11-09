# Booking Admin Portal: PRD
> Status: approved (brief) · Area: admin · Owner: Ministry of Technology
> Demo due Wednesday 11 November 2026. Progress review Monday 9 November 2026.

## 1. Summary

**Problem.** Societies request rooms, chase approvals from their governing office, then go to
Academic Booking before anything appears in AMS (the university room system). Nothing is
tracked, conflicts are found late, and decisions are not recorded.

**Solution.** One platform. This PRD covers the admin side only: SLO, OA, CFE, Academic Booking
and super admins review, approve, reject, resolve conflicts and see availability. Every decision
sends an automatic email. The organisation-facing portal is built later by a collaborator.

This is an approval workflow and resource-allocation system. The value is in the workflow
engine, conflict handling, availability model and notifications.

**Success criteria**
1. The 11-step demo script (section 11) runs end to end with no page errors.
2. All 23 scenario checks (S1 to S23) pass with `npx tsx src/app/admin/bookings/_server/engine/scenarios.ts`.
3. Two simultaneous final approvals on overlapping requests: exactly one wins, the other gets 409.
4. Every status change writes one audit log entry and the right outbox emails.
5. Swapping the mock repository for Strapi changes files only inside `_server/repo/`.

## 2. Users and access

| Who | How they get in | Can do |
|-----|-----------------|--------|
| SLO, OA, CFE member | New grant `booking_admin` via role `booking_authority` | See requests whose chain includes their authority. Act on requests at their stage. Forward, escalate, reject, request changes. |
| Academic Booking (ACAD) member | Same | See all requests. Act at the final stage. Decide conflict groups. Override and cancel confirmed bookings. |
| Super admin | `SUPERADMIN_EMAILS` (grant added to role) | Everything, at any stage. Only role that edits settings. |

Decisions that bind this design:
- **Authority is data, not a role (D2).** Which authority a person acts for is looked up per
  request from `BOOKING_AUTHORITIES`. It is never stored in the session token.
- Role `booking_authority` sits below `ashoka_admin` and above `organization`. Access:
  `['platform', 'booking_admin']`. `superadmin` also gets `booking_admin`.
- `src/app/admin/layout.tsx` admits `booking_admin`. `src/middleware.ts` `ROUTE_ACCESS` gets
  `/admin/bookings` for `booking_admin`, and `/admin/organisations` plus `/admin/organizations`
  for `ashoka_admin`, so loosening the layout does not expose existing admin pages.
- Visibility and action matrix lives in `_server/access.ts`. The client never sends authorities.
  Actions re-read membership at action time.
- Demo mode (`BOOKING_DEMO_MODE=true`): cookie `booking_demo_persona` selects `slo_approver`,
  `oa_approver`, `cfe_approver`, `acad_approver` or `super_admin`. The persona replaces
  authorities, never the signed-in identity. Ignored when demo mode is off.

## 3. Stories and flows

| Story | Acceptance |
|-------|-----------|
| As an authority member, I want a queue of requests waiting on me so that I act on the right ones first. | "Needs my action" is the default tab. Count matches the Overview tile. |
| As an authority member, I want to approve and forward, request changes or reject with a reason so that the organisation knows what happens next. | Reason is at least 10 characters for reject and request changes. An email is queued. |
| As an authority member, I want to see competing requests so that I can escalate instead of deciding for another office. | Conflict panel lists competitors, ranks and reasons. Escalate jumps to the final stage. |
| As Academic Booking, I want to resolve a conflict group in one action so that no one is left half-decided. | Resolve applies all changes or none, under the room-date lock. Summary lists every email first. |
| As Academic Booking, I want to override a confirmed booking with a reason so that urgent academic needs are met without silent damage. | Displaced booking becomes `displaced`. Its organisation and authority are emailed. |
| As a super admin, I want to edit tiers, workflows and auto-approval rules so that policy changes need no code change. | Settings save. In-flight requests keep their snapshotted stages. |

**Happy path.** Submit, then each stage in `stages` approves in order. The last approval
re-checks confirmed bookings inside the room-date lock and sets `confirmed`.

**Edge cases.**
- Stale `version` returns 409. The UI shows "This request changed while you were looking at it. Reloaded with the latest version." and refreshes.
- Final approval over a confirmed booking returns 409 with the blocking booking. ACAD sees Override and confirm.
- Back-to-back bookings (18:00 to 20:00 and 20:00 to 21:00) do not conflict when the buffer is 0.
- A conflicted request is never auto-approved.

## 4. Screens

Wireframe: no (skipped by the brief). Design direction: the existing admin portal look, tokens
in `.agents/context/design.md`, shadcn components, Nunito fonts. Dense, calm, operational.

All pages: `force-dynamic`, usable at 390 px (tables collapse to cards, panels stack). Demo mode
shows an amber banner: `Demo mode: data is simulated and resets on restart. No emails are sent.`
and a "Viewing as" persona select, a "Simulate request" button and a "Reset demo data" item.

| Route | Purpose | Primary action | Notes |
|-------|---------|----------------|-------|
| `/admin/bookings` | Overview | Open a request or conflict | 4 KPI tiles linking to filtered lists, needs-action list (top 6), open conflicts (top 3), today across campus, recent activity (10). |
| `/admin/bookings/requests` | Queue | Open a request | Tabs: Needs my action, With other authorities, Confirmed, Closed, All. Filters in URL params. Empty: `Nothing waiting on you.` |
| `/admin/bookings/requests/[id]` | Detail and actions | Contextual approve button | Left: header, event card, stepper, conflict panel, room timeline, alternative rooms, history. Right: sticky action panel with reason dialogs and live email preview. |
| `/admin/bookings/conflicts` | Open groups | Open a group | One card per group, soonest first. |
| `/admin/bookings/conflicts/[groupId]` | Compare and resolve | Resolve | Overlap timeline, side-by-side columns, priority reasons, resolve flow with summary step. |
| `/admin/bookings/calendar` | Availability | Open a block | Day (default), week (one room), month views. CSS grid, no calendar library. |
| `/admin/bookings/organisations` | Per-organisation stats | Open filtered requests | Sortable table. Secondary. |
| `/admin/bookings/outbox` | Simulated emails | Open email in side sheet | Banner: `Simulated. Nothing has been sent.` |
| `/admin/bookings/settings` | Policy | Edit (super admin only) | Tabs: categories and priority, workflows, auto-approval, authorities, rooms, general. Read-only for others, with a lock note. |

States: every page has loading skeletons, an empty state and an error state.

## 5. Data

**Demo.** All data goes through `BookingRepository` (`_server/repo/repository.ts`). Only
`_server/repo/memory.ts` holds state, on `globalThis` so it survives HMR. Nothing else imports it.
Seed names and emails are placeholders. The store resets on restart and does not work on
multi-instance or serverless hosting.

**Strapi collection types for the later swap (M7, not in this build)**

| Collection | Purpose |
|------------|---------|
| `booking-requests` | `BookingRequest`, including `stages`, `stageIndex`, `version` |
| `booking-logs` | `ApprovalLog` |
| `booking-outbox` | `OutboxEmail` |
| `booking-rooms` | `Room` |
| `booking-settings` (single type) | `BookingSettings` |
| `booking-authority-members` | Authority membership, replaces env parsing |
| `organisations` (existing) | New field `booking_authority` |

Times: `date: 'YYYY-MM-DD'` plus `startMin` and `endMin` (minutes since midnight, IST). Intervals
are half-open. Slot granularity 15 minutes. Optional changeover buffer, default 0.

Types are in `types.ts`, zod schemas in `schema.ts`, as specified in the brief section 3.

## 6. API contract

All under `src/app/api/admin/bookings/`. Each method: `requireAuth(['booking_admin'])`, resolve
actor, check `access.ts`, validate body with zod. Response: `{ success: true, data } | { success: false, error }`.

| Method and path | Access | Purpose |
|-----------------|--------|---------|
| `GET /requests` | booking_admin | List with the Requests page filters |
| `GET /requests/[id]` | booking_admin, must be allowed to see it | Detail bundle |
| `POST /requests/[id]/actions` | by action rules | `{ action, version, reason?, alternativeRoomId? }` |
| `GET /conflicts`, `GET /conflicts/[groupId]` | booking_admin | Groups with ranks |
| `POST /conflicts/[groupId]/resolve` | ACAD, super admin | Atomic resolve with per-member versions |
| `GET /availability` | booking_admin | Day schedule or free rooms |
| `GET /outbox` | booking_admin | Simulated emails |
| `GET /settings`, `PUT /settings` | PUT super admin only | Settings |
| `POST /demo/persona`, `/demo/reset`, `/demo/submit`, `/demo/resubmit/[id]` | demo mode only, else 404 | Demo helpers |

Error codes: 400 validation, 403 not allowed, 404 missing or demo off, 409 stale version or
blocked by a confirmed booking.

**Locking.** `_server/service.ts` is the only repository caller. Each mutation takes an
in-memory promise-chain mutex keyed `roomId:date` (resolve takes all keys in sorted order),
loads, runs the engine, checks versions, saves, appends logs and outbox, releases. The Strapi
version must do this inside a custom Strapi controller using a database transaction, because
Strapi's REST API cannot.

## 7. Live data

None. Load on open. After a mutation the client calls `router.refresh()`. No SSE.

## 8. Caching and cost

| Dataset | Scope | Cache |
|---------|-------|-------|
| All booking pages and routes | Per user, mutable | `force-dynamic`, no server cache tier |

Volume: about 100 requests and bookings in the seed. In-memory, no cost.

## 9. Integrations

| Integration | Demo | Later |
|-------------|------|-------|
| Email | Outbox page renders emails. Nothing is sent. | A sender drains the outbox through `src/lib/apis/mail.ts` `sendMail()` |
| AMS | `AMS: synced (simulated)` badge with timestamp | TBD, method unknown |

**New env keys** (added to `.env.example` with empty values)

| Name | Purpose | Scope | Example |
|------|---------|-------|---------|
| `BOOKING_AUTHORITIES` | Authority membership | Server only | `slo:a@ashoka.edu.in,b@ashoka.edu.in;oa:c@ashoka.edu.in;cfe:d@ashoka.edu.in;acad:e@ashoka.edu.in` |
| `BOOKING_DEMO_MODE` | Enables persona switcher, reset and simulated submission | Server only | `true` |

`BOOKING_AUTHORITIES` is parsed once at module top in `_server/authorities.ts`. Malformed input
fails closed: log with `platform.error`, treat as empty.

## 10. Launch

Sidebar category "Bookings" (Overview, Requests, Conflicts, Calendar, Organisations, Outbox,
Settings), `requiresAccess: 'booking_admin'`. New sidebar role `booking_authority` with
`seesUnrestricted: false`. The existing "Organisations" entry is restricted to `ashoka_admin`
and `superadmin`. Unrelated admin entries are hidden from booking-only users, not deleted (D16).
Tour, banner and what's-new: n/a for the demo.

## 11. Milestones

- [x] M0: PRD and implementation plan · acceptance: plan confirmed
- [x] M1: Types, schemas, engines, repository, seed, service, actor, access, scenario checks · acceptance: S1 to S23 pass, typecheck clean
- [x] M2: Auth wiring, persona switcher, Requests list, Request detail with all actions and dialogs · acceptance: demo steps 1 to 4
- [x] M3: Conflicts list and group page with resolve flow · acceptance: demo steps 5 to 8
- [x] M4: Calendar day, week, month · acceptance: demo step 9
- [x] M5: Overview, Outbox, simulated submission and resubmission · acceptance: demo steps 1 and 10, Overview numbers match linked lists
- [x] M6: Settings, Organisations page, mobile pass, states, `/web-design-guidelines` audit · acceptance: demo step 11, full script clean, `npm run build` passes
- [ ] M7 (after the demo, not started): Strapi repository and real mail sender

After M6, write `README.md` in this folder and stop.

**Demo script (acceptance test)**
1. Persona SLO approver. Overview lists "Intro to ML Workshop" under Needs your action, with a conflict badge.
2. Open it. Conflict panel shows "Open Mic Night" (OA, cultural, tier 5) and ranks the workshop first with reasons.
3. Approve and forward to Academic Booking. Stepper moves. Outbox has a forwarded email to Academic Booking and an update to CS Society.
4. Switch to OA approver. OA cannot reject the workshop (control absent, explanation shown). OA escalates Open Mic Night.
5. Switch to Academic Booking. Open conflicts shows the AC-02 201 group. Comparison suggests the workshop.
6. Resolve: confirm the workshop. Open Mic Night gets "Request changes, suggest another room" with a free 60+ seat room in AC-03. Summary lists the changes and two emails.
7. Workshop is Confirmed with `AMS: synced (simulated)`. Open Mic Night is Changes requested.
8. Outbox shows the final approval email to CS Society and its chain, and the changes-requested email to Cultural Society with reason and alternative room.
9. Calendar day view shows the workshop as a confirmed block in AC-02 201.
10. Demo: simulate resubmission of Open Mic Night with the new room. It restarts at OA with no conflict.
11. Super admin enables the auto-approval rule, simulates a 9:30 PM meeting for 20 people in a free room. It is confirmed at once, logged as `system` with the rule, and an `auto_approved` email is in the Outbox.

Also seeded: a request that overlaps a confirmed booking. Final approval is disabled with
`Blocked by a confirmed booking`. Academic Booking sees `Override and confirm`.

## 12. Non-goals

Organisation-facing portal (beyond the simulated submission), 2D or 3D campus map, recurring
bookings, real AMS integration, real email sending, Strapi collections, analytics charts beyond
the Organisations table, deleting unrelated tools from the fork.

## 13. Risks and open questions

**Risks**
- In-memory store: single process only. Mitigation: documented, repository interface isolates it.
- Loosening the admin layout could expose existing admin pages. Mitigation: explicit middleware entries for `/admin/organisations` and `/admin/organizations`.
- Simultaneous approvals. Mitigation: room-date lock plus `version` check (D8).

**Open policy questions (all implemented as configuration, never hardcoded)**
1. Exact approval chain for each of SLO, OA, CFE (workflow templates).
2. Who sits on Academic Booking and the other authorities (`BOOKING_AUTHORITIES`).
3. Official priority order of categories (category tiers).
4. Which bookings may be auto-approved (auto-approval rules).
5. Official list of buildings, floors, rooms, capacities and hours (rooms seed, later Strapi).
6. Whether IT can provide 2D floor plans (future map).
7. AMS integration method (D13 placeholder).
8. Email infrastructure and sender address (outbox sender, `mail.ts`).
9. Whether organisations can cancel or modify confirmed bookings, and the cutoff.
10. What happens to a displaced booking beyond notification (re-queue automatically or not).

**Decisions D1 to D16** from the brief are binding. Summary: portal at `/admin/bookings`;
authority is data; approval chain is a snapshot; default chain is governing authority then ACAD;
slots lock only on final approval; priority is advisory and from category only; ACAD decides
cross-authority conflicts; final approval is guarded by lock and version; override is ACAD or
super admin with a reason; every transition writes audit and outbox; outbox is rendered, not
sent; auto-approval exists but is off; "confirmed" means ready for AMS (simulated); half-open
time intervals in IST; no map or recurring bookings; fork cleanup happens after the demo.
