import { expect, test } from '@playwright/test'

import { openBeach, stubMapTiles, waitForApp } from './helpers'

/**
 * The beach's own season in the detail. The fixture store serves the seeded
 * year, so Oakfield carries the July 28 closure and the August 24 reopening.
 *
 * The seed stops on September 12, but the band runs to today's Halifax date
 * (lib/db/queries.ts reads the clock even in fixture mode), so `End` lands on
 * a day that moves. The key walk below counts its steps from today so the
 * days it asserts on stay the same whatever the date.
 */

/** Today's Halifax calendar date, the same way the server works it out. */
const halifaxToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Halifax', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

test.describe('season timeline', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
  })

  test('the detail loads the beach’s year, the band shows the closure, the keys walk it, and a picked day replays', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const article = await openBeach(page, 'Oakfield Park Beach')

    const timeline = article.getByRole('region', { name: 'Season timeline' })
    await expect(timeline).toContainText('2026 season')
    await expect(timeline).toContainText('Jul 1 – Aug 31')
    const band = timeline.getByRole('slider')
    await expect(band).toBeVisible()
    // Off-season stub · open · closed · open · off-season stub (· today, unrecorded, in fixture mode).
    const closed = band.locator('[data-segment][data-state="closed"]')
    await expect(closed).toHaveCount(1)
    await expect(band.locator('[data-segment][data-collapsed]')).toHaveCount(2)
    // The closed run is wider than the stub: the season has the width.
    const closedBox = (await closed.boundingBox())!
    const stubBox = (await band.locator('[data-segment][data-collapsed]').first().boundingBox())!
    expect(closedBox.width).toBeGreaterThan(stubBox.width * 3)

    // End is today. Page keys step a week and arrows a day, so walk back the
    // exact distance to a fixed off-season day, exercising both.
    const today = halifaxToday()
    const back = daysBetween('2026-09-06', today)
    await band.focus()
    await page.keyboard.press('End')
    await expect(band).toHaveAttribute('aria-valuenow', String(daysBetween('2026-01-01', today)))
    for (let i = 0; i < Math.floor(back / 7); i++) await page.keyboard.press('PageDown')
    for (let i = 0; i < back % 7; i++) await page.keyboard.press('ArrowLeft')
    await expect(band).toHaveAttribute('aria-valuetext', /September 6, 2026: Off-season/)
    const readout = timeline.locator('.beach-timeline-readout')
    await expect(readout).toContainText('Outside the published lifeguard season')

    // Back into August: the closure, with its inferred note.
    for (let i = 0; i < 3; i++) await page.keyboard.press('PageDown')
    await expect(band).toHaveAttribute('aria-valuetext', 'August 16, 2026: Closed')
    await expect(readout).toContainText('Oakfield Beach for a toxin-producing blue-green algae bloom')

    const replay = readout.getByRole('link', { name: 'Replay Aug 16 on the map' })
    await expect(replay).toHaveAttribute('href', '/?day=2026-08-16&beach=hrm-oakfield-park')
    await replay.click()
    await expect(page).toHaveURL(/\?day=2026-08-16&beach=hrm-oakfield-park$/)
    await expect(page.getByRole('button', { name: 'Replay a day' })).toHaveText(/Replaying Aug 16/)
    // The detail is open on the replayed day, with the band picked there and no replay of it offered.
    const again = page.getByRole('article').getByRole('region', { name: 'Season timeline' })
    await expect(again.getByRole('slider')).toHaveAttribute('aria-valuetext', 'August 16, 2026: Closed')
    await expect(again.getByRole('link', { name: /Replay/ })).toHaveCount(0)
  })

  test('a beach with a clean season reads open all summer, and the chips of the scrubber carry a bar', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const article = await openBeach(page, 'Chocolate Lake Beach')
    const timeline = article.getByRole('region', { name: 'Season timeline' })
    await expect(timeline).toContainText('62 days open')
    await expect(timeline.getByRole('slider').locator('[data-segment][data-state="closed"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Replay a day' }).click()
    const strip = page.getByRole('list', { name: 'Recorded days' })
    const aug14 = strip.getByRole('link', { name: /^August 14, 2026/ })
    await expect(aug14.locator('.beach-scrubber-bar > i')).toHaveCount(3)
    await expect(aug14.locator('.beach-scrubber-bar > i').first()).toHaveAttribute('data-state', 'closed')
  })
})
