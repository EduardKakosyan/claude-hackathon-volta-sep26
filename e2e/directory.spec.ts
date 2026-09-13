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

    // No permission was granted, so the directory is measured from downtown
    // Halifax: closest first, a distance on every row, and the heading says so.
    await expect(page.locator('.beach-shell-panel-heading h2')).toHaveText('Near Halifax')
    await expect(rows(page).first()).toContainText('Chocolate Lake Beach')
    await expect(rows(page).first().locator('.beach-shell-row-distance')).toHaveText(/^\d+(\.\d)? km$/)
    await expect(rows(page).last()).toContainText('Dominion Beach')
    await expect(page.locator('.beach-shell-row-distance')).toHaveCount(35)

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

  test('on a laptop-height window the pinned footer leaves the first rows in view', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'the pinned panel footer is a desktop layout')
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')

    // The footer is the unknown count, the freshness line and one closed line; the rest is folded.
    const footer = page.locator('.beach-shell-footer')
    const more = footer.locator('details.beach-shell-footer-more')
    await expect(more).not.toHaveAttribute('open', '')
    await expect(footer.locator('.beach-shell-credits')).toBeHidden()
    const footerBox = (await footer.boundingBox())!
    expect(footerBox.height).toBeLessThan(100)

    // Three rows end above the footer's top edge without scrolling.
    for (let i = 0; i < 3; i += 1) {
      const row = (await rows(page).nth(i).boundingBox())!
      expect(row.y + row.height, `row ${i} above the footer`).toBeLessThanOrEqual(footerBox.y + 1)
    }

    // Opening the line reveals the disclaimer, the credits and the suggestion link.
    await more.locator('summary').click()
    await expect(more).toHaveAttribute('open', '')
    await expect(footer.locator('a', { hasText: 'Open-Meteo' })).toBeVisible()
    await expect(footer.locator('a', { hasText: 'Suggest one' })).toBeVisible()
  })
})
