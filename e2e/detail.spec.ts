import { expect, test, type Locator, type Page } from '@playwright/test'

import { detail, isPhone, openBeach, row, rows, sheet, stubMapTiles, watchPageErrors } from './helpers'

/** Open in the fixture day via halifax.ca, so the detail carries a live source link. */
const BEACH = 'Chocolate Lake Beach'
const BEACH_ID = 'hrm-chocolate-lake'

/** True when the element's whole box lies inside the viewport. */
async function inViewport(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()!
  return (
    box !== null &&
    box.y >= 0 &&
    box.x >= 0 &&
    box.y + box.height <= viewport.height + 0.5 &&
    box.x + box.width <= viewport.width + 0.5
  )
}

test.describe('detail', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
  })

  test('selecting from the list opens the field note: name, subtitle, status block, plain English, actions, source link', async ({
    page,
  }) => {
    await page.goto('/')
    const article = await openBeach(page, BEACH)

    await expect(article).toHaveClass(/beach-detail/)
    await expect(page.getByRole('button', { name: 'Back to beaches' })).toBeVisible()
    await expect(page.locator('.beach-shell-count')).toContainText('1 of 35 beaches')

    // Distance from downtown Halifax (no permission granted), water body, community.
    await expect(article.locator('.beach-detail-sub')).toHaveText(/^\d+(\.\d)? km · Chocolate Lake · Halifax$/)

    // The fixture day has Chocolate Lake open on halifax.ca.
    const status = article.locator('.beach-detail-status')
    await expect(status).toHaveAttribute('data-state', 'open')
    await expect(status.locator('.beach-detail-status-label')).toHaveText('Open')
    await expect(status.locator('.beach-detail-status-source')).toContainText('halifax.ca says')
    await expect(article.locator('.beach-detail-plain')).not.toBeEmpty()

    await expect(article.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', /maps\.apple\.com|google\.com\/maps|^geo:/)
    await expect(article.getByRole('button', { name: 'Share' })).toBeVisible()

    const sourceLink = article.getByRole('link', { name: /open the source page/i })
    await expect(sourceLink).toHaveAttribute('target', '_blank')
    await expect(article.locator('.beach-detail-history ol li')).toHaveCount(14)
  })

  test('there is exactly one back control, and nothing inside the sheet body scrolls on its own', async ({ page }) => {
    await page.goto('/')
    const article = await openBeach(page, BEACH)

    await expect(page.getByRole('button', { name: /back/i })).toHaveCount(1)
    await expect(article.getByRole('button', { name: /back/i })).toHaveCount(0)

    // The sheet body (or panel column) is the only scroller: no descendant may be one.
    const nested = await page.locator('.beach-sheet-body').evaluate((body) =>
      [...body.querySelectorAll<HTMLElement>('*')]
        .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    )
    expect(nested).toEqual([])
  })

  test('on a phone at half, the answer and both actions are above the fold, with the map visible', async ({
    page,
  }, testInfo) => {
    testInfo.skip(!isPhone(testInfo) || testInfo.project.name.includes('land'), 'portrait phone projects only')

    await page.goto('/')
    const article = await openBeach(page, BEACH)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
    await page.waitForFunction(() => document.querySelector('.beach-sheet')!.getAnimations().length === 0)

    for (const target of [
      page.getByRole('button', { name: 'Back to beaches' }),
      article.locator('.beach-detail-name'),
      article.locator('.beach-detail-status'),
      article.locator('.beach-detail-plain'),
      article.getByRole('link', { name: 'Directions' }),
      article.getByRole('button', { name: 'Share' }),
    ]) {
      expect(await inViewport(page, target), `${await target.evaluate((el) => el.className)} above the fold`).toBe(true)
    }

    // The map still owns the top half.
    const sheetTop = (await sheet(page).boundingBox())!.y
    const mapBox = (await page.locator('.beach-shell-map').boundingBox())!
    expect(sheetTop - mapBox.y).toBeGreaterThan(mapBox.height * 0.4)
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

  test('opening puts focus on the name; closing returns it to the row it was opened from', async ({ page }) => {
    await page.goto('/')
    const origin = row(page, BEACH)
    await expect(origin).toHaveAttribute('data-beach-id', BEACH_ID)
    const article = await openBeach(page, BEACH)
    await expect(article.locator('.beach-detail-name')).toBeFocused()

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

  test('the footer offers "Suggest one", pointing at a new issue on the repository', async ({ page }, testInfo) => {
    await page.goto('/')
    // A landscape phone hides the footer for room, so read the link off the DOM rather than the role tree.
    const link = page.locator('.beach-shell-footer a', { hasText: 'Suggest one' })
    await expect(link).toHaveCount(1)
    if (!testInfo.project.name.includes('land')) await expect(link).toBeVisible()
    await expect(link).toHaveAttribute(
      'href',
      'https://github.com/EduardKakosyan/claude-hackathon-volta-sep26/issues/new?template=suggestion.md',
    )
    await expect(link).toHaveAttribute('target', '_blank')
  })
})
