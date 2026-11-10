# Booking admin portal

Admin side of the room booking system, at `/admin/bookings`. The spec is `PRD.md`.

## Current state

Built and working in demo mode: Today's work (queue grouped by organisation), global search, Requests,
Request detail with every action, Conflicts with the resolve flow, Rooms board, Calendar (day, week,
month), Organisation directory and profiles, Outbox and Settings. Organisations carry a short code and
colour (see PRD section 14). All data is
in memory. No email is sent and there is no AMS link.

Not built: the organisation-facing portal, Strapi collections, real mail sending, recurring
bookings, a campus map (see PRD section 12).

## Run the demo

1. In `.env`, set `BOOKING_DEMO_MODE=true`. Sign in with an account that holds the `booking_admin`
   grant (a super admin does).
2. `npm run dev`, then open `/admin/bookings`.
3. Use "Viewing as" to switch persona, "Simulate request" to act as an organisation, and the
   overflow menu to reset the data.

Local shortcut with no sign-in: set both `BOOKING_DEMO_MODE=true` and `BYPASS_AUTH=true`. This works
only outside production builds (see `src/middleware.ts` and `isDevBypass()` in `_server/authorities.ts`).

The demo script is in `PRD.md` section 11. Seed dates are relative to the day the server starts, so
the demo pair sits four days ahead.

Scenario checks (engines and service, no framework):

```bash
npx tsx src/app/admin/bookings/_server/engine/scenarios.ts
```

## Env keys

| Key | Purpose |
|-----|---------|
| `BOOKING_AUTHORITIES` | Who acts for each authority. `slo:a@x.in,b@x.in;oa:...;cfe:...;acad:...`. Malformed input is treated as empty. |
| `BOOKING_DEMO_MODE` | `true` enables the persona switcher, reset and simulated submission. |

## What is mocked

- **Data:** `_server/repo/memory.ts` holds everything on `globalThis`. It resets on restart and works on one Node
  process only.
- **Email:** the Outbox page shows what would be sent.
- **AMS:** a "synced (simulated)" badge with a timestamp.
- **Names, rooms, emails:** placeholders in `_server/repo/fixtures.ts`.

## Layout

| Path | Holds |
|------|-------|
| `_server/engine/` | Pure functions: overlap, conflicts, priority, workflow, availability, auto-approval, notifications |
| `_server/service.ts` | The only repository caller. Room-date locking, version checks, all-or-nothing resolve |
| `_server/repo/` | `repository.ts` interface, `memory.ts`, `seed.ts`, `fixtures.ts`, `index.ts` |
| `_server/actor.ts`, `access.ts`, `authorities.ts` | Who is acting and what they may see and do |
| `_components/` | Page components |
| `src/app/api/admin/bookings/` | Routes |

## Swapping the repository for Strapi

1. Create the collection types listed in `PRD.md` section 5.
2. Write a class that implements `BookingRepository` (`_server/repo/repository.ts`) against Strapi.
3. Return it from `getBookingRepository()` in `_server/repo/index.ts`.
4. Move the room-date lock and the version check into a custom Strapi controller that uses a database
   transaction. Strapi's REST API cannot do this, and `KeyedMutex` only works inside one process.
5. Drain the outbox through `sendMail()` in `src/lib/apis/mail.ts` instead of rendering it.

Pages, routes and engines need no change.

## Known gaps

- `npm run build` needs Google Fonts. Where the fonts cannot be fetched, build with
  `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` pointing at a mock module.
- The Requests table uses `ui/table` with a card layout on mobile instead of the shared `DataTable`,
  which has no card layout.
- The "Rejected in last 30 days" tile counts by decision date, but its link lists all rejected requests.
- `switch`, `radio-group`, `alert-dialog` and `hover-card` were not installed, so the auto-approval toggle
  is a checkbox.
- Strapi collection types, real email and AMS are milestone M7, after the demo.
