import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { apiPath, dashboardPath } from '../experiments/dashboard-refresh/contract.ts'

const fixed = (interval) => ({ label: `fixed-${interval / 1_000}s`, method: 'fixed', interval })
const adaptive = { label: 'adaptive', method: 'adaptive' }
const sse = { label: 'sse', method: 'sse' }
const normal = [fixed(1_000), fixed(3_000), fixed(5_000), adaptive, sse]
const stress = [fixed(1_000), adaptive, sse]
const normalStartOffsets = [0, 1_100, 2_350]

async function json(url, options) {
  const response = await fetch(`${origin}${url}`, options)
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.json()
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null
}

async function openProbe(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.refreshProbe = { updates: new Map(), wasHidden: document.visibilityState !== 'visible' }
    document.addEventListener('visibilitychange', () => {
      window.refreshProbe.wasHidden ||= document.visibilityState !== 'visible'
    })
    new MutationObserver(() => {
      for (const entry of document.querySelectorAll('[data-version][data-recorded-at]')) {
        const version = Number(entry.getAttribute('data-version'))
        if (!window.refreshProbe.updates.has(version)) window.refreshProbe.updates.set(version, Date.now())
      }
    }).observe(document, { childList: true, subtree: true })
  })
  return { context, page }
}

async function measure(browser, candidate, scenario, round, tabs = 1) {
  const probes = await Promise.all(Array.from({ length: tabs }, () => openProbe(browser)))
  try {
    const run = await json(`${apiPath}/runs?scenario=${scenario}`, { method: 'POST' })
    const startOffsetMs = scenario === 'normal' && tabs === 1 ? normalStartOffsets[round - 1] : 0
    if (startOffsetMs > 0) await delay(startOffsetMs)
    const parameters = new URLSearchParams({ run: run.id, scenario, method: candidate.method })
    if (candidate.interval) parameters.set('interval', String(candidate.interval))
    await Promise.all(probes.map(async ({ page }) => {
      await page.goto(`${origin}${dashboardPath}?${parameters}`)
      await expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: 23_000 })
      if (await page.evaluate(() => window.refreshProbe.wasHidden)) {
        throw new Error(`Measurement tab is hidden for ${candidate.label}`)
      }
    }))
    await delay(Math.max(0, run.endsAt - Date.now()))
    const { expected, ...stats } = await json(`${apiPath}/runs/${run.id}/stats`)
    const observations = await Promise.all(probes.map(async ({ page }, index) => {
      const observed = await page.evaluate(() => ({
        updates: [...window.refreshProbe.updates], wasHidden: window.refreshProbe.wasHidden,
      }))
      if (observed.wasHidden) throw new Error(`Measurement tab was hidden for ${candidate.label}`)
      const seen = new Map(observed.updates)
      const afterOutage = run.startedAt + 8_500
      const neededVersion = expected.filter(({ recordedAt }) => recordedAt <= afterOutage).at(-1).version
      const recoveredAt = [...seen].find(([version, receivedAt]) => version >= neededVersion && receivedAt >= afterOutage)?.[1]
      return {
        tab: index + 1,
        updates: expected.filter(({ version }) => version > 0).map(({ version, recordedAt, status }) => ({
          version, status, delayMs: seen.has(version) ? seen.get(version) - recordedAt : null,
        })),
        recoveryMs: scenario === 'outage' && recoveredAt !== undefined ? recoveredAt - afterOutage : null,
      }
    }))
    return { method: candidate.label, scenario, round, tabs, startOffsetMs, windowMs: run.endsAt - expected[0].recordedAt, ...stats, observations }
  } finally {
    await Promise.all(probes.map(({ context }) => context.close()))
  }
}

function summarize(samples) {
  return samples.map((sample) => {
    const updates = sample.observations.flatMap((row) => row.updates)
    const received = updates.flatMap(({ delayMs }) => delayMs === null ? [] : [delayMs])
    const terminal = updates.filter(({ status }) => status === 'Completed').map(({ delayMs }) => delayMs)
    const requests = sample.snapshotRequests + sample.streamRequests
    return {
      scenario: sample.scenario, method: sample.method, round: sample.round, tabs: sample.tabs, requests,
      reqPerTabMin: Math.round(requests * 60_000 / sample.windowMs / sample.tabs * 10) / 10,
      bodyBytes: sample.bodyBytes, updateP95Ms: percentile(received, 0.95),
      completedP95Ms: percentile(terminal, 0.95), missed: updates.length - received.length,
      recoveryMs: sample.observations[0].recoveryMs, maxStreams: sample.maxActiveStreams,
    }
  })
}

const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } })
const origin = "http://127.0.0.1:" + server.httpServer.address().port
try {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const samples = []
    async function group(candidates, scenario, round, tabs = 1) {
      const settled = await Promise.allSettled(candidates.map((candidate) => measure(browser, candidate, scenario, round, tabs)))
      const rows = settled.map((result) => {
        if (result.status === 'rejected') throw result.reason
        return result.value
      })
      samples.push(...rows)
      console.table(summarize(rows))
    }
    for (let round = 1; round <= 3; round++) {
      const offset = round - 1
      await group([...normal.slice(offset), ...normal.slice(0, offset)], 'normal', round)
    }
    await group(stress, 'slow', 1)
    await group(stress, 'outage', 1)
    await group([fixed(3_000), adaptive, sse], 'normal', 1, 2)

    await mkdir('test-results', { recursive: true })
    await writeFile('test-results/dashboard-refresh.json', JSON.stringify({
      node: process.version, chrome: browser.version(), samples, summary: summarize(samples),
    }, null, 2))
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
}
