export const apiPath = '/api/dashboard-refresh'
export const dashboardPath = '/experiments/dashboard-refresh/'

export const methodLabels = {
  fixed: 'Fixed polling',
  adaptive: 'Adaptive polling',
  sse: 'Server-sent events',
} as const

export const scenarioLabels = {
  normal: 'Normal delivery',
  slow: 'Slow delivery',
  outage: 'Temporary outage',
} as const

export const pollingIntervals = [1_000, 3_000, 5_000] as const
export type Method = keyof typeof methodLabels
export type Scenario = keyof typeof scenarioLabels
export type PollInterval = (typeof pollingIntervals)[number]
export type JobStatus = 'Queued' | 'Running' | 'Completed'
export type Connection = 'Connecting' | 'Live' | 'Retrying' | 'Paused' | 'Complete' | 'Unavailable'

export interface Snapshot {
  version: number
  status: JobStatus
  progress: number
  recordedAt: number
}

export interface Run {
  id: string
  startedAt: number
  endsAt: number
}

export function runPath(id: string) {
  return `${apiPath}/runs/${encodeURIComponent(id)}`
}
