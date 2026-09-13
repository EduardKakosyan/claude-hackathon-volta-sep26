import { expect, test } from '@playwright/test'

import { detail, openBeach, row, rows, stubMapTiles, watchPageErrors } from './helpers'

/** Open in the fixture day via halifax.ca, so the detail carries a live source link. */
const BEACH = 'Chocolate Lake Beach'
const BEACH_ID = 'hrm-chocolate-lake'

test.describe('detail', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
  })

  test('selecting from the list opens the detail with the name as heading and a source link', async ({ page }) => {
    await page.goto('/')
    const article = await openBeach(page, BEACH)

    await expect(page.getByRole('button', { name: 'Back to beaches' })).toBeVisible()
    await expect(page.locator('.beach-shell-count')).toContainText('1 of 35 beaches')

    const sourceLink = article.getByRole('link', { name: /open the source page/i })
    await expect(sourceLink).toBeVisible()
    await expect(sourceLink).toHaveAttribute('target', '_blank')
  })

  test('selecting a map pin opens the same detail; closing it returns focus to the search box', async ({ page }) => {
    await page.goto('/')

    const pin = page.locator(`.beach-map-pin[aria-label^="${BEACH}"]`)
    const mapUnavailable = page.getByRole('alert').filter({ hasText: 'The map could not load' })
    await expect(pin.or(mapUnavailable).first()).toBeAttached({ timeout: 30_000 })
    test.skip(await mapUnavailable.isVisible(), 'this browser cannot start the map (no WebGL)')

    const mapSection = page.locator('.beach-shell-map')
    await expect(mapSection).toHaveAttribute('data-zoom-band', 'region')

    // Pins can overlap, so drive the control rather than hit-test the canvas.
    await pin.dispatchEvent('click')
    const article = detail(page)
    await expect(article).toBeVisible()
    await expect(article.getByRole('heading', { level: 2 })).toHaveText(BEACH)
    // The camera flies in to the beach; the pins are at full size there.
    await expect(mapSection).toHaveAttribute('data-zoom-band', 'beach', { timeout: 15_000 })

    await page.getByRole('button', { name: 'Back to beaches' }).click()
    await expect(article).not.toBeVisible()
    await expect(page.locator('input[placeholder*="Find a beach"]')).toBeFocused()
  })

  test('closing the detail returns focus to the row it was opened from', async ({ page }) => {
    await page.goto('/')
    const origin = row(page, BEACH)
    await expect(origin).toHaveAttribute('data-beach-id', BEACH_ID)
    await openBeach(page, BEACH)

    await page.getByRole('button', { name: 'Back to beaches' }).click()
    await expect(detail(page)).not.toBeVisible()

    await expect(page.locator(`[data-beach-id="${BEACH_ID}"]`)).toBeFocused()
  })

  test('keyboard: type a query, focus a row, press Enter', async ({ page }) => {
    await page.goto('/')
    const searchInput = page.locator('input[placeholder*="Find a beach"]')
    await searchInput.focus()
    await searchInput.pressSequentially('chocolate')
    await expect(rows(page)).toHaveCount(1)

    const firstRow = rows(page).first().locator('button')
    await firstRow.focus()
    await firstRow.press('Enter')

    const article = detail(page)
    await expect(article).toBeVisible()
    await expect(article.getByRole('heading', { level: 2 })).toHaveText(BEACH)
  })

  test('Escape closes the detail', async ({ page }) => {
    await page.goto('/')
    await openBeach(page, BEACH)

    await page.keyboard.press('Escape')
    await expect(detail(page)).not.toBeVisible()
    await expect(rows(page)).toHaveCount(35)
  })

  test('reduced motion: the detail opens and closes without a page error', async ({ page }) => {
    const errors = await watchPageErrors(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.goto('/')
    await openBeach(page, BEACH)
    await page.getByRole('button', { name: 'Back to beaches' }).click()
    await expect(detail(page)).not.toBeVisible()

    expect(errors()).toEqual([])
  })
})
