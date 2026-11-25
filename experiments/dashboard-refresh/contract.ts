import type { DashboardData } from '../brand-theme/shared/fixture.ts'

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
export type Connection = 'Connecting' | 'Live' | 'Retrying' | 'Paused' | 'Unavailable'

export interface Snapshot {
  version: number
  recordedAt: number
  phase: 'steady' | 'burst'
  data: DashboardData
}

export interface Feed {
  id: string
  scenario: Scenario
  startedAt: number
}

export function feedPath(id: string) {
  return `${apiPath}/feeds/${encodeURIComponent(id)}`
}
