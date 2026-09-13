import { expect, test, type Page } from '@playwright/test'

import { phoneOnly, row, rows, sheet, stubMapTiles, waitForApp } from './helpers'

/**
 * The phone sheet. Every assertion reads `data-snap` on `.beach-sheet` (and the
 * matching `data-scroll` on its body); the one place pixels appear is the check
 * that the three rests really are three different heights.
 */
const BEACH = 'Chocolate Lake Beach'

/** Wait until the sheet's snap transition has finished, so its box can be measured or grabbed. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const el = document.querySelector('.beach-sheet')
    return el !== null && el.getAnimations().length === 0
  })
}

/**
 * Drag from a point by `dy` css px, slowly enough to be a drag rather than a
 * flick, and hold still before releasing so the sheet settles by position alone.
 */
async function dragFrom(page: Page, x: number, y: number, dy: number): Promise<void> {
  await page.mouse.move(x, y)
  await page.mouse.down()
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + (dy * i) / steps)
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(150)
  await page.mouse.up()
}

/** Drag the grab area vertically by `dy` css px with the primary pointer. */
async function dragSheet(page: Page, dy: number): Promise<void> {
  await settled(page)
  const box = await page.locator('.beach-sheet-grab').boundingBox()
  if (!box) throw new Error('the grab area is not on screen')
  await dragFrom(page, box.x + box.width / 2, box.y + Math.min(20, box.height / 2), dy)
}

/** The sheet's top edge once it has come to rest. */
async function restingTop(page: Page): Promise<number> {
  await settled(page)
  return (await sheet(page).boundingBox())!.y
}

test.describe('sheet', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    phoneOnly(testInfo)
    await stubMapTiles(page)
    await page.goto('/')
    await waitForApp(page)
  })

  test('loads at half with the list locked, above the map', async ({ page }) => {
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
    await expect(page.locator('.beach-sheet-body')).toHaveAttribute('data-scroll', 'false')
    await expect(page.locator('.beach-shell-map')).toBeVisible()
    await expect(rows(page)).toHaveCount(35)

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })

  test('drag down → peek; drag up → half; drag up again → full', async ({ page }) => {
    const height = (await sheet(page).boundingBox())!.height
    const half = await restingTop(page)

    await dragSheet(page, height * 0.35)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    const peek = await restingTop(page)

    // Peek and half sit close together on a short (landscape) workspace, so pull by the measured gap.
    await dragSheet(page, -(peek - half))
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')

    await dragSheet(page, -height * 0.4)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'full')
    await expect(page.locator('.beach-sheet-body')).toHaveAttribute('data-scroll', 'true')
  })

  test('tapping the heading cycles half → full → half, and peek → half', async ({ page }) => {
    const heading = page.locator('.beach-shell-panel-heading h2')

    await heading.click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'full')
    await heading.click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')

    const height = (await sheet(page).boundingBox())!.height
    await dragSheet(page, height * 0.35)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    await heading.click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
  })

  test('the three rests are three distinct heights, in order', async ({ page }) => {
    const half = await restingTop(page)
    await page.locator('.beach-shell-panel-heading h2').click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'full')
    const full = await restingTop(page)

    await page.locator('.beach-shell-panel-heading h2').click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
    const height = (await sheet(page).boundingBox())!.height
    await dragSheet(page, height * 0.35)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    const peek = await restingTop(page)

    expect(full).toBeLessThan(half)
    expect(half).toBeLessThan(peek)
    // At peek the handle and heading row are still on screen.
    const viewport = page.viewportSize()!
    await expect(page.locator('.beach-shell-panel-heading h2')).toBeInViewport()
    expect(peek).toBeLessThan(viewport.height)
  })

  test('the list does not scroll at half; pulling it from the top goes to full', async ({ page }) => {
    const body = page.locator('.beach-sheet-body')
    await expect(body).toHaveAttribute('data-scroll', 'false')
    const overflow = await body.evaluate((el) => getComputedStyle(el).overflowY)
    expect(overflow).toBe('hidden')

    // A drag that starts on a row moves the sheet, not the list. Press near the
    // row's top: at half on a short workspace the row's centre is below the fold.
    await settled(page)
    const height = (await sheet(page).boundingBox())!.height
    const box = (await rows(page).first().boundingBox())!
    const viewport = page.viewportSize()!
    const y = Math.min(box.y + 12, viewport.height - 8)
    await dragFrom(page, box.x + box.width / 2, y, -height * 0.4)

    await expect(sheet(page)).toHaveAttribute('data-snap', 'full')
    await expect(body).toHaveAttribute('data-scroll', 'true')
    expect(await body.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto')
    expect(await body.evaluate((el) => el.scrollTop)).toBe(0)
    await expect(rows(page)).toHaveCount(35)
  })

  test('opening a beach keeps the sheet at half and closing keeps the snap', async ({ page }) => {
    await row(page, BEACH).click()
    await expect(page.getByRole('article')).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
    await expect(page.getByRole('button', { name: 'Back to beaches' })).toBeInViewport()

    // From full, a selection comes back to half so the map shows the pin.
    await page.getByRole('button', { name: 'Back to beaches' }).click()
    await page.locator('.beach-shell-panel-heading h2').click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'full')
    await row(page, BEACH).click()
    await expect(page.getByRole('article')).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')

    // Closing leaves the sheet where it is.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('article')).not.toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
  })

  test('a map pin tapped at peek opens the detail at half', async ({ page }) => {
    const pin = page.locator(`.beach-map-pin[aria-label^="${BEACH}"]`)
    const mapUnavailable = page.getByRole('alert').filter({ hasText: 'The map could not load' })
    await expect(pin.or(mapUnavailable).first()).toBeAttached({ timeout: 30_000 })
    test.skip(await mapUnavailable.isVisible(), 'this browser cannot start the map (no WebGL)')

    const height = (await sheet(page).boundingBox())!.height
    await dragSheet(page, height * 0.35)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')

    await pin.dispatchEvent('click')
    await expect(page.getByRole('article')).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
  })

  test('the map key floats above the sheet edge and moves with it', async ({ page }) => {
    const key = page.locator('.beach-shell-key')
    const keyBottom = async () => {
      const box = (await key.boundingBox())!
      return box.y + box.height
    }

    expect(await keyBottom()).toBeLessThanOrEqual((await restingTop(page)) + 1)
    await expect(key).toBeInViewport()

    const height = (await sheet(page).boundingBox())!.height
    await dragSheet(page, height * 0.35)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    const peekTop = await restingTop(page)
    await expect.poll(keyBottom).toBeLessThanOrEqual(peekTop + 1)
    await expect(key).toBeInViewport()
  })

  test('at full the footer sits inside the viewport, above the home-indicator inset', async ({ page }) => {
    await page.locator('.beach-shell-panel-heading h2').click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'full')
    await settled(page)

    const viewport = page.viewportSize()!
    const padding = await sheet(page).evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))
    expect(padding).toBeGreaterThanOrEqual(0)

    const sheetBox = (await sheet(page).boundingBox())!
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(viewport.height + 1)

    const footer = page.locator('.beach-shell-footer')
    if (await footer.isVisible()) {
      // Portrait: the footer is the last thing in the sheet and it is fully on screen.
      const box = (await footer.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - padding + 1)
    } else {
      // Landscape hides the footer; the body still ends inside the viewport.
      const body = (await page.locator('.beach-sheet-body').boundingBox())!
      expect(body.y + body.height).toBeLessThanOrEqual(viewport.height - padding + 1)
    }
  })

  test('landscape keeps the header collapsed and all three snaps', async ({ page }, testInfo) => {
    testInfo.skip(!testInfo.project.name.includes('land'), 'landscape project only')

    await expect(page.locator('.beach-shell-eyebrow')).toBeHidden()
    await expect(page.locator('.beach-shell-footer')).toBeHidden()

    const heading = page.locator('.beach-shell-panel-heading h2')

    const half = await restingTop(page)
    await heading.click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'full')
    expect(await restingTop(page)).toBeLessThan(half)

    await heading.click()
    await expect(sheet(page)).toHaveAttribute('data-snap', 'half')
    const height = (await sheet(page).boundingBox())!.height
    await dragSheet(page, height * 0.35)
    await expect(sheet(page)).toHaveAttribute('data-snap', 'peek')
    expect(await restingTop(page)).toBeGreaterThan(half)
    await expect(heading).toBeInViewport()
  })
})
