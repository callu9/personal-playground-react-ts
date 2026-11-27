import { expect, test, type Page } from '@playwright/test'

const lab = '/experiments/state-subscription/'
const approaches = ['context-one', 'context-split', 'zustand-full', 'zustand-selector'] as const
const placements = ['row', 'leaf'] as const

// Components rendered by one interaction on 100 rows; the first row selection has no previous row to clear.
const unitRenders = (approach: string, placement: string) => placement === 'row'
  ? { row: 100, amount: 0, select: 0, header: 1, toggle: 1 }
  : { row: 0, amount: 200, select: approach === 'context-one' || approach === 'zustand-full' ? 100 : 0, header: 1, toggle: 1 }

const selectRenders = (approach: string, placement: string) => {
  const wide = approach === 'context-one' || approach === 'zustand-full'
  if (placement === 'row') return { row: approach === 'zustand-selector' ? 2 : 100, amount: 0, select: 0, header: wide ? 1 : 0, toggle: wide ? 1 : 0 }
  return { row: 0, amount: wide ? 200 : 0, select: approach === 'zustand-selector' ? 2 : 100, header: wide ? 1 : 0, toggle: wide ? 1 : 0 }
}

async function counts(page: Page) {
  await page.getByRole('button', { name: 'Show render counts' }).click()
  const entries = await Promise.all(['row', 'amount', 'select', 'header', 'toggle'].map(async (name) => [name, Number(await page.getByTestId(`count-${name}`).textContent())]))
  return Object.fromEntries(entries)
}

for (const approach of approaches) {
  for (const placement of placements) {
    test(`${approach} · ${placement}: the unit toggle and row selection render what the approach promises`, async ({ page }) => {
      await page.goto(`${lab}?approach=${approach}&placement=${placement}&rows=100`)
      const toggle = page.getByTestId('unit-toggle')
      await expect(page.getByTestId('total')).toContainText('₩')
      await page.getByRole('button', { name: 'Reset counts' }).click()
      await toggle.click()
      await expect(page.getByTestId('total')).toContainText('$')
      expect(await counts(page)).toEqual(unitRenders(approach, placement))
      await expect(page.getByRole('list', { name: 'Stocks' }).getByRole('listitem').first()).toContainText('$')

      await page.getByTestId('select-100000').click()
      await expect(page.getByTestId('select-100000')).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'Reset counts' }).click()
      await page.getByTestId('select-100001').click()
      await expect(page.getByTestId('select-100001')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('select-100000')).toHaveAttribute('aria-pressed', 'false')
      expect(await counts(page)).toEqual(selectRenders(approach, placement))
    })
  }
}

test('every row count renders the same rows for every approach', async ({ page }) => {
  for (const rows of [7, 100, 1000]) {
    const seen: string[] = []
    for (const approach of approaches) {
      await page.goto(`${lab}?approach=${approach}&placement=leaf&rows=${rows}`)
      await expect(page.getByRole('list', { name: 'Stocks' }).getByRole('listitem')).toHaveCount(rows)
      seen.push(`${await page.getByTestId('total').textContent()}|${await page.getByRole('listitem').nth(rows - 1).textContent()}`)
    }
    expect(new Set(seen).size).toBe(1)
  }
})

test('the settings stay in the address and the unknown values fall back', async ({ page }) => {
  await page.goto(`${lab}?approach=nope&placement=leaf&rows=5`)
  await expect(page.getByRole('combobox', { name: 'Approach' })).toHaveValue('zustand-full')
  await expect(page.getByRole('combobox', { name: 'Rows' })).toHaveValue('100')
  await page.getByRole('combobox', { name: 'Approach' }).selectOption('zustand-selector')
  await expect(page).toHaveURL(/approach=zustand-selector/)
  await expect(page).toHaveURL(/placement=leaf/)
})

test('launcher opens the state subscription experiment and shows the measured results', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /State subscription and INP/ }).click()
  await expect(page.getByRole('heading', { name: 'State subscription and INP' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: '실험 이동' })
  await expect(navigation.getByRole('link', { name: 'State subscription and INP' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('navigation', { name: '이 페이지에서' }).getByRole('link', { name: 'Playground' }).click()
  await expect(page).toHaveURL(/#playground$/)
  await expect(page.getByRole('region', { name: '선택지' })).toContainText('Zustand · selector')
  const results = page.getByRole('region', { name: '행 수별 측정 결과' })
  await expect(results.getByRole('table', { name: '렌더링 횟수와 커밋' }).getByRole('row')).toHaveCount(9)
  await expect(results.getByRole('table', { name: /^INP CPU 4/ }).getByRole('row', { name: /Zustand · selector · leaf/ })).toBeVisible()
  await page.getByRole('combobox', { name: 'Rows' }).selectOption('1000')
  await expect(page.getByRole('region', { name: '행 수별 측정 결과' }).getByRole('heading', { name: /INP · 행 1000개 · CPU 감속 없음/ })).toBeVisible()
})

test('the experiment page fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${lab}?rows=100`)
  await expect(page.getByTestId('unit-toggle')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
