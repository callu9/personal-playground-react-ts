import type { Snapshot } from './contract'
import type { Subscribe, Subscription } from './transports'

export function subscribePolling(subscription: Subscription, intervalFor: (snapshot: Snapshot) => number) {
  const { url, update, connection } = subscription
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let failures = 0

  async function poll() {
    const sentAt = performance.now()
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(6_000)])
      const response = await fetch(`${url}/snapshot`, { signal, cache: 'no-store' })
      if (controller.signal.aborted) return
      if (response.status === 404) {
        connection('Unavailable')
        return
      }
      if (!response.ok) throw new Error(`Snapshot returned ${response.status}`)
      const snapshot: Snapshot = await response.json()
      if (controller.signal.aborted) return
      failures = 0
      connection('Live')
      update(snapshot)
      if (controller.signal.aborted) return
      // Hold the target start-to-start interval to the extent allowed by a single in-flight request.
      timer = setTimeout(poll, Math.max(0, intervalFor(snapshot) - (performance.now() - sentAt)))
    } catch {
      if (controller.signal.aborted) return
      failures++
      connection('Retrying')
      timer = setTimeout(poll, 500 * 2 ** Math.min(failures - 1, 4))
    }
  }

  void poll()
  return () => {
    clearTimeout(timer)
    controller.abort()
  }
}

export const subscribeFixed: Subscribe = (subscription) => subscribePolling(subscription, () => subscription.interval)
