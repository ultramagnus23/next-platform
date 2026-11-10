# Room booking admin portal

Admin side of the campus room booking system, at `/admin/bookings`. The spec is `PRD.md` (v2).

## What it does

Every request is sorted on arrival into a lane: Clash, Needs a look or Clear. Approvers work the Inbox, approve Clear requests together,
offer a free room instead of saying no, and resolve a clash in one decision. Every action is logged, emails are queued in an outbox and
single decisions can be undone for 10 seconds.

Screens: Inbox, Clashes, Rooms (day grid with find bar, week and month views), Calendar (agenda), Organisations, Sent emails, Rules. A request opened from the grid has its own page.

Not built: the organisation-facing portal, real email, real AMS, Strapi.

## Run the demo

1. Set `BOOKING_DEMO_MODE=true` in `.env`. Sign in with an account that holds the `booking_admin` grant (a super admin does).
   For a local run with no sign-in, also set `BYPASS_AUTH=true`. That works only outside production.
2. `npm run dev`, open `/admin/bookings`.
3. "Viewing as" switches persona. The overflow menu simulates a club request, advances the clock one day and resets the data.

Scenario checks:

```bash
npx tsx src/app/admin/bookings/_server/engine/scenarios.ts
```

## Env keys

| Key | Purpose |
|-----|---------|
| `BOOKING_OFFICES` | Who acts for each office: `slo:a@x.in,b@x.in;oa:...;cfe:...;acad:...`. Malformed input is treated as empty. |
| `BOOKING_DEMO_MODE` | `true` enables personas, simulated requests, the clock and reset. |

## What is mocked

- Data lives in memory (`_server/repo/memory.ts`) and resets on restart. One Node process only.
- Emails are shown, never sent. AMS shows a "synced (simulated)" badge.
- Organisations, the timetable, request history and no-show records are invented. Venues are the real campus inventory, with placeholder
  opening hours and equipment.

## Layout

| Path | Holds |
|------|-------|
| `_server/engine/` | Pure functions: occupancy and clashes, flags and lanes, priority, workflow and sweep, availability, auto-approval, notifications |
| `_server/service.ts` | The only repository caller: locks, versions, bulk approve, undo, resolve |
| `_server/repo/` | Interface, in-memory store, venue and organisation fixtures, seed |
| `_server/actor.ts`, `access.ts`, `offices.ts` | Who is acting and what they may do |
| `_components/` | Page components |
| `src/app/api/admin/bookings/` | Routes |

## Swapping in Strapi

1. Create the collection types in `PRD.md` section 5.
2. Implement `BookingRepository` (`_server/repo/repository.ts`) against Strapi and return it from `getBookingRepository()`.
3. Move the room-date lock, version check and undo snapshot into a custom Strapi controller with a database transaction.
4. Drain the outbox through `sendMail()` in `src/lib/apis/mail.ts`.

## Known gaps

- `npm run build` needs Google Fonts. Without network access, set `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` to a mock module.
- `switch`, `radio-group`, `alert-dialog` and `hover-card` were never added to `src/components/ui/`. The free-only toggle is a small
  accessible switch built in place, and room choices are buttons with `aria-pressed`.
