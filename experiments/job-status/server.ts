import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { apiPath, cancelSettleMs, requestLimit, type JobStatus, type Run, type Snapshot } from './contract.ts'

const schedule = [
  [4_520, 15], [5_350, 35], [6_180, 48], [7_830, 64], [9_890, 88], [12_200, 100],
] as const
const quickSchedule = [[500, 15], [1_700, 48], [3_650, 88], [5_400, 100]] as const
const runLifetimeMs = 10 * 60_000
const runLimit = 256

interface Metrics {
  snapshotRequests: number
  streamRequests: number
  cancelRequests: number
  rejectedRequests: number
  earlyRetries: number
  unavailableRequests: number
  bodyBytes: number
  activeSnapshots: number
  maxActiveSnapshots: number
  activeStreams: number
  maxActiveStreams: number
}

type Scenario = 'normal' | 'slow' | 'outage' | 'limited' | 'quick'

interface MockRun extends Run {
  scenario: Scenario
  snapshots: Snapshot[]
  metrics: Metrics
  acceptedAt: number[]
  blockedUntil: number
  cancelRequestedAt?: number
}

function createRun(scenario: Scenario): MockRun {
  const createdAt = Date.now()
  const quick = scenario === 'quick'
  const startedAt = createdAt + (quick ? 750 : 2_000)
  const events: Snapshot[] = (quick ? quickSchedule : schedule).map(([at, progress], index) => ({
    version: index + 1,
    status: (progress === 100 ? 'Completed' : 'Running') satisfies JobStatus,
    progress,
    recordedAt: startedAt + at,
  }))
  return {
    id: randomUUID(), startedAt, endsAt: startedAt + (quick ? 7_000 : 17_500), scenario,
    snapshots: [{ version: 0, status: 'Queued', progress: 0, recordedAt: createdAt }, ...events],
    acceptedAt: [], blockedUntil: 0,
    metrics: {
      snapshotRequests: 0, streamRequests: 0, cancelRequests: 0, rejectedRequests: 0, earlyRetries: 0,
      unavailableRequests: 0, bodyBytes: 0, activeSnapshots: 0, maxActiveSnapshots: 0, activeStreams: 0, maxActiveStreams: 0,
    },
  }
}

function latencyFor(run: MockRun) {
  return run.scenario === 'slow' ? 1_350 : 40
}

function isUnavailable(run: MockRun, now = Date.now()) {
  const elapsed = now - run.startedAt
  return run.scenario === 'outage' && elapsed >= 5_800 && elapsed < 8_500
}

function sendJson(response: ServerResponse, status: number, value: unknown, metrics?: Metrics, headers: Record<string, string> = {}) {
  const body = JSON.stringify(value)
  if (metrics) metrics.bodyBytes += Buffer.byteLength(body)
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers })
  response.end(body)
}

function unavailable(response: ServerResponse, metrics: Metrics) {
  metrics.unavailableRequests++
  sendJson(response, 503, { error: 'Temporary outage' }, metrics)
}

// Sliding-window limit on accepted requests. A rejected request is not counted, so a client that
// ignores Retry-After keeps being rejected without extending the wait.
function rejectIfLimited(run: MockRun, response: ServerResponse) {
  if (run.scenario !== 'limited') return false
  const now = Date.now()
  if (now < run.blockedUntil) run.metrics.earlyRetries++
  run.acceptedAt = run.acceptedAt.filter((at) => now - at < requestLimit.windowMs)
  if (run.acceptedAt.length < requestLimit.requests) {
    run.acceptedAt.push(now)
    return false
  }
  const retryAfter = Math.max(1, Math.ceil((run.acceptedAt[0] + requestLimit.windowMs - now) / 1_000))
  run.blockedUntil = now + retryAfter * 1_000
  run.metrics.rejectedRequests++
  sendJson(response, 429, { error: 'Too many requests' }, run.metrics, { 'Retry-After': String(retryAfter) })
  return true
}

function availableSnapshots(run: MockRun, now: number) {
  return run.snapshots.filter(({ recordedAt }) => recordedAt <= now)
}

function snapshot(run: MockRun, response: ServerResponse) {
  const metrics = run.metrics
  metrics.snapshotRequests++
  if (isUnavailable(run)) return unavailable(response, metrics)
  if (rejectIfLimited(run, response)) return

  const now = Date.now()
  const latest = availableSnapshots(run, now).at(-1)
  metrics.activeSnapshots++
  metrics.maxActiveSnapshots = Math.max(metrics.maxActiveSnapshots, metrics.activeSnapshots)
  const timer = setTimeout(() => {
    if (isUnavailable(run)) unavailable(response, metrics)
    else sendJson(response, 200, latest, metrics)
  }, latencyFor(run))
  response.once('close', () => {
    clearTimeout(timer)
    metrics.activeSnapshots--
  })
}

// The job stops cooperatively: it reports Cancelling at once and Cancelled after cancelSettleMs.
function cancel(run: MockRun, response: ServerResponse) {
  const { metrics } = run
  metrics.cancelRequests++
  const now = Date.now()
  const kept = availableSnapshots(run, now)
  const last = kept.at(-1)!
  if (run.cancelRequestedAt === undefined) {
    if (last.status === 'Completed') return sendJson(response, 409, { error: 'Job already completed' }, metrics)
    run.cancelRequestedAt = now
    run.snapshots = [
      ...kept,
      { version: last.version + 1, status: 'Cancelling', progress: last.progress, recordedAt: now },
      { version: last.version + 2, status: 'Cancelled', progress: last.progress, recordedAt: now + cancelSettleMs },
    ]
  }
  setTimeout(() => sendJson(response, 202, { requestedAt: run.cancelRequestedAt }, metrics), latencyFor(run))
}

function events(run: MockRun, request: IncomingMessage, response: ServerResponse, query: URLSearchParams) {
  const { metrics } = run
  metrics.streamRequests++
  if (isUnavailable(run)) {
    // A valid stream that closes is reconnectable by native EventSource.
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' })
    metrics.unavailableRequests++
    metrics.bodyBytes += Buffer.byteLength('retry: 500\n\n')
    response.end('retry: 500\n\n')
    return
  }
  if (rejectIfLimited(run, response)) return
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

  const header = request.headers['last-event-id']
  const resumeFrom = Number(header ?? query.get('after') ?? -1)
  let cursor = Number.isInteger(resumeFrom) && resumeFrom >= 0 && resumeFrom < run.snapshots.length ? resumeFrom : -1
  let ready = false
  const delay = latencyFor(run)
  const readyAt = Date.now() + delay
  let nextHeartbeat = readyAt + 5_000

  function pump() {
    if (response.writableEnded || response.destroyed) return
    const now = Date.now()
    if (isUnavailable(run, now)) {
      response.end()
      return
    }
    if (now < readyAt) return
    if (!ready) {
      write('event: ready\ndata: {}\n\n')
      ready = true
    }

    const available = availableSnapshots(run, now - delay)
    const delivery = cursor < 0 ? available.slice(-1) : available.filter(({ version }) => version > cursor)
    for (const item of delivery) {
      write(`id: ${item.version}\ndata: ${JSON.stringify(item)}\n\n`)
      cursor = item.version
    }
    if (cursor === run.snapshots.length - 1) {
      response.end()
      return
    }
    if (now >= nextHeartbeat) {
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
  })
  pump()
}

function middleware(quickEnabled: boolean) {
  const runs = new Map<string, MockRun>()
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(`${apiPath}/`)) return next()

    if (request.method === 'POST' && url.pathname === `${apiPath}/runs`) {
      const scenario = url.searchParams.get('scenario') ?? 'normal'
      if (!['normal', 'slow', 'outage', 'limited'].includes(scenario) && !(scenario === 'quick' && quickEnabled)) {
        return sendJson(response, 400, { error: 'Unknown scenario' })
      }
      const now = Date.now()
      for (const [id, run] of runs) {
        if (now - run.endsAt > runLifetimeMs) runs.delete(id)
      }
      if (runs.size >= runLimit) return sendJson(response, 503, { error: 'Run limit reached' })
      const run = createRun(scenario as Scenario)
      runs.set(run.id, run)
      return sendJson(response, 201, { id: run.id, startedAt: run.startedAt, endsAt: run.endsAt } satisfies Run)
    }

    const route = /^\/runs\/([0-9a-f-]+)\/(snapshot|events|stats|cancel)$/.exec(url.pathname.slice(apiPath.length))
    const run = route && runs.get(route[1])
    if (!run || !route || Date.now() - run.endsAt > runLifetimeMs || request.method !== (route[2] === 'cancel' ? 'POST' : 'GET')) {
      return sendJson(response, 404, { error: 'Run unavailable' })
    }
    switch (route[2]) {
      case 'snapshot': return snapshot(run, response)
      case 'cancel': return cancel(run, response)
      case 'stats': return sendJson(response, 200, { ...run.metrics, expected: run.snapshots, cancelRequestedAt: run.cancelRequestedAt })
      case 'events': return events(run, request, response, url.searchParams)
    }
  }
}

export function jobStatus(quickEnabled = false): Plugin {
  return {
    name: 'job-status-mock-api',
    configureServer(server) { server.middlewares.use(middleware(quickEnabled)) },
    configurePreviewServer(server) { server.middlewares.use(middleware(false)) },
  }
}
