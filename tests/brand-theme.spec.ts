import { expect, test } from '@playwright/test'
import { resolveBrand } from '../experiments/brand-theme/shared/brands'

const variants = ['css-modules', 'styled-components', 'styled-css-variables', 'tailwind', 'shadcn']
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

    test('applies a shared token change to every brand and a brand change only to Signal', async ({ page }) => {
      // Change the served values before reloading, keeping the app sources untouched.
      for (const [module, original, replacement] of [
        ['tokens.ts', '#e1e7e3', '#324c76'],
        ['brands.ts', '#edf0ff', '#dde8ff'],
      ]) {
        await page.route(`**/shared/design-system/${module}*`, async (route) => {
          const response = await route.fetch()
          const source = await response.text()
          expect(source).toContain(original)
          await route.fulfill({ response, body: source.replace(original, replacement) })
        })
      }
      await page.reload()

      const panel = page.getByRole('region', { name: 'Operations theme' })
      const card = page.locator('[aria-label="Weekly metrics"] > :first-child')
      const account = page.getByLabel('Demo account')
      await expect(panel).toHaveCSS('background-color', 'rgb(221, 232, 255)')
      await expect(card).toHaveCSS('border-top-color', 'rgb(50, 76, 118)')
      await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(card).toHaveCSS('border-top-left-radius', '13px')

      for (const [brand, background] of [
        ['grove', 'rgb(245, 247, 246)'],
        ['ember', 'rgb(255, 241, 232)'],
      ]) {
        await account.selectOption(`${brand}-operator`)
        await expect(panel).toHaveCSS('background-color', background)
        await expect(card).toHaveCSS('border-top-color', 'rgb(50, 76, 118)')
      }
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

test('the brand experiment compares five candidates and embeds the selected dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'React playground' })).toBeVisible()
  const launcher = page.getByRole('navigation', { name: 'Playground experiments' })
  await expect(launcher.getByRole('link', { name: /Dashboard auto refresh/ })).toHaveAttribute('href', '/experiments/dashboard-refresh/')
  await expect(launcher.getByRole('link', { name: /Jonbeo MSW performance/ })).toHaveAttribute('href', '/experiments/jonbeo-msw/')
  await expect(page.locator('[data-brand]')).toHaveCount(0)

  await launcher.getByRole('link', { name: /Brand style runtime/ }).click()
  await expect(page.getByRole('heading', { name: 'Brand style runtime' })).toBeVisible()
  const playground = page.getByRole('region', { name: 'Playground' })
  await expect(playground.locator('iframe')).toHaveCount(1)
  const dashboard = playground.locator('iframe[title="CSS Modules 브랜드 대시보드"]')
  await expect(dashboard).toHaveAttribute('src', './css-modules/')
  await dashboard.scrollIntoViewIfNeeded()
  const embedded = dashboard.contentFrame()
  await expect(embedded.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await embedded.getByLabel('Demo account').selectOption('ember-operator')
  const theme = embedded.getByRole('region', { name: 'Operations theme' })
  await expect(theme).toHaveAttribute('data-brand', 'ember')
  await expect(theme).toHaveCSS('background-color', 'rgb(255, 241, 232)')
  await expect(embedded.getByRole('link', { name: 'Brand theme experiment' })).toHaveAttribute('target', '_top')

  const options = page.getByRole('region', { name: '선택지' })
  const codeExamples = options.locator('details')
  const showCode = codeExamples.getByText('공통 토큰 흐름과 후보별 주입 코드', { exact: true })
  await expect(codeExamples.locator('pre').first()).toBeHidden()
  await showCode.click()
  for (const [candidate, code] of [
    ['CSS Modules + React Context', 'useContext(ThemeContext)'],
    ['styled-components', 'ThemeProvider theme={theme.tokens}'],
    ['styled-components + CSS variables', 'themeVariables(theme)'],
    ['Tailwind CSS', 'bg-brand'],
    ['shadcn/ui + Tailwind', 'bg-primary'],
  ]) {
    await expect(codeExamples.getByRole('article', { name: candidate }).locator('pre').filter({ hasText: code })).toBeVisible()
  }
  const verification = page.getByRole('region', { name: '검증 결과' })
  const performance = verification.getByRole('table', { name: '성능과 빌드 크기' })
  await expect(performance.getByRole('rowheader')).toHaveCount(5)
  await expect(performance.getByRole('cell', { name: '77,558 B' })).toBeVisible()
  await expect(page.getByRole('table', { name: '후보별 장단점' }).getByRole('rowheader')).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await expect(page.locator('[data-brand]')).toHaveCount(0)

  await playground.getByRole('link', { name: 'Playground 전체 화면 열기' }).click()
  await expect(page).toHaveURL(path('css-modules'))
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await page.getByRole('link', { name: 'Brand theme experiment' }).click()
  await expect(page).toHaveURL('/experiments/brand-theme/#playground')
})

test('falls back for missing, invalid and inherited env keys', () => {
  expect(resolveBrand('', undefined)).toBe('grove')
  expect(resolveBrand('', 'unknown')).toBe('grove')
  expect(resolveBrand('', 'toString')).toBe('grove')
  expect(resolveBrand('unknown', 'signal')).toBe('signal')
  expect(resolveBrand('grove-operator', 'signal')).toBe('grove')
})
