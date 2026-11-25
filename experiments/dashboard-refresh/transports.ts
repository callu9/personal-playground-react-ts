import type { Connection, Method, PollInterval, Snapshot } from './contract'
import { subscribeAdaptive } from './adaptive'
import { subscribeFixed } from './polling'
import { subscribeSse } from './sse'

export interface Subscription {
  url: string
  interval: PollInterval
  lastVersion: number
  update(snapshot: Snapshot): void
  connection(state: Connection): void
}

export type Subscribe = (options: Subscription) => () => void

export const transports: Record<Method, Subscribe> = {
  fixed: subscribeFixed,
  adaptive: subscribeAdaptive,
  sse: subscribeSse,
}
