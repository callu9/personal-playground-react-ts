import type { Snapshot } from './contract'
import type { Subscribe } from './transports'

export const subscribeSse: Subscribe = ({ url, connection, update }) => {
  const source = new EventSource(`${url}/events`)
  source.addEventListener('ready', () => connection('Live'))
  source.onmessage = (event) => update(JSON.parse(event.data) as Snapshot)
  source.onerror = () => connection(source.readyState === EventSource.CLOSED ? 'Unavailable' : 'Retrying')
  return () => source.close()
}
