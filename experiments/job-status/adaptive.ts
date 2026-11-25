import { subscribePolling } from './polling'
import type { Subscribe } from './transports'

const queuedInterval = 4_000
const activeInterval = 1_000

export const subscribeAdaptive: Subscribe = (subscription) =>
  subscribePolling(subscription, (status) => status === 'Queued' || status === undefined ? queuedInterval : activeInterval)
