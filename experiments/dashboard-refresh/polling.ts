import type { JobStatus, Snapshot } from './contract'
import type { Subscribe, Subscription } from './transports'

export function subscribePolling(subscription: Subscription, intervalFor: (status: JobStatus | undefined) => number) {
  const { url, update, connection } = subscription
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let status = subscription.lastStatus
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
      status = snapshot.status
      connection('Live')
      update(snapshot)
      if (status === 'Completed' || controller.signal.aborted) return
      // Hold the target start-to-start interval to the extent allowed by a single in-flight request.
      timer = setTimeout(poll, Math.max(0, intervalFor(status) - (performance.now() - sentAt)))
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
