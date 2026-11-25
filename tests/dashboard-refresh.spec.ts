import { expect, test, type APIRequestContext } from '@playwright/test'

const api = '/api/dashboard-refresh'
const dashboard = '/experiments/dashboard-refresh/'

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

test('launcher opens the dashboard refresh experiment', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Dashboard auto refresh/ }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard auto refresh' })).toBeVisible()
  await page.getByRole('button', { name: 'Start run' }).click()
  const share = page.getByRole('link', { name: 'Open this run in another tab' })
  await expect(share).toHaveAttribute('href', /scenario=normal/)
  await page.getByRole('combobox', { name: /scenario/i }).selectOption('slow')
  await expect(share).toHaveAttribute('href', /scenario=normal/)
})

for (const method of ['fixed', 'adaptive', 'sse']) {
  test(`${method} displays the first result and stops after completion`, async ({ page, request }) => {
    const id = await startRun(request, 'quick')
    await page.goto(`${dashboard}?run=${id}&method=${method}&interval=1000`)
    await expect(page.getByTestId('job-status')).toHaveText('Running')
    if (process.env.PLAYGROUND_PHASE_TIMING === '1') console.log('first-result', method, Date.now())
    await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 12_000 })
    await expect(page.getByTestId('job-progress')).toHaveText('100%')
    await expect(page.getByRole('list', { name: 'Observed updates' }).locator('[data-version="4"]')).toHaveCount(1)
    const before = await stats(request, id)
    await expect.poll(async () => (await stats(request, id)).activeStreams).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 1300))
    const after = await stats(request, id)
    expect(after.snapshotRequests + after.streamRequests).toBe(before.snapshotRequests + before.streamRequests)
    expect(method === 'sse' ? after.streamRequests : after.snapshotRequests).toBeGreaterThan(0)
    if (process.env.PLAYGROUND_PHASE_TIMING === '1') console.log('verified', method, Date.now())
  })
}

test('slow polling stays single-flight and refreshes on foreground return', async ({ page, request }) => {
  const id = await startRun(request, 'slow')
  await page.goto(`${dashboard}?run=${id}&method=fixed&interval=1000`)
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
  await page.goto(`${dashboard}?run=${id}&method=sse`)
  await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 19_000 })
  const versions = await page.getByRole('list', { name: 'Observed updates' }).locator('[data-version]').evaluateAll(
    (nodes) => nodes.map((node) => Number(node.getAttribute('data-version'))),
  )
  expect(versions).toEqual([6, 5, 4, 3, 2, 1, 0])
  const info = await stats(request, id)
  expect(info.streamRequests).toBeGreaterThan(1)
  expect(info.maxActiveStreams).toBe(1)
  await expect.poll(async () => (await stats(request, id)).activeStreams).toBe(0)
})

test('two tabs receive the same run with independent SSE streams', async ({ page, context, request }) => {
  const id = await startRun(request, 'quick')
  const url = `${dashboard}?run=${id}&method=sse`
  const other = await context.newPage()
  await Promise.all([page.goto(url), other.goto(url)])
  await Promise.all([page, other].map(async (tab) => {
    await expect(tab.getByTestId('job-status')).toHaveText('Completed', { timeout: 10_000 })
  }))
  const info = await stats(request, id)
  expect(info.streamRequests).toBe(2)
  expect(info.maxActiveStreams).toBe(2)
})
