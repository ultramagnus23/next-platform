# Student booking portal (requester side): spec and plan

Status: plan for approval. No code written. Date: 18 Nov 2026.
Scope: the side used by club leads. The admin portal in `src/app/admin/bookings/` already exists and is the system of record. This portal writes to the same store, so a student request appears in the admin Inbox at once.

## 1. What I found in the repo (read only)

| Area | Finding | Consequence |
|------|---------|-------------|
| Framework | Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind v4, shadcn UI | Reuse. No new framework |
| Data layer | All data goes through Strapi. The booking portal has a `BookingRepository` with an in-memory implementation; the Strapi version is documented but not built | Student tables go behind the same interface. Real tables are Strapi collection types you create, not SQL migrations |
| Auth | next-auth 5 beta, Google, JWT, `requireAuth`, roles in `src/lib/authz/roles.ts` | Add a `student` grant. The sandbox has no auth |
| Email | `nodemailer` 7 and `src/lib/apis/mail.ts` (SMTP via env). No provider API, no outbox, no queue | Outbox and threading are new. SMTP gives full control of `Message-ID`, so threading needs no provider support |
| Scheduler | None. The admin sweep runs inside the service on demand. Host is one box (t3a.medium, see `caching.md`) | A 15 minute tick is a `node-cron` style loop or a system cron hitting a secret route. No serverless limits apply |
| Tests | No test runner, no Playwright, no axe. Scripts: `typecheck`, `lint`, `build`. Admin has 41 scenario checks run with `tsx` | A runner and Playwright are new libraries. Need your approval (section 8) |
| Fonts | Nunito and Nunito Sans in the root layout. The brief asks for Public Sans | Changing the root font changes the whole platform. Proposal: load Public Sans only under the student layout |
| Admin chain | Offices `slo`, `oa`, `cfe`, `acad`; request has `stages` and `stageIndex`; statuses include pending, offered, confirmed, rejected, withdrawn, cancelled | Student states map onto these (section 3) |

## 2. Questions that block or change the plan

Ordered by impact. Each has a safe default so work does not stall.

1. **Will SLO and OAA actually use the platform or the email links?** Biggest product risk. Default: build email approve links as first class, pilot one office.
2. **Which store for the pitch: in-memory sandbox or real Strapi?** Default: in-memory behind the repository, Strapi later.
3. **Sending domain, SPF, DKIM, DMARC, and the SMTP account.** Default: dry-run only, nothing sends.
4. **Who approves what, and notice periods?** Only the routes in the brief are modelled. Default: unknown route shows "Route unconfirmed, email SLO" and goes to the SLO mailbox, flagged.
5. **Where is the Multi-Purpose Hall (Sports Block or Admin Block)?** Default: show no building until confirmed.
6. **Room data:** capacity, AV hours, accessibility, owner per room. Default: the 3 critical spaces from the brief, everything else "to confirm".
7. **Policy version.** The PDF is undated. Default: label route rules "sample, to confirm".
8. **Does the Strapi admin chain (`slo`, `oa`, `cfe`, `acad`) match the real chain?** Default: reuse it unchanged.
9. **Font change** (section 1). Default: Public Sans in the student layout only.
10. **New libraries** (section 8). Default: none until you approve.

## 3. Status model

Stored: `draft`, `pending`, `approved`, `rejected`, `cancelled`. Shown: Approved, Not approved, Pending, Taking longer than usual (computed, never stored).

Mapping from the admin model, so one request has one truth:

| Student state | Admin status | Note |
|---------------|--------------|------|
| draft | none (not yet in admin) | Only the student sees drafts |
| pending | pending, changes_requested, offered | Offered shows "An office suggested another room" |
| approved | confirmed | |
| rejected (Not approved) | rejected | Full reason shown. Edit and resubmit makes a linked new version |
| cancelled | withdrawn, cancelled | Stops all jobs |

`deriveStatus(request, now)` returns the shown word, icon and tone. Stagnant = pending and 7 days since the later of submission and last approver activity.

## 4. Follow-up rule (server enforced)

- One per request per window, only when pending and `now >= next_followup_allowed_at`.
- `next_followup_allowed_at` = later of submission and last approver activity, plus `followup_wait_days`. Any approver comment or stage change resets it.
- Urgency override: event under `urgency_days` away and still pending allows exactly one early follow-up, with the reason shown.
- One atomic conditional update sets `last_followup_at` and `next_followup_allowed_at` only where the condition holds and returns the row. Zero rows means refuse with `{ reason, unlockAt }`.
- In the in-memory repository the update runs under the existing `KeyedMutex`. In Strapi it must be one conditional update (custom controller or lifecycle with a transaction). Section 11 notes this is the hardest part to port.
- The follow-up email goes to the current stage's role mailbox, threaded under the first email, student copied.
- The button is always visible. Locked state shows the exact unlock date as text with `aria-disabled`, for example "You can send a reminder on Tue 25 Nov. Offices have 7 days to respond."

Config (one table, no literals): `followup_wait_days` 7, `approver_reminder_day` 2, `escalation_day` 5, `admin_flag_day` 14, `urgency_days` 7, `org_daily_followup_cap` (value to agree).

## 5. Email

- Subject pattern identical for every status change. First email's `Message-ID` stored as `root_message_id`; later mails set `In-Reply-To` and `References`.
- SMTP via nodemailer lets us set our own `Message-ID`, so no provider doubt. If you pick Resend or SES instead, I check their docs first and tell you.
- Outbox row written in the same write as the status change. Unique key `(request_id, template, recipient, sequence)`. Drain loop claims rows with `SELECT ... FOR UPDATE SKIP LOCKED` (Strapi: Postgres or MySQL 8 only; SQLite is banned by repo rules, so confirm the DB). Retry with backoff. Bounces and complaints go to a suppressions table.
- Dry-run mode prints every email and sends nothing. On by default in development and in the sandbox.
- Approve from email: GET opens a confirmation page with a request summary and a required reason for Not approve. The action is a POST from that page. Token is HMAC signed, single use, 24 hour expiry, bound to request, stage and approver role. A GET never changes state.
- "Mark as decided" for offline decisions.
- Recipient resolved at send time: delegate on leave, then assignee, then role backup.
- DNS needed on the sending domain: an SPF TXT record that includes the SMTP provider, DKIM keys published as the provider instructs, and a DMARC TXT at `_dmarc` starting at `p=none` with a reporting address, moving to `quarantine` after a clean fortnight. Exact values come from the provider account. No real mail until you confirm the domain.

## 6. Screens

My requests, New request (4 steps), Request detail (stepper, follow-up in every state, activity log), outcome states, slot conflict with three alternatives. Every screen has loading, empty, field error, stale timestamp, locked with reason, success with next step, and offline or send-failed with retry. Design rules from the brief apply unchanged (light, mobile first at 375, 44px targets, OKLCH tokens, status colour plus icon plus text, absolute dates in Asia/Kolkata, no em dashes).

## 7. Schema diff (Strapi collection types, to create by hand)

New: `student_request_ext` (request id, org, draft payload, version link `previous_request_id`, `root_message_id`, `last_followup_at`, `next_followup_allowed_at`, `followup_count`), `approval_step` (request, office, state, decided_at, decided_by, reason), `request_event` (append only audit), `notification_outbox`, `email_suppression`, `route_rule` (versioned, admin editable), `booking_config`, `approval_token` (hash, request, stage, role, used_at, expires_at).
Changed: admin `BookingRequest` gains `rootMessageId`, `lastApproverActivityAt`. Everything else is reused.
Rollback: collection types are additive, so rollback is deleting the new types.

## 8. Libraries needing your approval

Vitest (unit and concurrency tests), Playwright (flows and screenshots), `@axe-core/playwright` (accessibility). Nothing else. Rejecting them means the 41-style `tsx` scenario approach, with no browser or axe evidence.

## 9. File layout (follows repo conventions)

```
src/app/student/
  PRD.md  README.md  layout.tsx
  page.tsx                       My requests
  new/page.tsx                   New request, 4 steps
  requests/[id]/page.tsx         Request detail
  approve/[token]/page.tsx       Email confirmation page (GET shows, POST acts)
  types.ts  data.ts  utils.ts  schema.ts
  logic/    status.ts followup.ts approval-path.ts (pure, client safe, with tests)
  _server/  email.ts outbox.ts tokens.ts scheduler.ts repo/
  _components/  status-chip.tsx stepper.tsx followup-panel.tsx path-preview.tsx request-form.tsx ...
src/app/api/student/             requests, follow-up, approve (POST), cron tick
```
Shared with admin by import from the admin owner's folder (rooms, offices, repository), never moved into `src/lib`.

## 10. HANDOFF: component map

| Component | Existing | Action |
|-----------|----------|--------|
| Button, Input, Select, Textarea, Checkbox, Dialog, Sheet, Popover, Skeleton, Sonner, Tabs | `src/components/ui/` | Reuse |
| Event popup | `admin/bookings/_components/event-popover.tsx` | Reuse for conflict alternatives |
| Room timeline | `room-timeline.tsx` | Reuse in the conflict screen |
| Guided tour | `guided-tour.tsx` | Reuse for first use |
| Status chip, vertical stepper, follow-up panel, path preview, room card, activity log, outcome banner, conflict alternatives | none | New |
| Date, venue formatting | `admin/bookings/utils.ts` | Reuse |

## 11. Risks and honest limits

- The follow-up atomic update is trivial in memory and needs a real conditional write in Strapi. Plan it before promising it.
- Public Sans must be self-hosted or mocked like today, because Render builds cannot reach Google Fonts reliably.
- A pitch demo and the production system are different amounts of work. The demo path (sandbox, dry-run email, in-memory) is roughly the first four milestones.

## 12. Milestones

1. Pure logic with unit tests: `deriveStatus`, `followupEligibility`, `approvalPath`.
2. Data and server on the in-memory repository: requests, steps, events, config, follow-up endpoint.
3. Email: outbox, threading, dry-run, signed approve links, scheduler tick.
4. Screens one at a time: status chip and stepper, detail, my requests, new request, outcome and conflict.
5. Admin hookup: student request appears in the Inbox, admin decisions move the stepper.
6. Evidence: typecheck, lint, tests, 20-way concurrency test, Playwright at 375, 768 and 1280, axe, keyboard and reduced-motion runs.
7. Fresh reviewer pass, fixes, `NOTIFICATIONS.md`.
8. Strapi port and pilot with one office (after the questions in section 2 are answered).

Hooks proposed, not enabled: a Stop hook running `npm run typecheck` and `npm run lint`, and a check rejecting em dashes and forbidden fonts in source.

## 13. M3 notes (email)

- Sending is dry-run unless EMAIL_MODE is live AND EMAIL_DOMAIN_VERIFIED is true. The sandbox and demo mode never send real mail, whatever else is set.
- The platform mailer sends through Gmail accounts (TECHMAIL_ID and others). Gmail's SMTP may rewrite the Message-ID we set, which would break threading. This is not confirmed. Before going live, send one test thread to a real inbox and check the headers. A transactional provider that honours a custom Message-ID is the safer route.
- Approve links are single use and expire after 24 hours. A link older than that needs a fresh reminder email, which the scheduler sends on its reminder day.
- Send failures retry after 1, 2, 4 and 8 minutes, then the row is marked dead. Bounce and complaint webhooks are not wired: recordBounce exists but nothing calls it yet.

## 14. M5 notes (joined to the admin portal)

- A student request for a bridged space is also created in the admin portal, so it shows in the Inbox and follows the admin chain (offices and stages as the admin portal names them). The admin portal decides. The student side rebuilds its path and status from the admin request each time it is read, and copies each office action into the activity log once.
- Bridged spaces today: Dr. Reddy's Auditorium, Black Box Theatre, Dance Studio and Multi-Purpose Hall (matched to the room "MPH" in the Admin Block, 200 seats in the admin list against 400 in the brief, so confirm). Takshila, the Residence Hall and the Sports Block have no admin room, so those requests stay student only.
- The route table from the brief still drives the preview on the form. After sending, a bridged request shows the admin chain instead. Reconciling the two is open question 8.
- A club cancelling a bridged request is recorded in the admin portal as not approved with the reason "Withdrawn by the club." because the admin portal has no withdraw action. Add one if that wording is wrong for the offices.
- A follow-up shows in the admin request log as a note. Moving the demo clock from the student page moves the admin clock too. Moving it from the admin demo bar does not move the student clock.
- The admin portal refuses very little (it flags). So the slot conflict screen with three alternatives is still not built.
