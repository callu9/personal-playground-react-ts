import { subscribePolling } from './polling'
import type { Subscribe } from './transports'

const quietInterval = 4_000
const activeInterval = 1_000
const activeForMs = 3_000

export const subscribeAdaptive: Subscribe = (subscription) => {
  let lastVersion = subscription.lastVersion
  let activeUntil = 0
  return subscribePolling(subscription, ({ version }) => {
    const now = performance.now()
    if (lastVersion >= 0 && version > lastVersion) activeUntil = now + activeForMs
    lastVersion = version
    return now < activeUntil ? activeInterval : quietInterval
  })
}
