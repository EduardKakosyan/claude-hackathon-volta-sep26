import { expect, test } from '@playwright/test'

import { rows, stubMapTiles, watchPageErrors } from './helpers'

test.describe('directory', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
  })

  test('loads with the heading and all 35 beaches listed, without a page error', async ({ page }) => {
    const errors = await watchPageErrors(page)
    await page.goto('/')

    const heading = page.locator('h1')
    await expect(heading).toContainText('Is the beach open?')
    await expect(heading).toBeVisible()

    await expect(rows(page)).toHaveCount(35)
    await expect(page.locator('.beach-shell-count')).toContainText('35 of 35 beaches')

    // Give the map's workers time to start: a worker that dies parsing HTML shows up here.
    await expect(page.locator('.beach-map-pin').first()).toBeAttached({ timeout: 30_000 })
    // The page opens on the Halifax region, the middle of the three zoom bands.
    await expect(page.locator('.beach-shell-map')).toHaveAttribute('data-zoom-band', 'region')
    await page.waitForTimeout(1000)
    expect(errors()).toEqual([])
  })

  test('search narrows the directory and the count agrees; clearing restores 35', async ({ page }) => {
    await page.goto('/')
    const searchInput = page.locator('input[placeholder*="Find a beach"]')
    const countText = page.locator('.beach-shell-count')

    await searchInput.fill('Lake')
    await expect
      .poll(async () => rows(page).count())
      .toBeLessThan(35)
    const narrowed = await rows(page).count()
    expect(narrowed).toBeGreaterThan(0)
    await expect(countText).toContainText(`${narrowed} of 35 beaches`)

    await page.locator('button[aria-label="Clear search"]').click()
    await expect(rows(page)).toHaveCount(35)
    await expect(countText).toContainText('35 of 35 beaches')
  })

  test('a status filter narrows the directory; combined with search the count still agrees', async ({ page }) => {
    await page.goto('/')
    const countText = page.locator('.beach-shell-count')
    const filterButtons = page.locator('.beach-shell-filters button')

    // "Open / no advisory" is the second button after "All beaches".
    await filterButtons.nth(1).click()
    await expect(filterButtons.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => rows(page).count())
      .toBeLessThan(35)
    const afterFilter = await rows(page).count()
    expect(afterFilter).toBeGreaterThan(0)
    await expect(countText).toContainText(`${afterFilter} of 35 beaches`)

    await page.locator('input[placeholder*="Find a beach"]').fill('beach')
    await expect
      .poll(async () => rows(page).count())
      .toBeLessThan(afterFilter)
    const afterSearch = await rows(page).count()
    await expect(countText).toContainText(`${afterSearch} of 35 beaches`)
  })

  test('the fixture day shows a spread of states and says so in the footer', async ({ page }) => {
    await page.goto('/')
    const footer = page.locator('.beach-shell-footer')
    await expect(footer).toContainText('Showing a fixture day, not live status')
    await expect(footer).toContainText('2 beaches have no status available')

    const status = (state: string) => page.locator(`.beach-shell-row-status[data-state="${state}"]`)
    for (const state of ['open', 'advisory', 'closed', 'offseason', 'unknown']) {
      expect(await status(state).count(), `at least one ${state} row`).toBeGreaterThan(0)
    }
    await expect(status('unknown')).toHaveCount(2)
  })
})
