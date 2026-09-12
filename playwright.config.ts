import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for beach UI smoke tests.
 *
 * Web server strategy:
 * - Uses `pnpm dev` (Next.js dev server) rather than `pnpm build && pnpm start`
 *   because dev rebuilds are faster for local iteration and test reliability.
 * - `reuseExistingServer: !process.env.CI` allows local dev to reuse a running server,
 *   while CI always starts fresh.
 *
 * Browser coverage:
 * - Chromium only (desktop + mobile). Firefox and WebKit are intended CI additions.
 * - Desktop: 1440×900 (standard landscape breakpoint)
 * - Mobile: 390×844 (iPhone SE / smaller device)
 *
 * Tile mocking:
 * - External map tiles (tiles.maps.eox.at, s3.amazonaws.com) are intercepted and
 *   replaced with a 1×1 PNG stub so the map initializes without external dependencies.
 * - Real-tile checking is manual only — smoke tests verify the app is usable when
 *   tiles are unavailable, not that tiles render correctly.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chromium'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
