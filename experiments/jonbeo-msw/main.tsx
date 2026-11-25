import { useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { labPath, portfolioPath, responseDelayMs, workerScope, type Portfolio, type RequestPath, type Variant } from './contract'
import { mark, metrics } from './metrics'
import styles from './lab.module.css'

const params = new URLSearchParams(location.search)
const inWorkerScope = location.pathname.startsWith(workerScope)
const mode: RequestPath = inWorkerScope ? (params.get('mode') === 'mock' ? 'mock' : 'passthrough') : 'off'
const variant: Variant = params.get('variant') === 'gated' ? 'gated' : 'shell'
const labels = { off: 'MSW off', passthrough: 'MSW passthrough', mock: 'MSW mock' }
const number = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function Controls() {
  const [path, setPath] = useState(mode)
  return (
    <form className={styles.controls} action={path === 'off' ? labPath : workerScope}>
      <label>Request path
        <select name="mode" value={path} onChange={(event) => setPath(event.target.value as RequestPath)}>
          {Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      </label>
      <label>Initial rendering
        <select name="variant" defaultValue={variant}>
          <option value="gated">Wait for worker</option>
          <option value="shell">Render shell first</option>
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>
  )
}

function Holdings({ portfolio }: { portfolio: Portfolio | null }) {
  const [sorted, setSorted] = useState(false)
  useLayoutEffect(() => mark('shell'), [])
  useLayoutEffect(() => {
    if (portfolio) mark('data')
  }, [portfolio])

  const records = portfolio?.holdings ?? []
  const rows = sorted ? [...records].sort((a, b) => a.name.localeCompare(b.name)) : records
  return (
    <section className={styles.panel} aria-labelledby="holdings-title">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="holdings-title">Holdings</h2>
          <p role="status">{portfolio ? rows.length + ' positions' : 'Loading portfolio…'}</p>
        </div>
        <button aria-pressed={sorted} onClick={() => setSorted(!sorted)}>
          Sort by name
        </button>
      </header>
      {portfolio && (
        <div className={styles.tableScroll}>
          <table>
            <thead><tr><th scope="col">Symbol</th><th scope="col">Name</th><th scope="col">Shares</th><th scope="col">Price</th></tr></thead>
            <tbody>
              {rows.map(({ code, name, shares, price }) => (
                <tr key={code}><th scope="row">{code}</th><td>{name}</td><td>{shares}</td><td>{number.format(price)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function App() {
  const [workerReady, setWorkerReady] = useState(mode === 'off')
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const request = new AbortController()

    async function load() {
      try {
        if (mode !== 'off') {
          mark('workerStart')
          const { startWorker } = await import('./worker-client')
          await startWorker(mode)
        }
        mark('workerReady')
        if (request.signal.aborted) return
        setWorkerReady(true)

        mark('request')
        const response = await fetch(portfolioPath, { signal: request.signal })
        mark('headers')
        if (!response.ok) throw new Error('The portfolio request returned ' + response.status + '.')
        const body = await response.text()
        mark('body')
        metrics.body = body
        metrics.source = response.headers.get('X-Jonbeo-Source')
        setPortfolio(JSON.parse(body) as Portfolio)
      } catch (cause) {
        if (request.signal.aborted) return
        const message = cause instanceof Error ? cause.message : String(cause)
        metrics.error = message
        setError(message)
      }
    }
    void load()
    return () => request.abort()
  }, [])

  return (
    <main className={styles.main}>
      <a className={styles.back} href="/">← React playground</a>
      <header className={styles.title}>
        <h1>Jonbeo MSW performance lab</h1>
        <p>Compare three request paths with the same portfolio and {responseDelayMs} ms configured response delay.</p>
      </header>
      <Controls />
      <p className={styles.condition}>{labels[mode]} · {variant === 'gated' ? 'Wait for worker' : 'Render shell first'}</p>
      {error && <p role="alert">{error}</p>}
      {(variant === 'shell' || workerReady) ? <Holdings portfolio={portfolio} /> : <p role="status">Starting the worker…</p>}
    </main>
  )
}

mark('boot')
createRoot(document.getElementById('root')!).render(<App />)
