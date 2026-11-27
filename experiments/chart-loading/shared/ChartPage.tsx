import { createRoot } from 'react-dom/client'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Strategy } from '../contract'
import { chartCount } from '../contract'
import { makeSpecs, type ChartSpec } from './data'
import styles from './chart-page.module.css'

export type Runtime = typeof import('./chart-runtime')
interface Loading {
  strategy: Strategy
  load(): Promise<Runtime>
  runtime?: Runtime
}

const ChartCard = memo(function ChartCard({ spec, loading }: { spec: ChartSpec; loading: Loading }) {
  const card = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let chart: { destroy(): void } | undefined
    let cancelled = false
    const draw = (runtime: Runtime) => {
      if (cancelled || !canvas.current) return
      chart = runtime.draw(canvas.current, spec)
      canvas.current.dataset.drawn = 'true'
    }
    if (loading.strategy === 'eager') draw(loading.runtime!)
    else if (loading.strategy === 'split') void loading.load().then(draw)
    else {
      const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        void loading.load().then(draw)
      }, { rootMargin: '200px' })
      observer.observe(card.current!)
      return () => { cancelled = true; observer.disconnect(); chart?.destroy() }
    }
    return () => { cancelled = true; chart?.destroy() }
  }, [spec, loading])
  return (
    <section ref={card} className={styles.card} aria-labelledby={`chart-${spec.id}`}>
      <h2 id={`chart-${spec.id}`}>{spec.title}</h2>
      <div className={styles.plot}><canvas ref={canvas} role="img" aria-label={spec.title} /></div>
    </section>
  )
})

function PingButton() {
  const [count, setCount] = useState(0)
  return <button type="button" data-testid="ping" className={styles.ping} onClick={() => setCount((value) => value + 1)}>Ping <span data-testid="ping-count">{count}</span></button>
}

const kpis = [['Requests', '18.4M'], ['p95 latency', '212 ms'], ['Error rate', '0.18%'], ['Saturation', '63%'], ['Open incidents', '2'], ['Deploys today', '14']] as const
const services = Array.from({ length: 24 }, (_, index) => [`service-${String(index + 1).padStart(2, '0')}`, `team-${(index % 6) + 1}`, ['ap-northeast-2', 'us-east-1', 'eu-west-1'][index % 3], `${120 + ((index * 37) % 180)} ms`, `${(((index * 7) % 30) / 100).toFixed(2)}%`])

function ChartPage({ loading }: { loading: Loading }) {
  const specs = useMemo(() => makeSpecs(chartCount), [])
  useEffect(() => {
    if (loading.strategy !== 'idle') return
    // Preload the chart chunk once the page is quiet; drawing still waits for the viewport.
    const preload = () => void loading.load()
    const idle = () => { if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(preload, { timeout: 2_000 }); else setTimeout(preload, 200) }
    if (document.readyState === 'complete') idle()
    else window.addEventListener('load', idle, { once: true })
  }, [loading])
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Operations charts</h1>
          <p>Latency traces and daily volumes for twelve services. Each card draws one chart.</p>
        </div>
        <PingButton />
      </header>
      <section className={styles.overview} aria-labelledby="overview-title">
        <h2 id="overview-title">Overview</h2>
        <ul className={styles.kpis}>
          {kpis.map(([label, value]) => <li key={label}><span>{label}</span><strong>{value}</strong></li>)}
        </ul>
        <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Service</th><th scope="col">Owner</th><th scope="col">Region</th><th scope="col">p95 latency</th><th scope="col">Error rate</th></tr></thead>
          <tbody>{services.map((service) => <tr key={service[0]}>{service.map((value, index) => index === 0 ? <th scope="row" key={index}>{value}</th> : <td key={index}>{value}</td>)}</tr>)}</tbody>
        </table>
        </div>
      </section>
      <div className={styles.grid}>{specs.map((spec) => <ChartCard key={spec.id} spec={spec} loading={loading} />)}</div>
    </main>
  )
}

export function mountChartPage(loading: Loading) {
  createRoot(document.getElementById('root')!).render(<ChartPage loading={loading} />)
}
