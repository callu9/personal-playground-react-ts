import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { startTrace, stopTrace, summarizeTrace } from './chrome-startup-trace.mjs'
import { labPath, portfolioPath, responseDelayMs, workerScope } from '../experiments/jonbeo-msw/contract.ts'

const modes = ['off', 'passthrough', 'mock']
const variants = ['gated', 'shell']
const scenarios = variants.flatMap((variant) => modes.map((mode) => ({ mode, variant })))
const rounds = Number(process.env.MSW_BENCH_ROUNDS || 7)
if (!Number.isInteger(rounds) || rounds < 1) throw new Error('MSW_BENCH_ROUNDS must be a positive integer')

const viewport = { width: 1280, height: 900 }
const cpuRate = 4
const actions = 8
const workerScript = workerScope + 'mockServiceWorker.js'
const traceEnabled = process.env.MSW_BENCH_TRACE === '1'
const output = 'test-results/jonbeo-msw'
const hash = (body) => createHash('sha256').update(body).digest('hex')
const startedAt = performance.now()
await mkdir(output, { recursive: true })
if (traceEnabled) await mkdir(join(output, 'traces'), { recursive: true })

function median(values) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!numbers.length) return null
  return (numbers[Math.floor((numbers.length - 1) / 2)] + numbers[Math.floor(numbers.length / 2)]) / 2
}

async function installInstrumentation(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
}

async function sample(page, url, { mode, variant }, visit) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === portfolioPath),
    (async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => window.jonbeoMetrics?.marks.data || window.jonbeoMetrics?.error)
      const error = await page.evaluate(() => window.jonbeoMetrics.error)
      if (error) throw new Error(error)
    })(),
  ])
  const expectedSource = mode === 'mock' ? 'mock' : 'api'
  const controller = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
  if (!response.ok() || response.headers()['x-jonbeo-source'] !== expectedSource ||
      response.fromServiceWorker() !== (mode !== 'off') ||
      (controller ? new URL(controller).pathname : null) !== (mode === 'off' ? null : workerScript)) {
    throw new Error('Unexpected request path: ' + JSON.stringify({ mode, status: response.status(), controller }))
  }

  const sort = page.getByRole('button', { name: 'Sort by name' })
  await expect(page.getByRole('row')).toHaveCount(8)
  await expect(sort).toHaveAttribute('aria-pressed', 'false')
  for (let index = 0; index < actions; index++) {
    await sort.click()
    await expect(sort).toHaveAttribute('aria-pressed', String(index % 2 === 0))
    await page.waitForTimeout(80)
  }
  await expect(page.getByRole('row').nth(1)).toContainText('MESA')

  const { timing, metrics } = await page.evaluate(() => ({
    timing: {
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      visibility: document.visibilityState,
    },
    metrics: window.jonbeoMetrics,
  }))
  if (!metrics.firstInput) throw new Error('Event Timing did not capture the first trusted input')
  if (timing.visibility !== 'visible') throw new Error('The measurement page did not remain visible')
  await page.evaluate(() => {
    sessionStorage.removeItem('jonbeo-bench-final')
    // The library flushes its observer during window capture. Read after it on the document.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      sessionStorage.setItem('jonbeo-bench-final', JSON.stringify({
        inp: window.jonbeoMetrics.inp ?? null,
        visibility: document.visibilityState,
      }))
    })
  })
  await page.goto(new URL('/?jonbeo-measurement=read', url).href, { waitUntil: 'domcontentloaded' })
  const final = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jonbeo-bench-final') || 'null'))
  if (final?.visibility !== 'hidden') throw new Error('INP lifecycle did not finish with a hidden page')
  const { body, marks, events, longTasks, firstInput } = metrics
  const startupTasks = longTasks.filter(({ at }) => at < marks.data)
  return {
    mode, variant, visit, source: expectedSource, fromWorker: response.fromServiceWorker(),
    controller: controller ? new URL(controller).pathname : null,
    bodyBytes: Buffer.byteLength(body), bodySha256: hash(body),
    marks, firstInput, events, inp: final.inp, longTasks, fcp: timing.fcp,
    shellMs: marks.shell,
    shellFromBootMs: marks.shell - marks.boot,
    workerInitMs: mode === 'off' ? null : marks.workerReady - marks.workerStart,
    requestToHeadersMs: marks.headers - marks.request,
    requestToBodyMs: marks.body - marks.request,
    dataMs: marks.data,
    startupTaskCount: startupTasks.length,
    startupTaskMaxMs: Math.max(0, ...startupTasks.map(({ duration }) => duration)),
  }
}

function summarize(samples) {
  return ['cold', 'repeat'].flatMap((visit) => scenarios.map(({ mode, variant }) => {
    const group = samples.filter((run) => run.mode === mode && run.variant === variant && run.visit === visit)
    const inputs = group.map((run) => run.inp?.value).filter(Number.isFinite)
    return {
      visit, mode, variant, runs: group.length, inpReports: inputs.length,
      inpMedianMs: median(inputs),
      inpRangeMs: inputs.length ? [Math.min(...inputs), Math.max(...inputs)] : null,
      inpInputDelayMs: median(group.map((run) => run.inp?.inputDelay)),
      inpProcessingMs: median(group.map((run) => run.inp?.processing)),
      inpPresentationMs: median(group.map((run) => run.inp?.presentation)),
      firstInputDelayMs: median(group.map((run) => run.firstInput.inputDelay)),
      shellMs: median(group.map((run) => run.shellMs)),
      shellFromBootMs: median(group.map((run) => run.shellFromBootMs)),
      workerInitMs: median(group.map((run) => run.workerInitMs)),
      requestToHeadersMs: median(group.map((run) => run.requestToHeadersMs)),
      requestToBodyMs: median(group.map((run) => run.requestToBodyMs)),
      dataMs: median(group.map((run) => run.dataMs)),
      startupTaskCount: median(group.map((run) => run.startupTaskCount)),
      startupTaskMaxMs: median(group.map((run) => run.startupTaskMaxMs)),
    }
  }))
}

const previewServer = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } })
try {
  const address = previewServer.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Preview server has no TCP address')
  const origin = 'http://127.0.0.1:' + address.port
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const samples = []
    const failures = []
    const traceSession = traceEnabled ? await browser.newBrowserCDPSession() : null
    for (let round = 0; round < rounds; round++) {
      for (let index = 0; index < scenarios.length; index++) {
        const condition = scenarios[(round + index) % scenarios.length]
        for (let attempt = 1; attempt <= 2; attempt++) {
          const context = await browser.newContext({ viewport, serviceWorkers: 'allow' })
          const page = await context.newPage()
          const logs = []
          page.on('pageerror', (error) => logs.push(error.message))
          page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning') logs.push(message.text())
          })
          let visit
          try {
            await installInstrumentation(page)
            const path = condition.mode === 'off' ? labPath : workerScope
            const url = origin + path + '?mode=' + condition.mode + '&variant=' + condition.variant
            const visits = []
            for (visit of ['cold', 'repeat']) {
              const traced = traceSession && visit === 'cold'
              if (traced) await startTrace(traceSession)
              const run = await sample(page, url, condition, visit)
              let trace
              if (traced) {
                const file = join(output, 'traces', [round + 1, condition.mode, condition.variant].join('-') + '.json.gz')
                const events = await stopTrace(traceSession, file)
                const workerMarks = condition.mode === 'off' ? [] : ['workerStart', 'workerModuleReady']
                trace = {
                  path: file,
                  ...summarizeTrace(events, 'jonbeo:', [
                    'boot', 'appCommit', 'effect', ...workerMarks, 'workerReady',
                    'request', 'headers', 'body', 'stateUpdate', 'data',
                  ], [/worker-client-/, new RegExp(portfolioPath)]),
                }
              }
              visits.push({ round: round + 1, ...run, trace })
            }
            samples.push(...visits)
            break
          } catch (error) {
            const state = await page.evaluate(() => ({
              marks: window.jonbeoMetrics?.marks,
              error: window.jonbeoMetrics?.error,
              controller: navigator.serviceWorker.controller?.state,
            })).catch(() => null)
            const failure = { round: round + 1, attempt, visit, ...condition, message: error.message, state, logs }
            failures.push(failure)
            console.error(JSON.stringify(failure))
            if (traceEnabled || attempt === 2) throw error
          } finally {
            await context.close()
          }
        }
      }
      console.log('Completed round ' + (round + 1) + '/' + rounds)
    }
    if (new Set(samples.map(({ bodySha256 }) => bodySha256)).size !== 1) throw new Error('Response bodies differed')
    const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'))
    const versions = Object.fromEntries(['react', 'vite', 'msw', 'web-vitals'].map(
      (name) => [name, packageLock.packages['node_modules/' + name].version],
    ))
    const results = {
      measuredAt: new Date().toISOString(),
      durationSeconds: Math.round((performance.now() - startedAt) / 100) / 10,
      environment: { platform: os.platform(), osRelease: os.release(), cpu: os.cpus()[0]?.model,
        chrome: browser.version(), node: process.version, ...versions },
      protocol: { rounds, viewport, cpuRate, actions, delayMs: responseDelayMs, origin: 'loopback',
        cold: 'new Playwright context',
        repeat: 'same context and tab after navigating away, worker registration retained',
        inp: 'web-vitals/attribution, reportAllChanges, 16 ms threshold, captured after the visibilitychange hidden flush' },
      summary: summarize(samples),
      samples, failures,
    }
    const file = join(output, traceEnabled ? 'traced-results.json' : 'results.json')
    await writeFile(file, JSON.stringify(results, null, 2) + '\n')
    console.table(results.summary)
    console.log(file)
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve) => previewServer.httpServer.close(resolve))
}
