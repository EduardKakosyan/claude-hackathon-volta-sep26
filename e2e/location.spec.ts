import { expect, test, type Page } from '@playwright/test'

import { isPhone, rows, sheet, stubMapTiles, waitForApp } from './helpers'

/**
 * Location on load. Playwright grants or withholds the permission per context
 * and fakes the position, so every branch of the PRD's flow is reachable
 * without a device: granted → "Closest to you", declined → "Near Halifax" with
 * the downtown note, far away → the far note. The native alert itself is the
 * Simulator's job (docs/sim.md).
 */
/** Halifax, by the Armdale Rotary: Chocolate Lake is the nearest monitored beach, under 3 km away. */
const DOWNTOWN = { latitude: 44.645, longitude: -63.59 }
const TORONTO = { latitude: 43.6532, longitude: -79.3832 }

const heading = (page: Page) => page.locator('.beach-shell-panel-heading h2')
const note = (page: Page) => page.locator('.beach-shell-list-note')
/** The first row's distance, read back from its text ("2.6 km" → 2.6). */
const firstKm = async (page: Page) =>
  parseFloat((await rows(page).first().locator('.beach-shell-row-distance').textContent()) ?? '')
const marker = (page: Page) => page.locator('[data-slot="user-marker"]')
const mapUnavailable = (page: Page) => page.getByRole('alert').filter({ hasText: 'The map could not load' })

test.describe('location', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
  })

  test('granted: the directory is closest to the visitor, the dot is on the map, and the camera goes to them', async ({
    page,
    context,
  }, testInfo) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(DOWNTOWN)
    await page.goto('/')
    await waitForApp(page)

    await expect(heading(page)).toHaveText('Closest to you')
    await expect(note(page)).toHaveAttribute('data-origin', 'user')
    await expect(note(page)).not.toContainText('downtown Halifax')
    await expect(rows(page).first()).toContainText('Chocolate Lake Beach')
    expect(await firstKm(page)).toBeLessThan(5)

    test.skip(await mapUnavailable(page).isVisible(), 'this browser cannot start the map (no WebGL)')

    // The camera fits the visitor and the three nearest pins: a neighbourhood,
    // not the province, with the dot in the part of the map the sheet leaves clear.
    await expect(marker(page)).toBeInViewport()
    await expect(page.locator('.beach-shell-map')).toHaveAttribute('data-zoom-band', /^(beach|region)$/)
    if (isPhone(testInfo)) {
      await page.waitForTimeout(1500) // the fit animates for 1.2 s
      const dot = (await marker(page).boundingBox())!
      const sheetTop = (await sheet(page).boundingBox())!.y
      expect(dot.y + dot.height).toBeLessThanOrEqual(sheetTop)
    }
    await expect(page.locator('.beach-shell-locate')).toHaveAttribute('data-status', 'granted')
  })

  test('declined: "Near Halifax" with the downtown note, the map stays on Halifax, the locate button is disabled', async ({
    page,
  }) => {
    // No grantPermissions: the request is refused without a prompt.
    await page.goto('/')
    await waitForApp(page)

    await expect(heading(page)).toHaveText('Near Halifax')
    await expect(note(page)).toHaveAttribute('data-origin', 'halifax')
    await expect(note(page)).toContainText('Showing distances from downtown Halifax.')
    await expect(rows(page).first()).toContainText('Chocolate Lake Beach')
    await expect(page.locator('[data-slot="user-marker"]')).toHaveCount(0)
    await expect(page.locator('.beach-shell-map')).toHaveAttribute('data-zoom-band', 'region')
    await expect(page.locator('.beach-shell-locate')).toHaveAttribute('data-status', /^(denied|unavailable)$/)
  })

  test('far away: still closest to the visitor, with honest distances and the far note', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(TORONTO)
    await page.goto('/')
    await waitForApp(page)

    await expect(heading(page)).toHaveText('Closest to you')
    await expect(note(page)).toHaveAttribute('data-far', 'true')
    await expect(note(page)).toContainText('There are no monitored beaches nearby.')
    expect(await firstKm(page)).toBeGreaterThan(400)
    await expect(rows(page).first().locator('.beach-shell-row-distance')).toHaveText(/^\d{3,4} km$/)

    test.skip(await mapUnavailable(page).isVisible(), 'this browser cannot start the map (no WebGL)')
    // Toronto is a thousand kilometres off the opening Halifax frame; only a real
    // flight brings the dot on screen, at a zoom that also holds the nearest pins.
    await expect(marker(page)).toBeInViewport()
    await expect(page.locator('.beach-shell-map')).toHaveAttribute('data-zoom-band', 'province')
  })

  test('search ranks by field: "Grand Lake" finds Oakfield Park through its water body', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    await page.locator('input[placeholder*="Find a beach"]').fill('Grand Lake')
    // The roster has one beach on Shubenacadie Grand Lake; Dollar Lake is its own lake.
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('Oakfield Park Beach')
    await expect(heading(page)).toHaveText('Your results')

    await page.locator('input[placeholder*="Find a beach"]').fill('Banook')
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('Birch Cove Beach')
  })

  test('the locate button floats on the map above the sheet edge', async ({ page }, testInfo) => {
    await page.goto('/')
    await waitForApp(page)

    const locate = page.locator('.beach-shell-locate')
    await expect(locate).toBeVisible()
    const box = (await locate.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)

    // It shares the map's right edge with the replay control; the two never overlap.
    const replay = (await page.getByLabel('Replay a day').boundingBox())!
    const apart =
      box.y >= replay.y + replay.height || box.y + box.height <= replay.y || box.x >= replay.x + replay.width || box.x + box.width <= replay.x
    expect(apart).toBe(true)

    if (!isPhone(testInfo)) return
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
    await page.waitForFunction(() => {
      const el = document.querySelector('.beach-sheet')
      return el !== null && el.getAnimations().length === 0
    })
    const sheetTop = (await sheet(page).boundingBox())!.y
    expect(box.y + box.height).toBeLessThanOrEqual(sheetTop + 1)
  })
})
