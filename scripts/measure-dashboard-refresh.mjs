import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { apiPath, dashboardPath } from '../experiments/dashboard-refresh/contract.ts'
import { cycleMs, outageEndMs, snapshotAt, snapshotFor } from '../experiments/dashboard-refresh/fixture.ts'
import { candidates, summarize } from '../experiments/dashboard-refresh/benchmark.ts'

const targetWindowMs = 2 * cycleMs
const startOffsets = [0, 700, 1_300]
const scenarios = ['normal', 'slow', 'outage']
const viewport = { width: 1280, height: 900 }

async function json(url, options) {
  const response = await fetch(`${origin}${url}`, options)
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.json()
}

async function openProbe(browser) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.addInitScript(() => {
    sessionStorage.setItem('brand-theme-demo-account', 'grove-operator')
    const probe = { updates: new Map(), firstSnapshotMs: null, wasHidden: document.visibilityState !== 'visible' }
    window.refreshProbe = probe
    document.addEventListener('visibilitychange', () => {
      probe.wasHidden ||= document.visibilityState !== 'visible'
    })
    new MutationObserver(() => {
      const entry = document.querySelector('[data-testid="live-metrics"][data-version]')
      if (!entry) return
      const version = Number(entry.dataset.version)
      if (probe.updates.has(version)) return
      probe.firstSnapshotMs ??= Math.round(performance.now())
      probe.updates.set(version, Date.now())
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-version'] })
  })
  return { context, page }
}

function behindTime(expected, seen, end) {
  const events = [
    ...expected.map(({ version, recordedAt }) => ({ type: 'source', version, at: recordedAt })),
    ...seen.map(([version, at]) => ({ type: 'display', version, at })),
  ].sort((a, b) => a.at - b.at)
  let behindMs = 0
  let previous = expected[0].recordedAt
  let source = 0
  let display = -1
  for (const { type, version, at } of events) {
    if (display < source) behindMs += at - previous
    if (type === 'source') source = version
    else display = version
    previous = at
  }
  return behindMs + (display < source ? end - previous : 0)
}

async function measure(browser, candidate, scenario, round, tabs) {
  const probes = await Promise.all(Array.from({ length: tabs }, () => openProbe(browser)))
  try {
    const feed = await json(`${apiPath}/feeds?scenario=${scenario}`, { method: 'POST' })
    const startOffsetMs = startOffsets[round - 1]
    if (startOffsetMs) await delay(startOffsetMs)
    const parameters = new URLSearchParams({ feed: feed.id, scenario, method: candidate.method })
    if (candidate.interval) parameters.set('interval', String(candidate.interval))
    await Promise.all(probes.map(async ({ page }) => {
      await page.goto(`${origin}${dashboardPath}?${parameters}`)
      await expect(page.getByTestId('live-metrics')).toHaveAttribute('data-version', /\d+/)
      await expect(page.getByRole('region', { name: 'Operations theme' })).toHaveAttribute('data-brand', 'grove')
    }))
    await delay(Math.max(0, feed.startedAt + targetWindowMs - Date.now()))
    const { observedAt, ...stats } = await json(`${apiPath}/feeds/${feed.id}/stats`)
    const last = snapshotAt(feed.startedAt, observedAt)
    const expected = Array.from({ length: last.version + 1 }, (_, version) => snapshotFor(feed.startedAt, version))
    assert.equal(expected.length - 1, 20, 'Window passed the expected two cycles')
    const recoveryStart = feed.startedAt + outageEndMs
    const recoveryVersion = snapshotAt(feed.startedAt, recoveryStart).version
    const observations = await Promise.all(probes.map(async ({ page }, index) => {
      const observed = await page.evaluate(() => ({
        updates: [...window.refreshProbe.updates],
        firstSnapshotMs: window.refreshProbe.firstSnapshotMs,
        wasHidden: window.refreshProbe.wasHidden,
      }))
      assert(!observed.wasHidden, `Unexpected hidden tab for ${candidate.id}`)
      const delivered = observed.updates.filter(([, at]) => at <= observedAt)
      assert.equal(delivered[0]?.[0], 0, `Initial snapshot missed for ${candidate.id}`)
      const seen = new Map(delivered)
      const recovered = scenario === 'outage'
        ? delivered.find(([version, at]) => version >= recoveryVersion && at >= recoveryStart)
        : undefined
      return {
        tab: index + 1,
        firstSnapshotMs: observed.firstSnapshotMs,
        updates: expected.slice(1).map(({ version, phase, recordedAt }) => ({
          version, phase, delayMs: seen.has(version) ? seen.get(version) - recordedAt : null,
        })),
        behindMs: behindTime(expected, delivered, observedAt),
        recoveryMs: recovered ? recovered[1] - recoveryStart : null,
      }
    }))
    return { candidate: candidate.id, scenario, round, tabs, startOffsetMs, windowMs: observedAt - feed.startedAt, ...stats, observations }
  } finally {
    await Promise.all(probes.map(({ context }) => context.close()))
  }
}

const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } })
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
try {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const samples = []
    async function group(methods, scenario, round, tabs = 1) {
      const settled = await Promise.allSettled(methods.map((candidate) => measure(browser, candidate, scenario, round, tabs)))
      for (const result of settled) {
        if (result.status === 'rejected') throw result.reason
        samples.push(result.value)
      }
      console.log(`${scenario} · round ${round} · ${tabs} tab(s) · ${methods.length} candidates complete`)
    }
    for (const scenario of scenarios) {
      const repeats = scenario === 'normal' ? 3 : 2
      for (let round = 1; round <= repeats; round++) {
        const offset = round - 1
        await group([...candidates.slice(offset), ...candidates.slice(0, offset)], scenario, round)
      }
    }
    await group(candidates.filter(({ id }) => id === 'fixed-3s' || id === 'adaptive' || id === 'sse'), 'normal', 1, 2)

    const summary = Object.fromEntries(scenarios.map((scenario) => [scenario, summarize(samples, scenario)]))
    await mkdir('test-results', { recursive: true })
    await writeFile('test-results/dashboard-refresh.json', JSON.stringify({
      node: process.version, chrome: browser.version(), viewport, brand: 'grove', targetWindowMs, summary, samples,
    }, null, 2) + '\n')
    for (const [scenario, tabs] of [['normal', 1], ['slow', 1], ['outage', 1], ['normal', 2]]) {
      console.log(`\n${scenario} · ${tabs} tab(s)`)
      console.table(summarize(samples, scenario, tabs).map(({ candidate, ...row }) => ({ method: candidate.id, ...row })))
    }
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
}
