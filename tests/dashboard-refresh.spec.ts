import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const api = '/api/dashboard-refresh'
const dashboard = '/experiments/dashboard-refresh/'

async function createFeed(request: APIRequestContext, scenario = 'normal') {
  const response = await request.post(`${api}/feeds?scenario=${scenario}&pace=fast`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()).id as string
}

async function stats(request: APIRequestContext, id: string) {
  const response = await request.get(`${api}/feeds/${id}/stats`)
  expect(response.ok()).toBeTruthy()
  return await response.json()
}

const version = (page: Page) => page.getByTestId('live-metrics').getAttribute('data-version').then(Number)

test('the summary leads to concrete refresh choices by purpose', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(dashboard)
  const summary = page.getByRole('region', { name: '실험 요약' })
  await expect(summary).toContainText('기본값은 고정 3초')
  await summary.getByRole('link', { name: '사용 목적별 선택' }).click()
  await expect(page).toHaveURL(/#refresh-choice$/)
  const guide = page.getByRole('region', { name: '사용 목적별 선택' })
  await expect(guide.getByRole('term')).toHaveCount(5)
  await expect(guide.getByText('2,797 ms', { exact: true })).toBeVisible()
  await expect(guide.getByText('3,888 ms', { exact: true })).toBeVisible()
  await expect(guide.getByText('70 ms', { exact: true })).toBeVisible()
  const conclusion = page.getByRole('region', { name: '결론' })
  await expect(conclusion).not.toContainText('Normal delivery')
  await page.getByRole('combobox', { name: 'Delivery scenario' }).selectOption('outage')
  await expect(page.getByRole('region', { name: '검증 결과' }).getByRole('heading', { name: 'Temporary outage' })).toBeVisible()
  await expect(conclusion).not.toContainText('Temporary outage')
  await expect(guide.getByRole('term')).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('launcher opens a live dashboard and the scenario creates a separate feed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Dashboard auto refresh/ }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard auto refresh' })).toBeVisible()
  await page.getByRole('navigation', { name: '이 페이지에서' }).getByRole('link', { name: 'Playground' }).click()
  await expect(page).toHaveURL(/#playground$/)
  const playground = page.getByRole('region', { name: 'Playground' })
  await expect(playground.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await expect(playground.getByRole('heading', { name: 'Run activity' })).toBeVisible()
  await expect(playground.getByRole('heading', { name: 'Recent results' })).toBeVisible()
  await playground.getByRole('combobox', { name: 'Demo account' }).selectOption('ember-operator')
  await expect(playground.getByRole('region', { name: 'Operations theme' })).toHaveAttribute('data-brand', 'ember')
  const search = playground.getByRole('textbox', { name: 'Search results' })
  await search.fill('Atlas')
  const share = playground.getByRole('link', { name: 'Open this feed in another tab' })
  await expect(share).toHaveAttribute('href', /scenario=normal/)
  const original = new URL((await share.getAttribute('href'))!, 'http://localhost').searchParams.get('feed')
  expect(original).toBeTruthy()
  await playground.getByRole('combobox', { name: 'Update method' }).selectOption('sse')
  await expect(share).toHaveAttribute('href', /method=sse/)
  expect(new URL((await share.getAttribute('href'))!, 'http://localhost').searchParams.get('feed')).toBe(original)
  await expect(playground.getByRole('region', { name: 'Operations theme' })).toHaveAttribute('data-brand', 'ember')
  await expect(search).toHaveValue('Atlas')
  await playground.getByRole('combobox', { name: 'Delivery scenario' }).selectOption('outage')
  await expect(share).toHaveAttribute('href', /scenario=outage/)
  expect(new URL((await share.getAttribute('href'))!, 'http://localhost').searchParams.get('feed')).not.toBe(original)
  await expect(page.getByRole('heading', { name: 'Temporary outage' })).toBeVisible()
})

for (const method of ['fixed', 'adaptive', 'sse']) {
  test(`${method} keeps showing metrics across repeated update cycles`, async ({ page, request }) => {
    const id = await createFeed(request)
    await page.goto(`${dashboard}?feed=${id}&method=${method}&interval=1000`)
    await expect(page.getByTestId('connection')).toHaveText('Live')
    await expect.poll(() => version(page), { timeout: 12_000 }).toBeGreaterThan(10)
    const newest = page.getByRole('table').first().getByRole('rowheader').first()
    const firstRow = await newest.innerText()
    const previous = await version(page)
    await expect.poll(() => version(page), { timeout: 10_000 }).toBeGreaterThan(previous)
    await expect.poll(() => newest.innerText()).not.toBe(firstRow)
    await expect(page.getByTestId('connection')).toHaveText('Live')
    const info = await stats(request, id)
    expect(method === 'sse' ? info.activeStreams : info.snapshotRequests).toBeGreaterThan(0)
  })
}

test('slow polling stays single-flight and refreshes on foreground return', async ({ page, request }) => {
  const id = await createFeed(request, 'slow')
  await page.goto(`${dashboard}?feed=${id}&scenario=slow&method=fixed&interval=1000`)
  await expect(page.getByTestId('connection')).toHaveText('Live')
  async function visibility(state: 'hidden' | 'visible') {
    await page.evaluate((value) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  }
  await visibility('hidden')
  await expect(page.getByTestId('connection')).toHaveText('Paused')
  const hidden = await stats(request, id)
  await new Promise((resolve) => setTimeout(resolve, 1700))
  expect((await stats(request, id)).snapshotRequests).toBe(hidden.snapshotRequests)
  await visibility('visible')
  await expect.poll(async () => (await stats(request, id)).snapshotRequests).toBeGreaterThan(hidden.snapshotRequests)
  await expect.poll(() => version(page), { timeout: 8_000 }).toBeGreaterThan(4)
  expect((await stats(request, id)).maxActiveSnapshots).toBe(1)
})

test('SSE reconnects with the latest snapshot after an outage and keeps streaming', async ({ page, request }) => {
  const id = await createFeed(request, 'outage')
  await page.goto(`${dashboard}?feed=${id}&scenario=outage&method=sse`)
  await expect.poll(() => version(page), { timeout: 12_000 }).toBeGreaterThan(10)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  const info = await stats(request, id)
  expect(info.streamRequests).toBeGreaterThan(1)
  expect(info.activeStreams).toBe(1)
  await page.goto('/')
  await expect.poll(async () => (await stats(request, id)).activeStreams).toBe(0)
})

test('two tabs receive the same live feed using independent streams', async ({ page, browser, request, baseURL }) => {
  const id = await createFeed(request)
  const url = `${dashboard}?feed=${id}&method=sse`
  const context = await browser.newContext({ baseURL })
  try {
    const other = await context.newPage()
    await Promise.all([page.goto(url), other.goto(url)])
    await Promise.all([page, other].map((tab) => expect.poll(() => version(tab)).toBeGreaterThan(3)))
    expect((await stats(request, id)).maxActiveStreams).toBe(2)
  } finally {
    await context.close()
  }
})
