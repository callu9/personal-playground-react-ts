import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { build, preview } from 'vite'
import { approachLabels, placementLabels, rowCounts } from '../experiments/state-subscription/contract.ts'

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const loads = Number(arg('loads', 3))
const profileLoads = Number(arg('profile-loads', 2))
const only = arg('only', 'inp,profile').split(',')
const rowsFilter = arg('rows', rowCounts.join(',')).split(',').map(Number)
const outFile = arg('out', 'test-results/state-subscription.json')
const clicks = 8
const settleMs = 500
const unitCodes = (rows) => Array.from({ length: clicks }, (_, index) => String(100_000 + index % Math.min(rows, 7)))

const variants = Object.keys(approachLabels).flatMap((approach) => Object.keys(placementLabels).map((placement) => ({ approach, placement })))
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : null
}

async function serve(outDir, profiling) {
  await build({
    configFile: 'vite.config.ts', logLevel: 'warn', build: { outDir, emptyOutDir: true, manifest: false },
    ...(profiling ? { resolve: { alias: { 'react-dom/client': 'react-dom/profiling' } } } : {}),
  })
  const server = await preview({ logLevel: 'warn', build: { outDir }, preview: { host: '127.0.0.1', port: 0, strictPort: true } })
  return { server, origin: `http://127.0.0.1:${server.httpServer.address().port}` }
}

async function load(browser, origin, { approach, placement, rows }, interaction, cpuRate) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      window.eventEntries = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.eventEntries.push({ name: entry.name, startTime: entry.startTime, processingStart: entry.processingStart, processingEnd: entry.processingEnd, duration: entry.duration, interactionId: entry.interactionId })
        }
      }).observe({ type: 'event', durationThreshold: 16, buffered: true })
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
    await page.goto(`${origin}/experiments/state-subscription/?approach=${approach}&placement=${placement}&rows=${rows}`)
    await page.getByTestId('unit-toggle').waitFor()
    await delay(800)
    const targets = interaction === 'unit' ? Array(clicks).fill('unit-toggle') : unitCodes(rows).map((code) => `select-${code}`)
    const perClick = []
    for (const target of targets) {
      const before = await page.evaluate(() => ({ at: performance.now(), renders: { ...window.stateRenders }, commits: window.stateCommits.length }))
      await page.getByTestId(target).click()
      await delay(settleMs)
      const after = await page.evaluate((from) => ({
        renders: { ...window.stateRenders },
        commits: window.stateCommits.slice(from),
      }), before.commits)
      perClick.push({ target, before, after })
    }
    const all = await page.evaluate(() => ({ events: window.eventEntries, inp: window.stateInp ?? null, hidden: document.visibilityState !== 'visible' }))
    if (all.hidden) throw new Error('Measurement page was hidden')
    // One interaction per click: the longest event of each interactionId carries the INP-style duration.
    const byInteraction = new Map()
    for (const entry of all.events.filter(({ interactionId }) => interactionId > 0)) {
      const kept = byInteraction.get(entry.interactionId)
      if (!kept || entry.duration > kept.duration) byInteraction.set(entry.interactionId, entry)
    }
    const interactions = [...byInteraction.values()].sort((a, b) => a.startTime - b.startTime).map((entry) => ({
      durationMs: entry.duration, inputDelayMs: entry.processingStart - entry.startTime,
      processingMs: entry.processingEnd - entry.processingStart,
      presentationMs: entry.startTime + entry.duration - entry.processingEnd,
    }))
    const diff = (a, b) => Object.fromEntries(Object.keys(b).map((key) => [key, b[key] - a[key]]))
    return {
      approach, placement, rows, interaction, cpuRate, inp: all.inp, observedInteractions: interactions,
      clicks: perClick.map(({ before, after }) => ({
        renders: diff(before.renders, after.renders), commits: after.commits.length,
        actualDurationMs: after.commits.reduce((sum, commit) => sum + commit.actualDuration, 0),
        renderToCommitMs: after.commits.length ? Math.max(...after.commits.map((commit) => commit.commitTime - commit.startTime)) : null,
      })),
    }
  } finally {
    await context.close()
  }
}

function aggregate(samples) {
  const groups = new Map()
  for (const sample of samples) {
    const key = [sample.kind, sample.approach, sample.placement, sample.rows, sample.interaction, sample.cpuRate].join('|')
    groups.set(key, [...(groups.get(key) ?? []), sample])
  }
  return [...groups.values()].map((group) => {
    const [{ kind, approach, placement, rows, interaction, cpuRate }] = group
    const base = { kind, approach, placement, rows, interaction, cpuRate, loads: group.length }
    if (kind === 'profile') {
      const clickRows = group.flatMap(({ clicks }) => clicks)
      const counters = Object.keys(clickRows[0].renders)
      return {
        ...base,
        renders: Object.fromEntries(counters.map((name) => [name, median(clickRows.map((click) => click.renders[name]))])),
        renderedComponents: median(clickRows.map((click) => Object.values(click.renders).reduce((sum, value) => sum + value, 0))),
        commits: median(clickRows.map((click) => click.commits)),
        actualDurationMs: median(clickRows.map((click) => click.actualDurationMs)),
        renderToCommitMs: median(clickRows.flatMap((click) => click.renderToCommitMs === null ? [] : [click.renderToCommitMs])),
      }
    }
    const events = group.flatMap(({ observedInteractions }) => observedInteractions)
    const inps = group.map(({ inp }) => inp?.value ?? null)
    const seen = inps.filter((value) => value !== null)
    return {
      ...base, clicks: group.length * clicks, belowThreshold: group.length * clicks - events.length,
      inpMs: median(seen), inpMinMs: seen.length ? Math.min(...seen) : null, inpMaxMs: seen.length ? Math.max(...seen) : null,
      inpLoadsMeasured: seen.length,
      inputDelayMs: median(group.flatMap(({ inp }) => inp ? [inp.inputDelay] : [])),
      processingMs: median(group.flatMap(({ inp }) => inp ? [inp.processing] : [])),
      presentationMs: median(group.flatMap(({ inp }) => inp ? [inp.presentation] : [])),
      clickDurationMs: median(events.map((event) => event.durationMs)),
    }
  })
}

const samples = []
const plain = await serve('test-results/state-dist', false)
const profiled = await serve('test-results/state-profile-dist', true)
try {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const conditions = (rowsList) => rowsList.flatMap((rows) => ['unit', 'select'].flatMap((interaction) => variants.map((variant) => ({ ...variant, rows, interaction }))))
    if (only.includes('inp')) {
      const matrix = [
        ...conditions(rowsFilter).map((condition) => ({ ...condition, cpuRate: 4 })),
        ...conditions(rowsFilter.filter((rows) => rows === 1_000)).map((condition) => ({ ...condition, cpuRate: 1 })),
      ]
      for (let round = 1; round <= loads; round++) {
        const rotated = [...matrix.slice(round - 1), ...matrix.slice(0, round - 1)]
        for (const condition of rotated) {
          samples.push({ kind: 'inp', round, ...(await load(browser, plain.origin, condition, condition.interaction, condition.cpuRate)) })
        }
        console.log(`inp round ${round}/${loads} done, ${samples.length} loads`)
      }
    }
    if (only.includes('profile')) {
      const matrix = conditions(rowsFilter).map((condition) => ({ ...condition, cpuRate: 4 }))
      for (let round = 1; round <= profileLoads; round++) {
        const rotated = [...matrix.slice(round - 1), ...matrix.slice(0, round - 1)]
        for (const condition of rotated) {
          samples.push({ kind: 'profile', round, ...(await load(browser, profiled.origin, condition, condition.interaction, condition.cpuRate)) })
        }
        console.log(`profile round ${round}/${profileLoads} done, ${samples.length} loads`)
      }
    }
    const versions = Object.fromEntries(await Promise.all(['react', 'zustand', 'vite', 'web-vitals'].map(async (name) => [name, JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version])))
    await mkdir('test-results', { recursive: true })
    await writeFile(outFile, JSON.stringify({
      environment: {
        platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model, cores: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30),
        node: process.version, chrome: browser.version(), viewport: '1280x900', ...versions,
      },
      protocol: { clicksPerLoad: clicks, settleMs, loads, profileLoads, cpuRates: [4, 1], inp: 'web-vitals/attribution, reportAllChanges, 16 ms threshold', profiling: 'react-dom/profiling alias build' },
      samples, aggregate: aggregate(samples),
    }, null, 2))
  } finally {
    await browser.close()
  }
} finally {
  await Promise.all([plain, profiled].map(({ server }) => new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))))
}
