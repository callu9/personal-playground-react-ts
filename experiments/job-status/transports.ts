import type { Connection, JobStatus, Method, PollInterval, RetryPolicy, Snapshot } from './contract'
import { subscribeAdaptive } from './adaptive'
import { subscribeFixed } from './polling'
import { subscribeSse } from './sse'

export interface Subscription {
  url: string
  interval: PollInterval
  retryPolicy: RetryPolicy
  lastVersion: number
  lastStatus: JobStatus | undefined
  update(snapshot: Snapshot): void
  connection(state: Connection): void
  rateLimited(): void
}

export type Subscribe = (options: Subscription) => () => void

export const transports: Record<Method, Subscribe> = {
  fixed: subscribeFixed,
  adaptive: subscribeAdaptive,
  sse: subscribeSse,
}
