import { expect, test, type Page } from '@playwright/test'

const screen = (strategy: string) => `/experiments/chart-loading/${strategy}/`
const drawn = (page: Page) => page.locator('canvas[data-drawn]').count()

async function scrollToEnd(page: Page) {
  for (let step = 0; step < 10; step++) {
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(150)
  }
}

for (const strategy of ['eager', 'split']) {
  test(`${strategy} draws every chart at once and keeps the Ping button working`, async ({ page }) => {
    await page.goto(screen(strategy))
    await expect.poll(() => drawn(page)).toBe(12)
    await page.getByTestId('ping').click()
    await expect(page.getByTestId('ping-count')).toHaveText('1')
  })
}

for (const strategy of ['observer', 'idle']) {
  test(`${strategy} draws nothing above the fold and everything once scrolled`, async ({ page }) => {
    await page.goto(screen(strategy))
    await page.waitForLoadState('load')
    await page.waitForTimeout(2_800)
    expect(await drawn(page)).toBe(0)
    await scrollToEnd(page)
    await expect.poll(() => drawn(page)).toBe(12)
    await page.getByTestId('ping').click()
    await expect(page.getByTestId('ping-count')).toHaveText('1')
  })
}

test('the chart chunk is requested when each strategy says it is', async ({ page }) => {
  const requested = async (strategy: string, scroll: boolean) => {
    let seen = false
    page.removeAllListeners('request')
    page.on('request', (request) => { if (/chart-runtime/.test(request.url())) seen = true })
    await page.goto(screen(strategy))
    await page.waitForLoadState('load')
    await page.waitForTimeout(2_800)
    const beforeScroll = seen
    if (scroll) await scrollToEnd(page)
    return { beforeScroll, afterScroll: seen }
  }
  expect((await requested('eager', false)).beforeScroll).toBe(true)
  expect((await requested('split', false)).beforeScroll).toBe(true)
  expect(await requested('observer', true)).toEqual({ beforeScroll: false, afterScroll: true })
  expect((await requested('idle', false)).beforeScroll).toBe(true)
})

test('the experiment page opens the selected strategy screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Chart loading/ }).click()
  await expect(page.getByRole('heading', { name: 'Chart loading strategies' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: '실험 이동' })
  await expect(navigation.getByRole('link', { name: 'Chart loading' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('navigation', { name: '이 페이지에서' }).getByRole('link', { name: 'Playground' }).click()
  await expect(page).toHaveURL(/#playground$/)
  await expect(page.getByRole('region', { name: '선택지' })).toContainText('Viewport + idle preload')
  const playground = page.getByRole('region', { name: 'Playground' })
  await expect(playground.locator('iframe')).toHaveAttribute('src', './observer/')
  await playground.getByRole('combobox', { name: 'Strategy' }).selectOption('eager')
  await expect(playground.locator('iframe')).toHaveAttribute('src', './eager/')
  const results = page.getByRole('region', { name: '전략별 측정 결과' })
  await expect(results.getByRole('table', { name: '번들 크기' }).getByRole('row')).toHaveCount(5)
  await expect(results.getByRole('table', { name: /로딩 전략 측정 throttled/ }).getByRole('row', { name: /Viewport \+ idle preload/ })).toBeVisible()
})

test('the experiment page fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/experiments/chart-loading/', screen('observer')]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
