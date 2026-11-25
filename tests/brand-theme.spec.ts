import { expect, test } from '@playwright/test'
import { resolveBrand } from '../experiments/brand-theme/shared/brands'

const variants = ['css-modules', 'styled-components', 'tailwind', 'shadcn']
const path = (variant: string) => `/experiments/brand-theme/${variant}/`

for (const variant of variants) {
  test.describe(variant, () => {
    const pageErrors = new WeakMap<object, string[]>()
    test.beforeEach(async ({ page }) => {
      const errors: string[] = []
      pageErrors.set(page, errors)
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(path(variant))
    })

    test.afterEach(({ page }) => expect(pageErrors.get(page)).toEqual([]))

    test('keeps the document within the mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
      const width = await page.getByRole('table').evaluate((table) => ({
        actual: table.scrollWidth, viewport: table.parentElement!.clientWidth,
      }))
      expect(width.actual).toBeGreaterThan(width.viewport)
    })

    test('uses env, then account, then env on sign-out', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
      const panel = page.getByRole('region', { name: 'Operations theme' })
      const title = page.getByRole('heading', { name: 'Operations overview' })
      const action = page.getByRole('button', { name: 'View Atlas import' })
      const setAccount = page.getByLabel('Demo account')
      await expect(panel).toHaveAttribute('data-brand', 'signal')
      await expect(title).toHaveCSS('font-family', 'Verdana, sans-serif')
      await expect(action).toHaveCSS('background-color', 'rgb(68, 69, 180)')
      await expect(panel).toHaveCSS('background-color', 'rgb(237, 240, 255)')
      await expect(page.getByText('Page background: Brand color', { exact: true })).toBeVisible()

      await setAccount.selectOption('grove-operator')
      await expect(panel).toHaveAttribute('data-brand', 'grove')
      await expect(title).toHaveCSS('font-family', 'Georgia, serif')
      await expect(action).toHaveCSS('background-color', 'rgb(24, 102, 73)')
      await expect(panel).toHaveCSS('background-color', 'rgb(245, 247, 246)')
      await expect(page.getByText('Page background: Default', { exact: true })).toBeVisible()

      await setAccount.selectOption('ember-operator')
      await expect(panel).toHaveAttribute('data-brand', 'ember')
      await expect(title).toHaveCSS('font-family', '"Trebuchet MS", sans-serif')
      await expect(action).toHaveCSS('background-color', 'rgb(160, 67, 34)')
      await expect(panel).toHaveCSS('background-color', 'rgb(255, 241, 232)')
      await page.reload()
      await expect(panel).toHaveAttribute('data-brand', 'ember')
      await expect(panel).toHaveCSS('background-color', 'rgb(255, 241, 232)')

      await setAccount.selectOption('')
      await expect(panel).toHaveAttribute('data-brand', 'signal')
      await expect(panel).toHaveCSS('background-color', 'rgb(237, 240, 255)')
    })

    test('filters results and keeps the theme through the details portal', async ({ page }) => {
      await page.getByLabel('Demo account').selectOption('ember-operator')
      await page.getByLabel('Result status').selectOption('Running')
      await expect(page.getByRole('row', { name: /Atlas import/ })).toHaveCount(0)
      await page.getByRole('button', { name: 'View Horizon sync' }).click()
      const dialog = page.getByRole('dialog', { name: 'Horizon sync' })
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveCSS('font-family', '"Trebuchet MS", sans-serif')
      await expect(dialog.getByRole('button', { name: 'Close details' })).toHaveCSS('background-color', 'rgb(160, 67, 34)')
      await expect(dialog.getByRole('button', { name: 'Close details' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'View Horizon sync' })).toBeFocused()

      await page.getByLabel('Search results').fill('unmatched query')
      await expect(page.getByText('No matching results.')).toBeVisible()
    })
  })
}

test('the launcher keeps the experiment documents isolated', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'React playground' })).toBeVisible()
  for (const variant of variants) {
    await expect(page.locator(`a[href="${path(variant)}"]`)).toBeVisible()
  }
  await expect(page.locator('[data-brand]')).toHaveCount(0)
})

test('falls back for missing, invalid and inherited env keys', () => {
  expect(resolveBrand('', undefined)).toBe('grove')
  expect(resolveBrand('', 'unknown')).toBe('grove')
  expect(resolveBrand('', 'toString')).toBe('grove')
  expect(resolveBrand('unknown', 'signal')).toBe('signal')
  expect(resolveBrand('grove-operator', 'signal')).toBe('grove')
})