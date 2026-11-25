import type { Snapshot } from './contract'
import type { Subscribe } from './transports'

export const subscribeSse: Subscribe = ({ url, lastVersion, connection, update }) => {
  const source = new EventSource(`${url}/events?after=${lastVersion}`)
  source.addEventListener('ready', () => connection('Live'))
  source.onmessage = (event) => {
    const snapshot: Snapshot = JSON.parse(event.data)
    update(snapshot)
    if (snapshot.status === 'Completed') source.close()
  }
  source.onerror = () => connection(source.readyState === EventSource.CLOSED ? 'Unavailable' : 'Retrying')
  return () => source.close()
}
