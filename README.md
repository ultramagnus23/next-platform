# Room Bookings Admin

Admin portal for campus room and event bookings. Authorities (SLO, OA, CFE, Academic Booking) review
requests, resolve conflicts and see room availability. Every decision queues an email.

This repository holds only that portal, its sign-in and its shell. The feature spec is in
`src/app/admin/bookings/PRD.md` and the current state is in `src/app/admin/bookings/README.md`.

## Run

```bash
npm install
npm run dev
```

Set `BOOKING_DEMO_MODE=true` for the persona switcher and simulated data. See `.env.example` for the
booking keys. Sign-in uses Google through NextAuth and the Strapi user store (`src/auth.ts`).

## Checks

```bash
npm run typecheck
npx tsx src/app/admin/bookings/_server/engine/scenarios.ts
```
