import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { apiPath, scenarioLabels, type Feed, type Scenario } from './contract.ts'
import { normalDelayMs, outageEndMs, outageStartMs, slowDelayMs, snapshotAt, snapshotFor, versionAt } from './fixture.ts'

const idleLifetimeMs = 15 * 60_000
const feedLimit = 256

interface Metrics {
  snapshotRequests: number
  streamRequests: number
  unavailableRequests: number
  bodyBytes: number
  activeSnapshots: number
  maxActiveSnapshots: number
  activeStreams: number
  maxActiveStreams: number
}

interface MockFeed extends Feed {
  pace: number
  lastAccess: number
  metrics: Metrics
}

function createFeed(scenario: Scenario, pace: number): MockFeed {
  const startedAt = Date.now()
  return {
    id: randomUUID(), scenario, startedAt, pace, lastAccess: startedAt,
    metrics: {
      snapshotRequests: 0, streamRequests: 0, unavailableRequests: 0, bodyBytes: 0,
      activeSnapshots: 0, maxActiveSnapshots: 0, activeStreams: 0, maxActiveStreams: 0,
    },
  }
}

function latencyFor(feed: MockFeed) {
  return feed.scenario === 'slow' ? slowDelayMs : normalDelayMs
}

function isUnavailable(feed: MockFeed, now = Date.now()) {
  const elapsed = (now - feed.startedAt) / feed.pace
  return feed.scenario === 'outage' && elapsed >= outageStartMs && elapsed < outageEndMs
}

function isExpired(feed: MockFeed, now: number) {
  return !feed.metrics.activeSnapshots && !feed.metrics.activeStreams && now - feed.lastAccess > idleLifetimeMs
}

function sendJson(response: ServerResponse, status: number, value: unknown, metrics?: Metrics) {
  const body = JSON.stringify(value)
  if (metrics) metrics.bodyBytes += Buffer.byteLength(body)
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(body)
}

function unavailable(response: ServerResponse, metrics: Metrics) {
  metrics.unavailableRequests++
  sendJson(response, 503, { error: 'Temporary outage' }, metrics)
}

function snapshot(feed: MockFeed, response: ServerResponse) {
  const metrics = feed.metrics
  metrics.snapshotRequests++
  const now = Date.now()
  if (isUnavailable(feed, now)) return unavailable(response, metrics)

  const latest = snapshotAt(feed.startedAt, now, feed.pace)
  metrics.activeSnapshots++
  metrics.maxActiveSnapshots = Math.max(metrics.maxActiveSnapshots, metrics.activeSnapshots)
  const timer = setTimeout(() => {
    if (isUnavailable(feed)) unavailable(response, metrics)
    else sendJson(response, 200, latest, metrics)
  }, latencyFor(feed))
  response.once('close', () => {
    clearTimeout(timer)
    metrics.activeSnapshots--
    feed.lastAccess = Date.now()
  })
}

function events(feed: MockFeed, response: ServerResponse) {
  const { metrics } = feed
  metrics.streamRequests++
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  function write(frame: string) {
    metrics.bodyBytes += Buffer.byteLength(frame)
    response.write(frame)
  }
  write('retry: 500\n\n')
  if (isUnavailable(feed)) {
    metrics.unavailableRequests++
    response.end()
    return
  }

  let cursor = -1
  const delay = latencyFor(feed)
  const readyAt = Date.now() + delay
  let nextHeartbeat = readyAt + 5_000

  function pump() {
    if (response.writableEnded || response.destroyed) return
    const now = Date.now()
    if (isUnavailable(feed, now)) {
      response.end()
      return
    }
    if (now < readyAt || response.writableNeedDrain) return
    if (cursor < 0) write('event: ready\ndata: {}\n\n')
    const version = versionAt(feed.startedAt, now - delay, feed.pace)
    if (version > cursor) {
      write(`id: ${version}\ndata: ${JSON.stringify(snapshotFor(feed.startedAt, version, feed.pace))}\n\n`)
      cursor = version
      nextHeartbeat = now + 5_000
    } else if (now >= nextHeartbeat) {
      write(': heartbeat\n\n')
      nextHeartbeat = now + 5_000
    }
  }

  metrics.activeStreams++
  metrics.maxActiveStreams = Math.max(metrics.maxActiveStreams, metrics.activeStreams)
  const timer = setInterval(pump, 25)
  response.once('close', () => {
    clearInterval(timer)
    metrics.activeStreams--
    feed.lastAccess = Date.now()
  })
}

function middleware(testMode: boolean) {
  const feeds = new Map<string, MockFeed>()
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(`${apiPath}/`)) return next()

    if (request.method === 'POST' && url.pathname === `${apiPath}/feeds`) {
      const scenario = url.searchParams.get('scenario') ?? 'normal'
      if (!Object.hasOwn(scenarioLabels, scenario)) return sendJson(response, 400, { error: 'Unknown scenario' })
      const now = Date.now()
      for (const [id, feed] of feeds) {
        if (isExpired(feed, now)) feeds.delete(id)
      }
      if (feeds.size >= feedLimit) return sendJson(response, 503, { error: 'Feed limit reached' })
      const pace = testMode && url.searchParams.get('pace') === 'fast' ? 0.2 : 1
      const feed = createFeed(scenario as Scenario, pace)
      feeds.set(feed.id, feed)
      return sendJson(response, 201, { id: feed.id, scenario: feed.scenario, startedAt: feed.startedAt } satisfies Feed)
    }

    const route = /^\/feeds\/([0-9a-f-]+)\/(snapshot|events|stats)$/.exec(url.pathname.slice(apiPath.length))
    const feed = route && feeds.get(route[1])
    const now = Date.now()
    if (request.method !== 'GET' || !feed || !route || isExpired(feed, now)) {
      return sendJson(response, 404, { error: 'Feed unavailable' })
    }
    feed.lastAccess = now
    switch (route[2]) {
      case 'snapshot': return snapshot(feed, response)
      case 'stats': return sendJson(response, 200, { ...feed.metrics, observedAt: now })
      case 'events': return events(feed, response)
    }
  }
}

export function dashboardRefresh(testMode = false): Plugin {
  return {
    name: 'dashboard-refresh-mock-api',
    configureServer(server) { server.middlewares.use(middleware(testMode)) },
    configurePreviewServer(server) { server.middlewares.use(middleware(false)) },
  }
}
