export const apiPath = '/api/job-status'
export const experimentPath = '/experiments/job-status/'

export const methodLabels = {
  fixed: 'Fixed polling',
  adaptive: 'Adaptive polling',
  sse: 'Server-sent events',
} as const

export const scenarioLabels = {
  normal: 'Normal delivery',
  slow: 'Slow delivery',
  outage: 'Temporary outage',
  limited: 'Request limit',
} as const

export const retryPolicyLabels = {
  honor: 'Honor Retry-After',
  ignore: 'Backoff only',
} as const

export const pollingIntervals = [1_000, 3_000, 5_000] as const
// The limit key stands in for one user's quota on the status endpoint: every tab watching the job shares it.
export const requestLimit = { requests: 8, windowMs: 10_000 } as const
export const cancelSettleMs = 800

export type Method = keyof typeof methodLabels
export type Scenario = keyof typeof scenarioLabels
export type RetryPolicy = keyof typeof retryPolicyLabels
export type PollInterval = (typeof pollingIntervals)[number]
export type JobStatus = 'Queued' | 'Running' | 'Cancelling' | 'Cancelled' | 'Completed'
export type Connection = 'Connecting' | 'Live' | 'Retrying' | 'Rate limited' | 'Paused' | 'Complete' | 'Unavailable'

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

export const isTerminal = (status: JobStatus | undefined) => status === 'Completed' || status === 'Cancelled'

export function runPath(id: string) {
  return `${apiPath}/runs/${encodeURIComponent(id)}`
}
