import { methodLabels, type Method, type PollInterval, type Scenario, type Snapshot } from './contract.ts'

export const candidates = [
  { id: 'fixed-1s', method: 'fixed', interval: 1_000, label: 'Fixed polling · 1 s' },
  { id: 'fixed-3s', method: 'fixed', interval: 3_000, label: 'Fixed polling · 3 s' },
  { id: 'fixed-5s', method: 'fixed', interval: 5_000, label: 'Fixed polling · 5 s' },
  { id: 'adaptive', method: 'adaptive', interval: null, label: methodLabels.adaptive },
  { id: 'sse', method: 'sse', interval: null, label: methodLabels.sse },
] as const satisfies readonly { id: string; method: Method; interval: PollInterval | null; label: string }[]

export interface BenchmarkSample {
  candidate: string
  scenario: string
  tabs: number
  windowMs: number
  snapshotRequests: number
  streamRequests: number
  bodyBytes: number
  observations: {
    updates: { phase: Snapshot['phase']; delayMs: number | null }[]
    behindMs: number
    recoveryMs: number | null
    firstSnapshotMs: number
  }[]
}

function p95(values: number[]): number | null {
  return values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? null
}

export function summarize(samples: BenchmarkSample[], scenario: Scenario, tabs = 1) {
  return candidates.flatMap((candidate) => {
    const runs = samples.filter((sample) => sample.tabs === tabs && sample.scenario === scenario && sample.candidate === candidate.id)
    if (!runs.length) return []
    const observations = runs.flatMap((run) => run.observations)
    const updates = observations.flatMap((tab) => tab.updates)
    const delivered = updates.flatMap(({ delayMs }) => delayMs === null ? [] : [delayMs])
    const tabMinutes = runs.reduce((total, run) => total + run.windowMs * run.tabs, 0) / 60_000
    return [{
      candidate,
      repeats: runs.length,
      steadyP95: p95(updates.flatMap(({ phase, delayMs }) => phase === 'steady' && delayMs !== null ? [delayMs] : [])),
      burstP95: p95(updates.flatMap(({ phase, delayMs }) => phase === 'burst' && delayMs !== null ? [delayMs] : [])),
      missed: updates.length - delivered.length,
      versions: updates.length,
      behindPct: observations.reduce((total, tab) => total + tab.behindMs, 0) / (tabMinutes * 60_000) * 100,
      requests: runs.reduce((total, run) => total + run.snapshotRequests + run.streamRequests, 0) / tabMinutes,
      bodyBytes: runs.reduce((total, run) => total + run.bodyBytes, 0) / tabMinutes,
      recoveryP95: p95(observations.flatMap(({ recoveryMs }) => recoveryMs === null ? [] : [recoveryMs])),
      recovered: observations.filter(({ recoveryMs }) => recoveryMs !== null).length,
      firstSnapshotP95: p95(observations.map(({ firstSnapshotMs }) => firstSnapshotMs)),
    }]
  })
}
