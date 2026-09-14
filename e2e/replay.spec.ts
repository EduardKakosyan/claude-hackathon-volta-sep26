import { expect, test } from '@playwright/test'

import { isPhone, rows, stubMapTiles, waitForApp } from './helpers'

/**
 * Replay a day. The fixture store serves every day of 2026 up to September 12,
 * so the scrubber has a real year to walk and August 14 has its two provincial
 * advisories and the Oakfield closure.
 */
test.describe('replay a day', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
  })

  test('the pill opens a strip of days; a chip replays it, the pill says so, and the close returns to today', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForApp(page)

    const toggle = page.getByRole('button', { name: 'Replay a day' })
    await expect(toggle).toHaveText(/Today/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByLabel('Back to today')).toHaveCount(0)

    await toggle.click()
    const strip = page.getByRole('list', { name: 'Recorded days' })
    await expect(strip).toBeVisible()
    await expect(strip.getByRole('list', { name: 'August 2026' })).toBeVisible()
    // Every day of the year so far, plus today.
    expect(await strip.getByRole('link').count()).toBeGreaterThan(250)

    await strip.getByRole('link', { name: /^August 14, 2026/ }).click()
    await expect(page).toHaveURL(/\?day=2026-08-14$/)
    await expect(toggle).toHaveText(/Replaying Aug 14/)
    // The strip survives the navigation, with the day marked.
    await expect(strip.getByRole('link', { name: /^August 14, 2026/ })).toHaveAttribute('aria-current', 'date')
    await expect(rows(page).filter({ hasText: 'Oakfield Park Beach' })).toContainText('Closed')
    await expect(rows(page).filter({ hasText: 'Rainbow Haven Beach' })).toContainText('Advisory')

    // The strip never lands on the locate button.
    const locate = (await page.locator('.beach-shell-locate').boundingBox())!
    const box = (await page.locator('.beach-scrubber-strip').boundingBox())!
    const apart =
      box.y >= locate.y + locate.height || box.y + box.height <= locate.y || box.x >= locate.x + locate.width || box.x + box.width <= locate.x
    expect(apart).toBe(true)

    await page.getByLabel('Back to today').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(toggle).toHaveText(/Today/)
  })

  test('a replay link opens on the strip and keeps the beach through the days', async ({ page }, testInfo) => {
    await page.goto('/?day=2026-08-14&beach=hrm-oakfield-park')
    await waitForApp(page)

    const strip = page.getByRole('list', { name: 'Recorded days' })
    await expect(strip).toBeVisible()
    await expect(page.getByRole('article', { name: 'Oakfield Park Beach' })).toContainText('Closed')

    await strip.getByRole('link', { name: /^August 24, 2026/ }).click()
    await expect(page).toHaveURL(/\?day=2026-08-24&beach=hrm-oakfield-park$/)
    await expect(page.getByRole('article', { name: 'Oakfield Park Beach' })).toContainText('Open')
    await expect(page.getByRole('article', { name: 'Oakfield Park Beach' })).toContainText('reopens')

    if (isPhone(testInfo)) return
    // The footer, which a phone folds away, names the day rather than a time.
    await expect(page.locator('.beach-shell-footer')).toContainText('Replaying August 24, 2026')
  })
})
