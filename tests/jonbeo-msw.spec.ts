import { expect, test } from '@playwright/test'

const lab = '/experiments/jonbeo-msw/'
const endpoint = '/api/jonbeo-msw/portfolio'

test('recorded lab results and original development results are identifiable on the same page', async ({ page }) => {
  await page.goto(lab)
  await expect(page.getByLabel('Request path')).toBeVisible()
  await expect(page.getByLabel('Initial rendering')).toBeVisible()

  const recorded = page.getByRole('region', { name: '플레이그라운드 첫 방문 결과' })
  await expect(recorded.getByText('201.5 ms')).toBeVisible()
  await expect(recorded.getByRole('heading', { name: 'MSW passthrough' })).toBeVisible()
  await expect(recorded.getByRole('heading', { name: 'MSW mock' })).toBeVisible()

  const original = page.getByRole('region', { name: '원본 Jonbeo 개발 서버 결과' })
  await expect(original.getByText('6.44초', { exact: true })).toBeVisible()
  await expect(original.getByText('744 ms', { exact: true })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(8)
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
      await expect(page.getByRole('row')).toHaveCount(8)
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
      release()
      await expect(page.getByRole('row')).toHaveCount(8)
      await expect(sort).toHaveAttribute('aria-pressed', variant === 'shell' ? 'true' : 'false')
      await expect(page.getByRole('row').nth(1)).toContainText(variant === 'shell' ? 'ATLS' : 'MESA')
    } finally {
      release()
      await context.close()
    }
  }
})

test('the off entry stays uncontrolled after switching from a worker-controlled entry', async ({ page }) => {
  await page.goto(lab + 'worker/?mode=mock')
  await expect(page.getByRole('row')).toHaveCount(8)
  await page.getByLabel('Request path').selectOption('off')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(lab + '?mode=off&variant=shell')
  await expect(page.getByRole('row')).toHaveCount(8)
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull()
})
