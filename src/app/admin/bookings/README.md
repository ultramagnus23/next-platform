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

## Real sign-in check

`_server/real-signin-check.cjs` runs 26 checks of the real access path with no demo flags and no bypass. It mints genuine NextAuth
session cookies, so the middleware, role claims, the office lookup and the "Acting for" switch all run as after a Google sign-in.

```bash
NEXTAUTH_SECRET=real-test-secret AUTH_CLIENT_ID=x AUTH_CLIENT_SECRET=y \
BOOKING_OFFICES="slo:slo.tester@ashoka.edu.in;acad:acad.tester@ashoka.edu.in;oa:two.tester@ashoka.edu.in;cfe:two.tester@ashoka.edu.in" \
SUPERADMIN_EMAILS=super.tester@ashoka.edu.in npx next dev -p 3200
node src/app/admin/bookings/_server/real-signin-check.cjs   # in a second terminal
```

It covers: signed-out redirects, a signed-in non-member, a forged role claim, scoped inboxes per office, refusing other offices, the
Acting for switch for a two-office person, super-admin-only rules, demo routes returning 404, and the persona cookie being ignored.
What it cannot cover is the Google consent screen and the Strapi user record: those need a real `@ashoka.edu.in` account.

To do that last step yourself: set `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `STRAPI_URL`, `STRAPI_API_TOKEN`,
`SUPERADMIN_EMAILS` and `BOOKING_OFFICES` in `.env`, leave `BOOKING_DEMO_MODE` and `BYPASS_AUTH` unset, run `npm run dev`, and sign in
with an account listed in `BOOKING_OFFICES`. A role change reaches a signed-in person within 10 minutes, or immediately on a new sign-in.
If Strapi is down, an existing session keeps its old role and retries after a minute.
