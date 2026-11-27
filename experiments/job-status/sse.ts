import { isTerminal, type Snapshot } from './contract'
import type { Subscribe } from './transports'

const maxFailures = 10

export const subscribeSse: Subscribe = ({ url, lastVersion, connection, update }) => {
  let source: EventSource | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let version = lastVersion
  let failures = 0

  function open() {
    const stream = new EventSource(`${url}/events?after=${version}`)
    source = stream
    stream.addEventListener('ready', () => {
      failures = 0
      connection('Live')
    })
    stream.onmessage = (event) => {
      const snapshot: Snapshot = JSON.parse(event.data)
      version = snapshot.version
      update(snapshot)
      if (isTerminal(snapshot.status)) stream.close()
    }
    stream.onerror = () => {
      if (stream.readyState !== EventSource.CLOSED) return connection('Retrying')
      // A non-200 answer (404, 429) closes EventSource for good, and scripts cannot read its status or Retry-After.
      if (++failures >= maxFailures) return connection('Unavailable')
      connection('Retrying')
      timer = setTimeout(open, 500 * 2 ** Math.min(failures - 1, 4))
    }
  }

  open()
  return () => {
    clearTimeout(timer)
    source?.close()
  }
}
