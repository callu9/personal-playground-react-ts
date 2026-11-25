import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { startTrace, stopTrace, summarizeTrace } from './chrome-startup-trace.mjs'

const [beforeUrl, afterUrl, configuration = 'development'] = process.argv.slice(2)
if (!beforeUrl || !afterUrl || !['development', 'production'].includes(configuration)) {
  throw new Error('Usage: node scripts/measure-jonbeo-source.mjs <d68ac41 URL> <76f9ac6 URL> [development|production]')
}
const sites = [{ commit: 'd68ac41', url: beforeUrl }, { commit: '76f9ac6', url: afterUrl }]
const rounds = Number(process.env.JONBEO_SOURCE_ROUNDS || 7)
if (!Number.isInteger(rounds) || rounds < 1) throw new Error('JONBEO_SOURCE_ROUNDS must be a positive integer')
const output = 'test-results/jonbeo-msw/source-' + configuration
await mkdir(output, { recursive: true })
const source = await readFile('node_modules/web-vitals/dist/web-vitals.attribution.iife.js', 'utf8')

function observeOriginal() {
  const data = { marks: {}, inp: null, firstInput: null }
  window.jonbeoOriginal = data
  function mark(name) {
    data.marks[name] ??= performance.mark('jonbeo-source:' + name).startTime
  }
  mark('init')
  const sw = navigator.serviceWorker
  sw.addEventListener('controllerchange', () => mark('workerController'))
  sw.addEventListener('message', ({ data }) => {
    if (data?.type === 'MOCKING_ENABLED') mark('mockingEnabled')
  })
  const { register } = sw
  sw.register = function (...args) {
    mark('registerCalled')
    const registered = register.apply(sw, args)
    registered.then(() => mark('registerResolved'), () => {})
    return registered
  }

  const observer = new MutationObserver(() => {
    if (Array.from(document.querySelectorAll('h1')).some(
      (heading) => heading.textContent.trim() === '포트폴리오',
    )) mark('heading')
    if (Array.from(document.querySelectorAll('button')).some(
      (button) => button.textContent.includes('₩') && button.textContent.includes('$'),
    )) mark('unitControl')
    if (document.querySelector('a[href="/stocks/FB"]')) mark('holdings')
    if (data.marks.heading && data.marks.unitControl && data.marks.holdings) observer.disconnect()
  })
  observer.observe(document, { childList: true, subtree: true })
  new PerformanceObserver((list) => {
    const event = list.getEntries()[0]
    if (event) data.firstInput = event.processingStart - event.startTime
  }).observe({ type: 'first-input', buffered: true })
  webVitals.onINP(({ value, attribution }) => {
    data.inp = { value, inputDelay: attribution.inputDelay, processing: attribution.processingDuration,
      presentation: attribution.presentationDelay }
  }, { reportAllChanges: true, durationThreshold: 16 })
}

const prefix = 'jonbeo-source:'
const viewport = { width: 1280, height: 900 }
const cpuRate = 4
const actions = 8

async function measure(page, { url, commit }, traced) {
  const portfolioRequests = []
  const recordRequest = (request) => {
    const address = new URL(request.url())
    if (address.pathname === '/api/portfolio' || address.pathname === '/portfolio') {
      portfolioRequests.push(address.pathname)
    }
  }
  page.on('request', recordRequest)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const heading = page.getByRole('heading', { name: '포트폴리오', exact: true })
    const holding = page.getByRole('link', { name: /페이스북/ })
    const currency = page.getByRole('button').filter({ hasText: '₩' })
    await expect(heading).toBeVisible({ timeout: 30_000 })
    await expect(holding).toBeVisible({ timeout: 30_000 })
    await expect(currency).toBeVisible({ timeout: 30_000 })
    for (let index = 0; index < actions; index++) {
      const active = currency.getByText(index % 2 === 0 ? '₩' : '$', { exact: true })
      await currency.click()
      await expect(active).toHaveClass(/bg-gray-400/)
      await page.waitForTimeout(80)
    }
    await page.evaluate(() => performance.mark('jonbeo-source:actionsDone'))
    const last = await page.evaluate(() => {
      sessionStorage.removeItem('jonbeo-source-final')
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          sessionStorage.setItem('jonbeo-source-final', JSON.stringify(window.jonbeoOriginal.inp))
        }
      })
      const navigation = performance.getEntriesByType('navigation')[0]
      return {
        marks: window.jonbeoOriginal.marks,
        firstInputDelayMs: window.jonbeoOriginal.firstInput,
        fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        ttfbMs: navigation.responseStart,
        controller: Boolean(navigator.serviceWorker.controller),
      }
    })
    // Remain on the same origin so storage survives. The response is empty and has no client script.
    await page.route('**/__measure-end', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto(new URL('/__measure-end', url).href, { waitUntil: 'domcontentloaded' })
    const inp = await page.evaluate(() => sessionStorage.getItem('jonbeo-source-final'))
    if (inp === null || last.firstInputDelayMs === null ||
        !['heading', 'unitControl', 'holdings'].every((mark) => Number.isFinite(last.marks[mark]))) {
      throw new Error('Original measurement missed its observation window')
    }
    const expectedWorker = commit === 'd68ac41' && configuration === 'development'
    if (last.controller !== expectedWorker || (expectedWorker && !Number.isFinite(last.marks.mockingEnabled))) {
      throw new Error('Unexpected original worker state: ' + JSON.stringify(last))
    }
    return { commit, traced, ...last, portfolioRequests, inp: JSON.parse(inp) }
  } finally {
    page.off('request', recordRequest)
  }
}

const [before, after] = await Promise.all(sites.map(async ({ url }) => {
  const response = await fetch(new URL('/api/portfolio', url))
  if (!response.ok) throw new Error('Original API unavailable: ' + response.status)
  return response.text()
}))
if (before !== after || JSON.parse(before).stocks.length !== 7) throw new Error('Original fixtures differed')

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const traceSession = await browser.newBrowserCDPSession()
  const samples = []
  const traces = []
  for (let round = 0; round <= rounds; round++) {
    const traced = round === rounds
    for (let index = 0; index < sites.length; index++) {
      const site = sites[(round + index) % sites.length]
      const context = await browser.newContext({ viewport })
      try {
        const page = await context.newPage()
        await page.addInitScript({ content: source + '\n;(' + observeOriginal.toString() + ')()' })
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
        if (traced) await startTrace(traceSession)
        const run = await measure(page, site, traced)
        if (traced) {
          const events = await stopTrace(traceSession, join(output, site.commit + '.json.gz'))
          const boundaries = run.marks.mockingEnabled == null
            ? ['init', 'heading', 'holdings']
            : ['init', 'registerCalled', 'mockingEnabled', 'heading', 'holdings']
          const summary = summarizeTrace(events, prefix, boundaries,
            [/mockServiceWorker\.js/, /\/api\/portfolio/, /\/_next\/static\/chunks\/app\/layout/])
          traces.push({ ...run, summary })
        } else {
          samples.push({ round: round + 1, ...run })
        }
      } finally {
        await context.close()
      }
    }
    console.log(traced ? 'Collected original traces' : 'Completed original round ' + (round + 1) + '/' + rounds)
  }
  const results = { configuration, chrome: browser.version(), cpuRate, viewport, rounds, actions,
    bodyBytes: Buffer.byteLength(before), hash: createHash('sha256').update(before).digest('hex'), samples, traces }
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n')
} finally {
  await browser.close()
}
