import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { apiPath, experimentPath } from '../experiments/job-status/contract.ts'

const only = (process.argv.find((arg) => arg.startsWith('--groups='))?.slice(9) ?? 'normal,slow,outage,limited,cancel,tabs').split(',')
const baseFile = process.argv.find((arg) => arg.startsWith('--base='))?.slice(7)
const base = baseFile ? JSON.parse(await readFile(baseFile, 'utf8')).samples : []
const outFile = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ?? 'test-results/job-status.json'

const fixed = (seconds, retry = 'honor') => ({ label: `fixed-${seconds}s${retry === 'ignore' ? '-ignore' : ''}`, method: 'fixed', interval: seconds * 1_000, retry })
const adaptive = (retry = 'honor') => ({ label: `adaptive${retry === 'ignore' ? '-ignore' : ''}`, method: 'adaptive', retry })
const sse = { label: 'sse', method: 'sse' }
const normal = [fixed(1), fixed(3), fixed(5), adaptive(), sse]
const stress = [fixed(1), adaptive(), sse]
const limited = [fixed(1), fixed(1, 'ignore'), fixed(3), adaptive(), adaptive('ignore'), sse]
const startOffsets = [0, 1_100, 2_350]
const cancelOffsets = [0, 600, 1_200, 1_800, 2_400]
const cancelAfterStartMs = 6_500

async function json(url, options) {
  const response = await fetch(`${origin}${url}`, options)
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.json()
}

const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ?? null
const mean = (values) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null
const round1 = (value) => value === null ? null : Math.round(value * 10) / 10

async function openPage(context) {
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.jobProbe = { seen: new Map(), clickAt: null, wasHidden: document.visibilityState !== 'visible' }
    document.addEventListener('visibilitychange', () => { window.jobProbe.wasHidden ||= document.visibilityState !== 'visible' })
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-testid="cancel"]')) window.jobProbe.clickAt = Date.now()
    }, true)
    new MutationObserver(() => {
      for (const entry of document.querySelectorAll('[data-version][data-recorded-at]')) {
        const version = Number(entry.getAttribute('data-version'))
        if (!window.jobProbe.seen.has(version)) window.jobProbe.seen.set(version, { at: Date.now(), status: entry.getAttribute('data-status') })
      }
    }).observe(document, { childList: true, subtree: true })
  })
  return page
}

function queryFor(run, scenario, candidate) {
  const parameters = new URLSearchParams({ run: run.id, scenario, method: candidate.method })
  if (candidate.interval) parameters.set('interval', String(candidate.interval))
  if (candidate.retry) parameters.set('retry', candidate.retry)
  return `${origin}${experimentPath}?${parameters}`
}

// Tabs share one browser context (one profile, one socket pool) unless isolated is set.
async function measure(browser, candidate, scenario, round, { tabs = 1, isolated = false, startOffsetMs = 0 } = {}) {
  const shared = isolated ? null : await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const contexts = isolated ? await Promise.all(Array.from({ length: tabs }, () => browser.newContext({ viewport: { width: 1280, height: 900 } }))) : [shared]
  const pages = await Promise.all(Array.from({ length: tabs }, (_, index) => openPage(contexts[isolated ? index : 0])))
  try {
    const run = await json(`${apiPath}/runs?scenario=${scenario}`, { method: 'POST' })
    if (startOffsetMs > 0) await delay(startOffsetMs)
    const url = queryFor(run, scenario, candidate)
    await Promise.all(pages.map((page) => page.goto(url, { timeout: 60_000 })))
    // Wait for every tab to finish, at most 45 s after the run was created (it starts 2 s later), then at least until the planned end of the run.
    const giveUpAt = run.startedAt + 43_000
    await Promise.all(pages.map((page) => expect(page.getByTestId('job-status')).toHaveText('Completed', { timeout: Math.max(1_000, giveUpAt - Date.now()) }).catch(() => {})))
    await delay(Math.max(0, run.endsAt - Date.now()))
    const readAt = Date.now()
    const { expected, ...stats } = await json(`${apiPath}/runs/${run.id}/stats`)
    const observations = await Promise.all(pages.map(async (page, index) => {
      const observed = await page.evaluate(() => ({ seen: [...window.jobProbe.seen], wasHidden: window.jobProbe.wasHidden }))
      if (observed.wasHidden) throw new Error(`Measurement tab was hidden for ${candidate.label}`)
      const seen = new Map(observed.seen)
      const afterOutage = run.startedAt + 8_500
      const neededVersion = expected.filter(({ recordedAt }) => recordedAt <= afterOutage).at(-1).version
      const recoveredAt = [...seen].find(([version, entry]) => version >= neededVersion && entry.at >= afterOutage)?.[1].at
      return {
        tab: index + 1,
        updates: expected.filter(({ version }) => version > 0).map(({ version, recordedAt, status }) => ({
          version, status, delayMs: seen.has(version) ? seen.get(version).at - recordedAt : null,
        })),
        recoveryMs: scenario === 'outage' && recoveredAt !== undefined ? recoveredAt - afterOutage : null,
      }
    }))
    return { candidate: candidate.label, scenario, round, tabs, isolated, startOffsetMs, windowMs: readAt - expected[0].recordedAt, ...stats, observations }
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
}

// One tab clicks Cancel at a fixed point of the job; the other tab only watches.
async function measureCancel(browser, candidate, round, startOffsetMs) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const pages = await Promise.all([openPage(context), openPage(context)])
  try {
    const run = await json(`${apiPath}/runs?scenario=normal`, { method: 'POST' })
    await delay(startOffsetMs)
    await Promise.all(pages.map((page) => page.goto(queryFor(run, 'normal', candidate))))
    await delay(Math.max(0, run.startedAt + cancelAfterStartMs - Date.now()))
    await pages[0].getByTestId('cancel').click()
    await Promise.all(pages.map((page) => expect(page.getByTestId('job-status')).toHaveText('Cancelled', { timeout: 15_000 })))
    await delay(1_500)
    const { expected, ...stats } = await json(`${apiPath}/runs/${run.id}/stats`)
    const probes = await Promise.all(pages.map((page) => page.evaluate(() => ({ seen: [...window.jobProbe.seen], clickAt: window.jobProbe.clickAt, wasHidden: window.jobProbe.wasHidden }))))
    if (probes.some(({ wasHidden }) => wasHidden)) throw new Error(`Measurement tab was hidden for ${candidate.label}`)
    const clickAt = probes[0].clickAt
    const cancelling = expected.find(({ status }) => status === 'Cancelling')
    const cancelled = expected.find(({ status }) => status === 'Cancelled')
    const lastBefore = expected.filter(({ recordedAt }) => recordedAt < cancelling.recordedAt).at(-1)
    return {
      candidate: candidate.label, scenario: 'cancel', round, tabs: 2, startOffsetMs, ...stats,
      cancelAfterStartMs: stats.cancelRequestedAt - run.startedAt,
      statusAtCancel: lastBefore.status,
      observations: probes.map(({ seen }, index) => {
        const byVersion = new Map(seen)
        return {
          tab: index + 1, role: index === 0 ? 'clicker' : 'observer',
          cancellingMs: byVersion.has(cancelling.version) ? byVersion.get(cancelling.version).at - clickAt : null,
          cancelledMs: byVersion.get(cancelled.version).at - clickAt,
          afterServerCancelledMs: byVersion.get(cancelled.version).at - cancelled.recordedAt,
        }
      }),
    }
  } finally {
    await context.close()
  }
}

function summarize(sample) {
  const updates = sample.observations.flatMap((row) => row.updates ?? [])
  const received = updates.flatMap(({ delayMs }) => delayMs === null ? [] : [delayMs])
  const completed = updates.filter(({ status }) => status === 'Completed')
  const requests = sample.snapshotRequests + sample.streamRequests
  return { updates, received, completed, requests, perTabMin: requests * 60_000 / sample.windowMs / sample.tabs }
}

function aggregate(samples) {
  const keys = new Map()
  for (const sample of samples.filter(({ scenario }) => scenario !== 'cancel')) {
    const key = [sample.group, sample.scenario, sample.candidate, sample.tabs, sample.isolated].join('|')
    keys.set(key, [...(keys.get(key) ?? []), sample])
  }
  const rows = [...keys.values()].map((group) => {
    const parts = group.map(summarize)
    const updates = parts.flatMap(({ updates }) => updates)
    const received = parts.flatMap(({ received }) => received)
    const completed = parts.flatMap(({ completed }) => completed)
    const [{ group: groupName, scenario, candidate, tabs, isolated }] = group
    return {
      group: groupName, scenario, candidate, tabs, isolated, runs: group.length,
      versions: updates.length, missed: updates.length - received.length,
      receivedP95Ms: percentile(received, 0.95),
      completedP95Ms: percentile(completed.flatMap(({ delayMs }) => delayMs === null ? [] : [delayMs]), 0.95),
      completedSeen: `${completed.filter(({ delayMs }) => delayMs !== null).length}/${completed.length}`,
      recoveryP95Ms: percentile(group.flatMap(({ observations }) => observations.flatMap(({ recoveryMs }) => recoveryMs === null ? [] : [recoveryMs])), 0.95),
      requestsPerRun: round1(mean(parts.map(({ requests }) => requests))),
      requestsPerTabMin: round1(mean(parts.map(({ perTabMin }) => perTabMin))),
      rejectedPerRun: round1(mean(group.map(({ rejectedRequests }) => rejectedRequests))),
      // The server cannot tell tabs apart, so the early-retry count is meaningful for one tab only.
      earlyRetries: tabs === 1 ? group.reduce((total, { earlyRetries }) => total + earlyRetries, 0) : null,
      bodyBytesPerTabMin: Math.round(mean(group.map((sample) => sample.bodyBytes * 60_000 / sample.windowMs / sample.tabs))),
      maxActiveStreams: Math.max(...group.map(({ maxActiveStreams }) => maxActiveStreams)),
      maxActiveSnapshots: Math.max(...group.map(({ maxActiveSnapshots }) => maxActiveSnapshots)),
    }
  })
  const cancels = new Map()
  for (const sample of samples.filter(({ scenario }) => scenario === 'cancel')) {
    cancels.set(sample.candidate, [...(cancels.get(sample.candidate) ?? []), sample])
  }
  const cancelRows = [...cancels].map(([candidate, group]) => {
    const pick = (role, field) => group.map(({ observations }) => observations.find((row) => row.role === role)[field])
    const stat = (values) => ({ min: Math.min(...values), median: percentile(values, 0.5), max: Math.max(...values) })
    const cancelling = pick('clicker', 'cancellingMs').filter((value) => value !== null)
    return {
      scenario: 'cancel', candidate, runs: group.length,
      clickerCancelledMs: stat(pick('clicker', 'cancelledMs')), observerCancelledMs: stat(pick('observer', 'cancelledMs')),
      cancellingSeen: `${cancelling.length}/${group.length}`,
      requestsPerRun: round1(mean(group.map(({ snapshotRequests, streamRequests }) => snapshotRequests + streamRequests))),
    }
  })
  return [...rows, ...cancelRows]
}

const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } })
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
try {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const samples = base.filter((sample) => !only.includes(sample.group))
    let current = ''
    const phase = (name) => { current = name; return only.includes(name) }
    async function group(candidates, scenario, round, options = {}) {
      const rows = await Promise.all(candidates.map((candidate) => measure(browser, candidate, scenario, round, options)))
      samples.push(...rows.map((row) => ({ group: current, ...row })))
      console.table(rows.map((row) => ({ scenario, candidate: row.candidate, round, tabs: row.tabs, requests: row.snapshotRequests + row.streamRequests, rejected: row.rejectedRequests })))
    }
    const rotated = (candidates, round) => [...candidates.slice(round - 1), ...candidates.slice(0, round - 1)]
    if (phase('normal')) {
      for (let round = 1; round <= 3; round++) await group(rotated(normal, round), 'normal', round, { startOffsetMs: startOffsets[round - 1] })
    }
    if (phase('slow')) for (let round = 1; round <= 2; round++) await group(stress, 'slow', round)
    if (phase('outage')) for (let round = 1; round <= 2; round++) await group(stress, 'outage', round)
    if (phase('limited')) {
      for (let round = 1; round <= 3; round++) await group(rotated(limited, round), 'limited', round, { startOffsetMs: startOffsets[round - 1] })
    }
    if (phase('cancel')) {
      for (let round = 1; round <= cancelOffsets.length; round++) {
        const rows = await Promise.all(rotated(normal, round).map((candidate) => measureCancel(browser, candidate, round, cancelOffsets[round - 1])))
        samples.push(...rows.map((row) => ({ group: 'cancel', ...row })))
        console.table(rows.map((row) => ({ candidate: row.candidate, round, clickerMs: Math.round(row.observations[0].cancelledMs), observerMs: Math.round(row.observations[1].cancelledMs) })))
      }
    }
    if (phase('tabs')) {
      for (const tabs of [1, 5, 20]) {
        for (const candidate of [fixed(1), fixed(3), adaptive(), sse]) await group([candidate], 'normal', 1, { tabs })
      }
      for (const round of [1, 2]) {
        if (round === 2) await group([sse], 'normal', round, { tabs: 20 })
        await group([sse], 'normal', round, { tabs: 20, isolated: true })
        for (const tabs of [5, 20]) {
          for (const candidate of [fixed(3), fixed(3, 'ignore'), sse]) await group([candidate], 'limited', round, { tabs })
        }
      }
    }

    await mkdir('test-results', { recursive: true })
    await writeFile(outFile, JSON.stringify({
      environment: {
        platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model, cores: os.cpus().length,
        memoryGiB: Math.round(os.totalmem() / 2 ** 30), node: process.version, chrome: browser.version(), viewport: '1280x900',
      },
      samples, aggregate: aggregate(samples),
    }, null, 2))
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
}
