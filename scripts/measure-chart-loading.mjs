import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { build, preview } from 'vite'
import { chartCount, strategyLabels } from '../experiments/chart-loading/contract.ts'

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const repeats = Number(arg('repeats', 5))
const plainRepeats = Number(arg('plain-repeats', 3))
const outFile = arg('out', 'test-results/chart-loading.json')
const strategies = Object.keys(strategyLabels)
const conditions = [
  { id: 'throttled', cpuRate: 4, network: { latency: 60, downloadThroughput: 10 * 1024 * 1024 / 8, uploadThroughput: 5 * 1024 * 1024 / 8 }, repeats },
  { id: 'plain', cpuRate: 1, network: null, repeats: plainRepeats },
]
const scrollSteps = 8

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : null
}
const round1 = (value) => value === null ? null : Math.round(value * 10) / 10

async function open(browser, origin, strategy, condition) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const probe = window.probe = { lcp: [], longTasks: [], events: [], fcp: null, drawn: [], visibleAt: {}, drawnAt: {} }
    const observe = (type, handle, extra = {}) => new PerformanceObserver((list) => list.getEntries().forEach(handle)).observe({ type, buffered: true, ...extra })
    observe('largest-contentful-paint', (entry) => probe.lcp.push({ at: entry.startTime, size: entry.size, element: entry.element?.tagName ?? null }))
    observe('longtask', (entry) => probe.longTasks.push({ at: entry.startTime, duration: entry.duration }))
    observe('paint', (entry) => { if (entry.name === 'first-contentful-paint') probe.fcp = entry.startTime })
    observe('event', (entry) => probe.events.push({ name: entry.name, at: entry.startTime, processingStart: entry.processingStart, processingEnd: entry.processingEnd, duration: entry.duration, interactionId: entry.interactionId }), { durationThreshold: 16 })
    const key = (canvas) => canvas.closest('section')?.id ?? ''
    // The first time a card shows on screen (no margin) versus the time its chart was drawn.
    const visible = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting && !(key(entry.target) in probe.visibleAt)) probe.visibleAt[key(entry.target)] = performance.now()
    })
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLElement && record.target.dataset.drawn) {
          probe.drawn.push(performance.now())
          probe.drawnAt[key(record.target)] ??= performance.now()
        }
        for (const node of record.addedNodes) for (const canvas of node instanceof Element ? node.querySelectorAll('canvas') : []) visible.observe(canvas)
      }
    }).observe(document, { attributes: true, attributeFilter: ['data-drawn'], subtree: true, childList: true })
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: condition.cpuRate })
  if (condition.network) {
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...condition.network })
  }
  await page.goto(`${origin}/experiments/chart-loading/${strategy}/`, { waitUntil: 'commit' })
  return { context, page, cdp }
}

async function heapMb(cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  return metrics.find(({ name }) => name === 'JSHeapUsedSize').value / 1024 / 1024
}

async function snapshot(page) {
  return page.evaluate(() => {
    const scripts = performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script' || entry.name.endsWith('.js'))
    const nav = performance.getEntriesByType('navigation')[0]
    return {
      ...window.probe, load: nav.loadEventEnd,
      scripts: scripts.map((entry) => ({ name: new URL(entry.name).pathname.split('/').pop(), start: entry.startTime, end: entry.responseEnd, bytes: entry.encodedBodySize })),
      drawnCharts: document.querySelectorAll('canvas[data-drawn]').length,
    }
  })
}

// Load only: no input, so the browser keeps reporting LCP candidates.
async function paintLoad(browser, origin, strategy, condition) {
  const { context, page, cdp } = await open(browser, origin, strategy, condition)
  try {
    await page.waitForLoadState('load')
    await delay(3_000)
    const heap = await heapMb(cdp)
    const data = await snapshot(page)
    const lcp = data.lcp.at(-1)
    const longTasks = data.longTasks.filter(({ at }) => at < 5_000)
    return {
      kind: 'paint', strategy, condition: condition.id, fcpMs: data.fcp, lcpMs: lcp?.at ?? null, lcpElement: lcp?.element ?? null,
      longTaskCount: longTasks.length, longTaskMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
      blockingMs: longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
      drawnCharts: data.drawnCharts, heapMb: heap, loadMs: data.load,
      scriptBytesBeforeLcp: data.scripts.filter(({ end }) => lcp && end <= lcp.at).reduce((sum, script) => sum + script.bytes, 0),
      scriptBytesTotal: data.scripts.reduce((sum, script) => sum + script.bytes, 0),
      chartChunk: data.scripts.filter(({ name }) => /chart/i.test(name)).map(({ name, start, end, bytes }) => ({ name, start, end, bytes })),
    }
  } finally {
    await context.close()
  }
}

// Click as soon as the button exists, then scroll through every chart and click between the steps.
async function inputLoad(browser, origin, strategy, condition) {
  const { context, page, cdp } = await open(browser, origin, strategy, condition)
  try {
    await page.getByTestId('ping').click()
    await page.waitForLoadState('load')
    await delay(3_000)
    const heapAfterLoad = await heapMb(cdp)
    await page.mouse.move(640, 500)
    const scrollStart = await page.evaluate(() => performance.now())
    for (let step = 0; step < scrollSteps; step++) {
      await page.mouse.wheel(0, 600)
      await delay(250)
      await page.getByTestId('ping').click()
      await delay(350)
    }
    await delay(1_500)
    const heapAfterScroll = await heapMb(cdp)
    const data = await snapshot(page)
    const interactions = new Map()
    for (const entry of data.events.filter(({ interactionId }) => interactionId > 0)) {
      const kept = interactions.get(entry.interactionId)
      if (!kept || entry.duration > kept.duration) interactions.set(entry.interactionId, entry)
    }
    const list = [...interactions.values()].sort((a, b) => a.at - b.at)
    const first = list[0]
    const scrolling = list.filter(({ at }) => at >= scrollStart)
    // Time a card was on screen before its chart appeared; charts drawn ahead of time count as 0.
    const blank = Object.entries(data.visibleAt).filter(([, at]) => at >= scrollStart).map(([id, at]) => Math.max(0, (data.drawnAt[id] ?? Infinity) - at)).sort((a, b) => a - b)
    const firstVisible = Object.entries(data.visibleAt).filter(([, at]) => at >= scrollStart).sort((a, b) => a[1] - b[1])[0]
    return {
      kind: 'input', strategy, condition: condition.id,
      firstBlankMs: firstVisible ? Math.max(0, (data.drawnAt[firstVisible[0]] ?? Infinity) - firstVisible[1]) : null,
      medianBlankMs: median(blank), maxBlankMs: blank.length ? blank.at(-1) : null, blankCharts: blank.length,
      firstInputProcessingStartMs: first?.processingStart ?? null, firstInputDelayMs: first ? first.processingStart - first.at : null, firstInputDurationMs: first?.duration ?? null,
      scrollInteractions: scrolling.length, scrollInpMs: scrolling.length ? Math.max(...scrolling.map(({ duration }) => duration)) : null,
      scrollMedianMs: median(scrolling.map(({ duration }) => duration)),
      drawnCharts: data.drawnCharts, heapAfterLoadMb: heapAfterLoad, heapAfterScrollMb: heapAfterScroll,
    }
  } finally {
    await context.close()
  }
}

function aggregate(samples) {
  const groups = new Map()
  for (const sample of samples) {
    const key = `${sample.condition}|${sample.strategy}`
    groups.set(key, [...(groups.get(key) ?? []), sample])
  }
  const range = (values) => ({ median: round1(median(values)), min: round1(Math.min(...values)), max: round1(Math.max(...values)) })
  return [...groups].map(([key, group]) => {
    const [condition, strategy] = key.split('|')
    const paint = group.filter(({ kind }) => kind === 'paint')
    const input = group.filter(({ kind }) => kind === 'input')
    const nonNull = (list, field) => list.map((row) => row[field]).filter((value) => value !== null)
    return {
      condition, strategy, paintLoads: paint.length, inputLoads: input.length,
      lcpMs: range(nonNull(paint, 'lcpMs')), fcpMs: range(nonNull(paint, 'fcpMs')),
      longTaskCount: range(paint.map((row) => row.longTaskCount)), blockingMs: range(paint.map((row) => row.blockingMs)),
      drawnAtLoad: range(paint.map((row) => row.drawnCharts)), heapAfterLoadMb: range(paint.map((row) => row.heapMb)),
      scriptKbBeforeLcp: range(paint.map((row) => row.scriptBytesBeforeLcp / 1024)),
      firstInputProcessingStartMs: range(nonNull(input, 'firstInputProcessingStartMs')), firstInputDelayMs: range(nonNull(input, 'firstInputDelayMs')),
      scrollInpMs: range(nonNull(input, 'scrollInpMs')), firstBlankMs: range(nonNull(input, 'firstBlankMs')), maxBlankMs: range(nonNull(input, 'maxBlankMs')), scrollMedianMs: range(nonNull(input, 'scrollMedianMs')),
      drawnAfterScroll: range(input.map((row) => row.drawnCharts)), heapAfterScrollMb: range(input.map((row) => row.heapAfterScrollMb)),
    }
  })
}

await build({ configFile: 'vite.config.ts', logLevel: 'warn', build: { outDir: 'test-results/chart-dist', emptyOutDir: true, manifest: true } })
const manifest = JSON.parse(await readFile('test-results/chart-dist/.vite/manifest.json', 'utf8'))
async function gzipBytes(file) { return gzipSync(await readFile(join('test-results/chart-dist', file))).length }
const bundles = {}
for (const strategy of strategies) {
  const entry = manifest[`experiments/chart-loading/${strategy}/index.html`]
  const initial = new Set()
  const visit = (key) => {
    const chunk = manifest[key]
    if (!chunk || initial.has(chunk.file)) return
    initial.add(chunk.file)
    for (const dependency of chunk.imports ?? []) visit(dependency)
  }
  visit(`experiments/chart-loading/${strategy}/index.html`)
  const dynamic = (entry.dynamicImports ?? []).map((key) => manifest[key].file)
  bundles[strategy] = {
    initialJs: await Promise.all([...initial].filter((file) => file.endsWith('.js')).map(async (file) => ({ file, gzipBytes: await gzipBytes(file) }))),
    deferredJs: await Promise.all(dynamic.map(async (file) => ({ file, gzipBytes: await gzipBytes(file) }))),
  }
}

const server = await preview({ logLevel: 'warn', build: { outDir: 'test-results/chart-dist' }, preview: { host: '127.0.0.1', port: 0, strictPort: true } })
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
try {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const samples = []
    for (const condition of conditions) {
      for (let round = 1; round <= condition.repeats; round++) {
        const rotated = [...strategies.slice(round - 1), ...strategies.slice(0, round - 1)]
        for (const strategy of rotated) {
          samples.push({ round, ...(await paintLoad(browser, origin, strategy, condition)) })
          samples.push({ round, ...(await inputLoad(browser, origin, strategy, condition)) })
        }
        console.log(`${condition.id} round ${round}/${condition.repeats} done`)
      }
    }
    await mkdir('test-results', { recursive: true })
    await writeFile(outFile, JSON.stringify({
      environment: {
        platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model, cores: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30),
        node: process.version, chrome: browser.version(), viewport: '1280x900',
        chartjs: JSON.parse(await readFile('node_modules/chart.js/package.json', 'utf8')).version, react: JSON.parse(await readFile('node_modules/react/package.json', 'utf8')).version,
      },
      protocol: { charts: chartCount, scrollSteps, conditions: conditions.map(({ id, cpuRate, network, repeats }) => ({ id, cpuRate, network, repeats })), settleMs: 3_000 },
      bundles, samples, aggregate: aggregate(samples),
    }, null, 2))
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
}
