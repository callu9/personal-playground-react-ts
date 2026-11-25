import { expect, test, type Page } from '@playwright/test'

const lab = '/experiments/jonbeo-msw/'
const endpoint = '/api/jonbeo-msw/portfolio'
const holdingsRows = (page: Page) => page.getByRole('table', { name: 'Holdings', exact: true }).getByRole('row')
const chart = (page: Page) => page.getByRole('figure', { name: '보유 종목 평가액', exact: true })

test('recorded lab results and original development results are identifiable on the same page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(lab)
  await expect(page.getByLabel('Request path')).toBeVisible()
  await expect(page.getByLabel('Request path')).toHaveCSS('color-scheme', 'light')
  await expect(page.getByLabel('Initial rendering')).toBeVisible()

  await page.getByRole('navigation', { name: '이 페이지에서' }).getByRole('link', { name: '원본 코드 분석' }).click()
  await expect(page).toHaveURL(/#source-analysis$/)
  const analysis = page.getByRole('region', { name: '원본 코드 분석', exact: true })
  await expect(analysis.getByText('if (!mswReady) return null;', { exact: true })).toBeVisible()
  await expect(analysis).toContainText('0건')
  await expect(analysis).toContainText('이벤트 처리')
  await expect(analysis.getByRole('link', { name: 'Provider의 초기 렌더링 조건' })).toHaveAttribute('href', /jonbeo-next-ts\/blob\/d68ac41\/src\/providers\/MSWComponent\.tsx#L6-L20$/)

  await expect(page.getByRole('heading', { name: '결론', exact: true })).toBeVisible()
  await expect(page.getByText('201.5 ms', { exact: true })).toBeVisible()

  const recorded = page.getByRole('table', { name: '플레이그라운드 첫 방문 결과', exact: true })
  await expect(recorded.getByRole('rowheader', { name: 'MSW passthrough' })).toBeVisible()
  await expect(recorded.getByRole('rowheader', { name: 'MSW mock' })).toBeVisible()

  const original = page.getByRole('table', { name: '원본 Jonbeo 개발 서버 결과', exact: true })
  await expect(original.getByText('6.44초', { exact: true })).toBeVisible()
  await expect(original.getByText('744 ms', { exact: true })).toBeVisible()
  await expect(chart(page).getByRole('listitem')).toHaveCount(7)
  await expect(chart(page).getByText('$5,007.63', { exact: true })).toBeVisible()
  await expect(chart(page).getByRole('listitem').first()).toContainText('ATLS')
  await expect(chart(page).getByRole('listitem').first()).toContainText('$1,026.48')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await expect(holdingsRows(page)).toHaveCount(8)
})

test('off, passthrough and mock return equal bodies through the expected routes', async ({ browser, baseURL }) => {
  const bodies: string[] = []
  for (const mode of ['off', 'passthrough', 'mock']) {
    const context = await browser.newContext({ baseURL })
    try {
      const page = await context.newPage()
      const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === endpoint)
      await page.goto(lab + (mode === 'off' ? '' : 'worker/') + '?mode=' + mode)
      const response = await responsePromise
      await expect(holdingsRows(page)).toHaveCount(8)
      await expect(chart(page).getByText('$5,007.63', { exact: true })).toBeVisible()
      expect(response.ok()).toBe(true)
      expect(response.headers()['x-jonbeo-source']).toBe(mode === 'mock' ? 'mock' : 'api')
      expect(response.fromServiceWorker()).toBe(mode !== 'off')
      expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(mode !== 'off')
      bodies.push(await response.text())
    } finally {
      await context.close()
    }
  }
  expect(new Set(bodies).size).toBe(1)
})

test('shell controls work while worker startup is pending and keep their state when data arrives', async ({ browser, baseURL }) => {
  for (const variant of ['gated', 'shell']) {
    const context = await browser.newContext({ baseURL })
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    try {
      const page = await context.newPage()
      await page.route('**/worker-client.ts*', async (route) => {
        await pending
        await route.continue()
      })
      const workerRequested = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/worker-client.ts'))
      await page.goto(lab + 'worker/?mode=mock&variant=' + variant, { waitUntil: 'domcontentloaded' })
      await workerRequested
      const sort = page.getByRole('button', { name: 'Sort by name' })
      if (variant === 'shell') {
        await sort.click()
        await expect(sort).toHaveAttribute('aria-pressed', 'true')
      } else {
        await expect(page.getByText('Starting the worker…')).toBeVisible()
        await expect(sort).toHaveCount(0)
      }
      await expect(chart(page)).toHaveCount(0)
      release()
      await expect(chart(page)).toBeVisible()
      await expect(holdingsRows(page)).toHaveCount(8)
      await expect(sort).toHaveAttribute('aria-pressed', variant === 'shell' ? 'true' : 'false')
      await expect(holdingsRows(page).nth(1)).toContainText(variant === 'shell' ? 'ATLS' : 'MESA')
    } finally {
      release()
      await context.close()
    }
  }
})

test('the off entry stays uncontrolled after switching from a worker-controlled entry', async ({ page }) => {
  await page.goto(lab + 'worker/?mode=mock')
  await expect(holdingsRows(page)).toHaveCount(8)
  await page.getByLabel('Request path').selectOption('off')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(lab + '?mode=off&variant=shell#playground')
  await expect.poll(() => page.locator('#playground').evaluate((section) => section.getBoundingClientRect().top)).toBeLessThan(75)
  await expect(holdingsRows(page)).toHaveCount(8)
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull()
})
