import { subscribePolling } from './polling'
import type { Subscribe } from './transports'

const idleInterval = 4_000
const runningInterval = 1_000

export const subscribeAdaptive: Subscribe = (subscription) =>
  subscribePolling(subscription, (status) => status === 'Running' ? runningInterval : idleInterval)
