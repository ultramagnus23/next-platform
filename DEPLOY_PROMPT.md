Paste this into Claude in Chrome. Before you do: push main (say "Push main" in the Claude Code chat) and be signed in to Render in Chrome, with GitHub connected to Render.

---

Deploy my GitHub repo `ultramagnus23/next-platform` (branch `main`) to Render as a public web service and give me the live URL.

I am already signed in to Render in this browser. If you hit a sign-in, sign-up or GitHub permission screen, stop and tell me. Do not create accounts or enter passwords.

Steps:
1. Go to https://dashboard.render.com/blueprints and click "New Blueprint Instance".
2. Pick the repo `ultramagnus23/next-platform` and the branch `main`. If the repo is not listed, click "Configure account" to grant Render access to that repo only, then come back.
3. Render reads `render.yaml` in the repo root and shows one web service called `booking-sandbox` on the Free plan. Leave every setting as it is. The environment variables PUBLIC_SANDBOX, BOOKING_DEMO_MODE, AUTH_TRUST_HOST and NEXTAUTH_SECRET are already filled in by the blueprint. Do not add any other secrets or keys.
4. Click "Apply" / "Deploy Blueprint".
5. Open the `booking-sandbox` service and watch the Logs tab until the build finishes and the service shows "Live". The first build takes about 5 to 10 minutes. If the build fails, read the last 40 log lines and tell me the error. Do not change settings to work around it.
6. Copy the public URL at the top of the service page (it ends in `.onrender.com`).
7. Open `<that URL>/admin/bookings` in a new tab. Confirm that it loads with no sign-in, shows the banner "Public sandbox: you are working on your own private copy of made-up data", and the Inbox has requests in it. Click Rooms and Clashes in the sidebar to confirm they load.
8. Report back: the live URL to share (`<URL>/admin/bookings`), and whether the check in step 7 passed.

Notes for me: the free plan sleeps after idle, so the first visit afterwards takes about a minute. Do not upgrade the plan, add a database, or change the instance count.
