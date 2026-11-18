import { defineConfig } from '@playwright/test'

const PORT = 3300

/**
 * End to end checks for the student portal, at phone, tablet and desktop widths. Runs against a production
 * build in sandbox mode (build first). Uses the Edge that ships with Windows, so no browser is downloaded.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'e2e-output/results',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'msedge', trace: 'off' },
  projects: [
    { name: 'phone', use: { viewport: { width: 375, height: 812 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/student`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { PUBLIC_SANDBOX: 'true', BOOKING_DEMO_MODE: 'true', NEXTAUTH_SECRET: 'e2e-not-a-secret', AUTH_TRUST_HOST: 'true', APPROVAL_TOKEN_SECRET: 'e2e-approval-secret-value' },
  },
})
