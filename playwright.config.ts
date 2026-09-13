import { defineConfig, devices } from '@playwright/test'

/**
 * The assertion layer of the verification rig: five engine/viewport projects,
 * a screenshot for every test, and traces + video when a retry is needed.
 *
 * Projects
 * - chromium-desktop     1440×900, mouse.
 * - chromium-iphone      Playwright's iPhone 16 descriptor (393×659 layout viewport,
 *                        DPR 3, touch, Mobile Safari UA) run under Chromium, so the
 *                        phone layout is covered by both engines.
 * - webkit-iphone        the same descriptor on WebKit: the closest thing to Mobile
 *                        Safari that runs headless in CI.
 * - webkit-iphone-land   iPhone 16 landscape (734×343): the `max-height: 600px`
 *                        rule in beach-shell.css.
 * - webkit-ipad          iPad Pro 11 portrait (834×1194): above the 760 px phone
 *                        breakpoint, so it must keep the desktop layout.
 *
 * Data: with no SUPABASE_* variables the app serves the fixture day
 * (lib/fixture/today.ts), so every assertion is deterministic and no test needs
 * the network. Map tile hosts are blocked per test in e2e/helpers.ts.
 *
 * Web server: locally `pnpm dev`, and a dev server that is already running on
 * :3000 is reused, so keep one open while iterating. CI builds and serves the
 * production bundle instead: a cold dev server compiling chunks on demand under
 * parallel workers can hand a script request an HTML page ("Unexpected token
 * '<'"), and the production server is what nsbeaches.ca runs anyway.
 * Screenshots land in test-results/e2e/<test>/ per project.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Locally cap at 2 workers (override with PW_WORKERS=n): the default of
  // cores/2 spawns a browser per worker across five projects and pegs the CPU.
  workers: process.env.CI ? 1 : Number(process.env.PW_WORKERS ?? 2),
  // Playwright empties its output directory before every run. Keep it to its
  // own subdirectory so `pnpm sim shot` (test-results/sim/) is not wiped.
  outputDir: 'test-results/e2e',
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    // PLAYWRIGHT_BASE_URL points the suite at a deployment (docs/deploy.md); no server is started then.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'on',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chromium'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-iphone',
      use: { ...devices['iPhone 16'], browserName: 'chromium' },
    },
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 16'] },
    },
    {
      name: 'webkit-iphone-land',
      use: { ...devices['iPhone 16 landscape'] },
    },
    {
      name: 'webkit-ipad',
      use: { ...devices['iPad Pro 11'] },
    },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
})
