import { writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const categories = [
  'blink.user_timing', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'toplevel', 'loading', 'v8',
]

export async function startTrace(session) {
  await session.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: { recordMode: 'recordUntilFull', includedCategories: categories },
  })
}

export async function stopTrace(session, file) {
  const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve))
  await session.send('Tracing.end')
  const { stream, dataLossOccurred } = await complete
  if (dataLossOccurred || !stream) throw new Error('Chrome trace is incomplete')
  const chunks = []
  try {
    for (;;) {
      const { data, base64Encoded, eof } = await session.send('IO.read', { handle: stream })
      chunks.push(Buffer.from(data, base64Encoded ? 'base64' : 'utf8'))
      if (eof) break
    }
  } finally {
    await session.send('IO.close', { handle: stream })
  }
  const json = Buffer.concat(chunks)
  await writeFile(file, gzipSync(json, { level: 5 }))
  return JSON.parse(json.toString('utf8')).traceEvents
}

function overlap(events, start, end) {
  const clipped = events.filter((event) => event.ts < end && event.ts + event.dur > start)
  const ranges = clipped.map(({ ts, dur }) => [Math.max(ts, start), Math.min(ts + dur, end)])
    .sort(([x], [y]) => x - y)
  let busy = 0
  let seen = start
  for (const [from, to] of ranges) {
    busy += Math.max(0, to - Math.max(seen, from))
    seen = Math.max(seen, to)
  }
  return {
    busyMs: busy / 1000,
    longestTaskMs: Math.max(0, ...clipped.map(({ dur }) => dur / 1000)),
    events: clipped.filter(({ dur }) => dur >= 10_000).map(({ name, ts, dur }) => (
      { name, fromStartMs: (ts - start) / 1000, durationMs: dur / 1000 }
    )),
  }
}

export function summarizeTrace(events, prefix, boundaries, highlights) {
  const first = events.find(({ name, cat }) => name === prefix + boundaries[0] && cat.includes('blink.user_timing'))
  if (!first) throw new Error('Trace missing initial mark: ' + prefix + boundaries[0])
  const main = events.filter(({ pid, tid }) => pid === first.pid && tid === first.tid)
  const marks = {}
  for (const event of main) {
    if (!event.name.startsWith(prefix) || !event.cat.includes('blink.user_timing')) continue
    const key = event.name.slice(prefix.length)
    marks[key] ??= event.ts
  }
  const intervals = {}
  const activityNames = new Set(['EvaluateScript', 'FunctionCall', 'RunMicrotasks', 'TimerFire', 'FireAnimationFrame',
    'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Commit', 'EventDispatch'])
  const activities = main.filter(({ name, ph }) => ph === 'X' && activityNames.has(name))
  const tasks = main.filter(({ name, ph }) => ph === 'X' && (name === 'RunTask' || name === 'ThreadControllerImpl::RunTask'))
  if (!tasks.length) throw new Error('No top-level renderer tasks in trace')
  for (let index = 1; index < boundaries.length; index++) {
    const from = boundaries[index - 1]
    const to = boundaries[index]
    const start = marks[from]
    const end = marks[to]
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new Error('Missing or out-of-order trace marks: ' + from + ' → ' + to)
    }
    intervals[from + 'To' + to[0].toUpperCase() + to.slice(1)] = {
      elapsedMs: (end - start) / 1000,
      ...overlap(tasks, start, end),
      mainActivities: activities.filter(({ ts, dur }) => ts < end && ts + dur > start)
        .map(({ name, ts, dur, args }) => ({
          name, overlapMs: (Math.min(end, ts + dur) - Math.max(start, ts)) / 1000,
          script: args?.data?.url || args?.data?.scriptName,
        }))
        .filter(({ overlapMs }) => overlapMs >= 3).sort((a, b) => b.overlapMs - a.overlapMs).slice(0, 12),
    }
  }
  const last = marks[boundaries.at(-1)]
  const nextPaint = main.filter(({ name, ts }) => name === 'Paint' && ts >= last)
    .sort((a, b) => a.ts - b.ts)[0]
  const urlById = new Map()
  const resources = []
  for (const event of main.filter(({ name }) => name.startsWith('Resource')).sort((a, b) => a.ts - b.ts)) {
    const { requestId, url, fromServiceWorker } = event.args?.data ?? {}
    if (url && highlights.some((pattern) => pattern.test(url))) urlById.set(requestId, url)
    if (urlById.has(requestId) && !['ResourceReceivedData', 'ResourceChangePriority'].includes(event.name)) {
      resources.push({ name: event.name, url: urlById.get(requestId), fromFirstMarkMs: (event.ts - first.ts) / 1000,
        fromServiceWorker: fromServiceWorker ?? null })
    }
  }
  return {
    main: { pid: first.pid, tid: first.tid, taskCount: tasks.length },
    marksFromFirstMs: Object.fromEntries(Object.entries(marks).map(([mark, ts]) => [mark, (ts - first.ts) / 1000])),
    intervals,
    mainPaintAfterLastMarkMs: nextPaint ? (nextPaint.ts - last) / 1000 : null,
    resources,
  }
}
