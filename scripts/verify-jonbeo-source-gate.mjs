import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const [beforeUrl, afterUrl] = process.argv.slice(2)
if (!beforeUrl || !afterUrl) {
  throw new Error('Usage: node scripts/verify-jonbeo-source-gate.mjs <d68ac41 URL> <76f9ac6 URL>')
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const { url, commit, waitsForWorker } of [
    { url: beforeUrl, commit: 'd68ac41', waitsForWorker: true },
    { url: afterUrl, commit: '76f9ac6', waitsForWorker: false },
  ]) {
    const page = await browser.newPage()
    const portfolioRequests = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (pathname === '/api/portfolio' || pathname === '/portfolio') portfolioRequests.push(pathname)
    })
    await page.addInitScript(() => {
      const serviceWorker = navigator.serviceWorker
      const register = serviceWorker.register.bind(serviceWorker)
      let release
      const pending = new Promise((resolve) => { release = resolve })
      window.jonbeoGate = { registerCalls: 0, release }
      serviceWorker.register = async (...args) => {
        window.jonbeoGate.registerCalls++
        await pending
        return register(...args)
      }
    })

    const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
    assert.equal(response?.status(), 200)
    const heading = page.getByRole('heading', { name: '포트폴리오', exact: true })
    const holding = page.locator('a[href="/stocks/FB"]')
    if (waitsForWorker) {
      await page.waitForFunction(() => window.jonbeoGate.registerCalls > 0)
      await expect(heading).toHaveCount(0)
      await expect(holding).toHaveCount(0)
    } else {
      await expect(heading).toBeVisible({ timeout: 30_000 })
      await expect(holding).toBeVisible({ timeout: 30_000 })
    }
    const shownWhilePaused = await heading.isVisible()
    await page.evaluate(() => window.jonbeoGate.release())
    await expect(heading).toBeVisible({ timeout: 30_000 })
    await expect(holding).toBeVisible({ timeout: 30_000 })
    const registerCalls = await page.evaluate(() => window.jonbeoGate.registerCalls)
    assert.equal(registerCalls, waitsForWorker ? 1 : 0)
    assert.deepEqual(portfolioRequests, [])
    console.log(JSON.stringify({ commit, chrome: browser.version(), registerCalls, shownWhilePaused, shownAfterRelease: true, portfolioRequests }))
    await page.close()
  }
} finally {
  await browser.close()
}
