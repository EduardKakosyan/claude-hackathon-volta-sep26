import { expect, test, type Page } from '@playwright/test'

import { openBeach, row, rows, stubMapTiles, waitForApp } from './helpers'

/**
 * Off-season, reached in any month through the fixture store's test-only
 * `?fixture=offseason` day (lib/fixture/today.ts): every beach written as the
 * calendar's row, no status source read, wind and the buoy still current. The
 * same screens flip what they lead with — pins go to the calm ring, rows and
 * the detail lead with conditions, the footer names the closed authorities —
 * and nothing may look like the dashed "unknown" error state.
 */
const DIRECTION = '(N|NE|E|SE|S|SW|W|NW)'
const CLOCK = '\\d{1,2}(:\\d{2})? [ap]\\.m\\.'

const statusOf = (page: Page, name: string) => row(page, name).locator('.beach-shell-row-status')
const mapUnavailable = (page: Page) => page.getByRole('alert').filter({ hasText: 'The map could not load' })

test.describe('off-season', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
    await page.goto('/?fixture=offseason')
  })

  test('every row shows its conditions where the status word was', async ({ page }) => {
    await expect(rows(page)).toHaveCount(35)
    const cells = page.locator('.beach-shell-row-status')
    await expect(cells).toHaveCount(35)
    expect(await cells.evaluateAll((els) => els.map((el) => el.getAttribute('data-state')))).toEqual(Array(35).fill('offseason'))
    expect(await cells.evaluateAll((els) => els.map((el) => el.getAttribute('data-conditions')))).toEqual(Array(35).fill('true'))

    // A lake: wind alone, no "Wind", no time. An ocean beach near the buoy: water first.
    await expect(statusOf(page, 'Chocolate Lake Beach')).toHaveText(new RegExp(`^\\d+ km/h ${DIRECTION}$`))
    await expect(statusOf(page, 'Rainbow Haven Beach')).toHaveText(new RegExp(`^\\d+ °C · \\d+ km/h ${DIRECTION}$`))
    await expect(cells.filter({ hasText: /Off-season|No status/ })).toHaveCount(0)
    // Nothing is unknown: an expected state never reads as an outage.
    await expect(page.locator('.beach-shell-footer')).not.toContainText('no status available')
  })

  test('pins are a solid ring in the ink, never the dashed unknown', async ({ page }) => {
    await waitForApp(page)
    test.skip(await mapUnavailable(page).isVisible(), 'this browser cannot start the map (no WebGL)')

    const pins = page.locator('.beach-map-pin [data-slot="status-pin"]')
    await expect(pins).toHaveCount(35)
    expect(new Set(await pins.evaluateAll((els) => els.map((el) => el.getAttribute('data-state'))))).toEqual(new Set(['offseason']))

    // One HRM pin and one provincial pin: both the same calm ring.
    for (const name of ['Chocolate Lake Beach', 'Rainbow Haven Beach']) {
      const pin = page.locator(`.beach-map-pin[aria-label^="${name}"] [data-slot="status-pin"]`)
      await expect(pin).toHaveAttribute('title', `${name} — Off-season`)
      const style = await pin.evaluate((el) => {
        const s = getComputedStyle(el)
        return { borderStyle: s.borderTopStyle, borderColor: s.borderTopColor, background: s.backgroundColor }
      })
      expect(style, name).toEqual({ borderStyle: 'solid', borderColor: 'rgb(36, 42, 41)', background: 'rgb(255, 255, 255)' })
    }
  })

  test('the detail leads with wind and daylight, then one quiet line, and no plain-English line', async ({ page }) => {
    const article = await openBeach(page, 'Chocolate Lake Beach')
    await expect(article).toHaveAttribute('data-offseason', 'true')

    const conditions = article.locator('.beach-detail-conditions')
    await expect(conditions).toHaveText(
      new RegExp(`^Wind \\d+ km/h ${DIRECTION} · ${CLOCK} · Sunrise ${CLOCK} · Sunset ${CLOCK}$`),
    )
    await expect(conditions).toHaveAttribute('data-lead', 'true')
    // It is the first thing under the heading; the status block follows it.
    const order = await article.evaluate((el) => [...el.children].map((child) => child.className))
    expect(order.slice(0, 3)).toEqual(['beach-detail-head', 'beach-detail-conditions', 'beach-detail-status'])

    const status = article.locator('.beach-detail-status')
    await expect(status).toHaveAttribute('data-state', 'offseason')
    await expect(status).toHaveText('Off-season. Lifeguards return late June.')
    await expect(article.locator('.beach-detail-plain')).toHaveCount(0)
    await expect(article.getByRole('link', { name: 'Directions' })).toBeVisible()
    await expect(article.getByRole('button', { name: 'Share' })).toBeVisible()
  })

  test('an ocean beach leads with the water temperature and names the province\'s return', async ({ page }) => {
    const article = await openBeach(page, 'Rainbow Haven Beach')

    await expect(article.locator('.beach-detail-conditions')).toHaveText(
      new RegExp(`^\\d+ °C water · Wind \\d+ km/h ${DIRECTION} · ${CLOCK} · Sunrise ${CLOCK} · Sunset ${CLOCK}$`),
    )
    await expect(article.locator('.beach-detail-status')).toHaveText('Off-season. Lifeguards return July 1.')
  })

  test('the footer says both authorities are off-season, and still that this is the fixture', async ({ page }) => {
    const footer = page.locator('.beach-shell-footer')
    await expect(footer).toContainText('Showing a fixture day, not live status · HRM off-season · Province off-season')
  })

  test('the map key explains the calm ring', async ({ page }, testInfo) => {
    await waitForApp(page)
    const key = page.locator('.beach-shell-key')
    await key.locator('summary').click()
    const entry = key.locator('li', { hasText: 'Off-season' })
    await expect(entry).toContainText('Off-season: not tested or supervised; rows show conditions instead')
    await expect(entry.locator('[data-slot="status-pin"]')).toHaveAttribute('data-state', 'offseason')
    if (!testInfo.project.name.includes('land')) await expect(entry).toBeVisible()
  })
})
