import { expect, test, type APIRequestContext } from '@playwright/test'

const api = '/api/job-status'
const lab = '/experiments/job-status/'

async function startRun(request: APIRequestContext, scenario: string) {
  const response = await request.post(`${api}/runs?scenario=${scenario}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()).id as string
}

async function stats(request: APIRequestContext, id: string) {
  const response = await request.get(`${api}/runs/${id}/stats`)
  expect(response.ok()).toBeTruthy()
  return await response.json()
}

const observedVersions = (list: ReturnType<import('@playwright/test').Page['getByRole']>) =>
  list.locator('[data-version]').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-version'))))

test('launcher opens the job status experiment and shows the measured results', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Job status polling/ }).click()
  await expect(page.getByRole('heading', { name: 'Job status polling' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: '실험 이동' })
  await expect(navigation.getByRole('link', { name: 'Job status polling' })).toHaveAttribute('aria-current', 'page')
  await expect(navigation.getByRole('link', { name: 'Dashboard auto refresh' })).toHaveAttribute('href', '/experiments/dashboard-refresh/')
  await page.getByRole('navigation', { name: '이 페이지에서' }).getByRole('link', { name: 'Playground' }).click()
  await expect(page).toHaveURL(/#playground$/)
  await expect(page.getByRole('region', { name: '선택지' })).toContainText('Honor Retry-After')
  const results = page.getByRole('region', { name: '시나리오별 측정 결과' })
  await expect(results.getByRole('heading', { name: 'Normal delivery' })).toBeVisible()
  await expect(results.getByRole('row', { name: /Fixed polling · 3 s/ }).first()).toContainText('2,122 ms')
  await page.getByRole('combobox', { name: /scenario/i }).selectOption('limited')
  await expect(results.getByRole('heading', { name: 'Request limit' })).toBeVisible()
  await expect(results.getByRole('row', { name: /Fixed 1 s · backoff only/ })).toContainText('918 ms')
  await expect(results.getByRole('row', { name: /Server-sent events/ }).first()).toBeVisible()
  const cancel = results.getByRole('table', { name: '취소 반영 시간' })
  await expect(cancel.getByRole('row', { name: /Server-sent events/ })).toContainText('862 ms')
  await expect(results.getByRole('table', { name: '여러 탭 측정' }).getByRole('row', { name: /탭별 프로필|separate profiles/ }).first()).toContainText('20')
})

test('the experiment page fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of [lab, '/experiments/dashboard-refresh/']) {
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: '실험 이동' }).getByRole('link', { name: 'Job status polling' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

for (const method of ['fixed', 'adaptive', 'sse']) {
  test(`${method} displays the first result and stops after completion`, async ({ page, request }) => {
    const id = await startRun(request, 'quick')
    await page.goto(`${lab}?run=${id}&method=${method}&interval=1000`)
    await expect(page.getByTestId('job-status')).toHaveText('Running')
    await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 12_000 })
    await expect(page.getByTestId('job-progress')).toHaveText('100%')
    await expect(page.getByTestId('cancel')).toBeDisabled()
    const before = await stats(request, id)
    await expect.poll(async () => (await stats(request, id)).activeStreams).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 1300))
    const after = await stats(request, id)
    expect(after.snapshotRequests + after.streamRequests).toBe(before.snapshotRequests + before.streamRequests)
  })

  test(`${method} shows a cancelled job in both tabs and stops asking`, async ({ page, context, request }) => {
    const id = await startRun(request, 'quick')
    const url = `${lab}?run=${id}&method=${method}&interval=1000`
    const other = await context.newPage()
    await Promise.all([page.goto(url), other.goto(url)])
    await expect(page.getByTestId('job-status')).toHaveText('Running')
    await page.getByTestId('cancel').click()
    await expect(page.getByTestId('cancel')).toBeDisabled()
    for (const tab of [page, other]) await expect(tab.getByTestId('job-status')).toHaveText('Cancelled', { timeout: 8_000 })
    expect((await stats(request, id)).cancelRequests).toBe(1)
    const versions = await observedVersions(page.getByRole('list', { name: 'Observed updates' }))
    expect(versions[0]).toBeGreaterThan(versions[1])
    await expect.poll(async () => (await stats(request, id)).activeStreams).toBe(0)
    const before = await stats(request, id)
    await new Promise((resolve) => setTimeout(resolve, 1300))
    const after = await stats(request, id)
    expect(after.snapshotRequests + after.streamRequests).toBe(before.snapshotRequests + before.streamRequests)
  })
}

test('cancelling a finished job is refused', async ({ page, request }) => {
  const id = await startRun(request, 'quick')
  await page.goto(`${lab}?run=${id}&method=sse`)
  await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 12_000 })
  expect((await request.post(`${api}/runs/${id}/cancel`)).status()).toBe(409)
})

test('Retry-After is honored, and backoff alone retries too early', async ({ page, request }) => {
  test.setTimeout(60_000)
  const honored = await startRun(request, 'limited')
  await page.goto(`${lab}?run=${honored}&method=fixed&interval=1000&retry=honor&scenario=limited`)
  await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 30_000 })
  const honoredStats = await stats(request, honored)
  expect(honoredStats.rejectedRequests).toBeGreaterThan(0)
  expect(honoredStats.earlyRetries).toBe(0)
  expect(Number(await page.getByTestId('rate-limited').textContent())).toBe(honoredStats.rejectedRequests)

  const ignored = await startRun(request, 'limited')
  await page.goto(`${lab}?run=${ignored}&method=fixed&interval=1000&retry=ignore&scenario=limited`)
  await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 30_000 })
  expect((await stats(request, ignored)).earlyRetries).toBeGreaterThan(0)
})

test('429 carries Retry-After in seconds and the limit is shared by every client of the job', async ({ request }) => {
  const id = await startRun(request, 'limited')
  const statuses: number[] = []
  let retryAfter = ''
  for (let index = 0; index < 10; index++) {
    const response = await request.get(`${api}/runs/${id}/snapshot`)
    statuses.push(response.status())
    if (response.status() === 429) retryAfter = response.headers()['retry-after']
  }
  expect(statuses.filter((status) => status === 200)).toHaveLength(8)
  expect(statuses.slice(8)).toEqual([429, 429])
  expect(Number(retryAfter)).toBeGreaterThanOrEqual(1)
  expect(Number(retryAfter)).toBeLessThanOrEqual(10)
})

test('slow polling stays single-flight and refreshes on foreground return', async ({ page, request }) => {
  const id = await startRun(request, 'slow')
  await page.goto(`${lab}?run=${id}&method=fixed&interval=1000`)
  await expect(page.getByTestId('job-status')).toHaveText('Queued')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByTestId('connection')).toHaveText('Paused')
  const hidden = await stats(request, id)
  await new Promise((resolve) => setTimeout(resolve, 1700))
  expect((await stats(request, id)).snapshotRequests).toBe(hidden.snapshotRequests)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(async () => (await stats(request, id)).snapshotRequests).toBeGreaterThan(hidden.snapshotRequests)
  await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 19_000 })
  expect((await stats(request, id)).maxActiveSnapshots).toBe(1)
})

test('SSE reconnects and replays missed versions exactly once', async ({ page, request }) => {
  const id = await startRun(request, 'outage')
  await page.goto(`${lab}?run=${id}&method=sse`)
  await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 19_000 })
  expect(await observedVersions(page.getByRole('list', { name: 'Observed updates' }))).toEqual([6, 5, 4, 3, 2, 1, 0])
  const info = await stats(request, id)
  expect(info.streamRequests).toBeGreaterThan(1)
  expect(info.maxActiveStreams).toBe(1)
  await expect.poll(async () => (await stats(request, id)).activeStreams).toBe(0)
})

test('two tabs receive the same run with independent SSE streams', async ({ page, context, request }) => {
  const id = await startRun(request, 'quick')
  const url = `${lab}?run=${id}&method=sse`
  const other = await context.newPage()
  await Promise.all([page.goto(url), other.goto(url)])
  await Promise.all([page, other].map(async (tab) => {
    await expect(tab.getByTestId('job-status')).toHaveText('Completed', { timeout: 10_000 })
  }))
  const info = await stats(request, id)
  expect(info.streamRequests).toBe(2)
  expect(info.maxActiveStreams).toBe(2)
})
