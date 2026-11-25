import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { classes, ThemeProvider } from '../brand-theme/css-modules/theme'
import { Dashboard as OperationsDashboard } from '../brand-theme/shared/dashboard'
import { ExperimentPage, ExperimentSection, ExperimentWorkbench } from '../shared/ExperimentPage'
import {
  apiPath, dashboardPath, feedPath, methodLabels, pollingIntervals, scenarioLabels,
  type Connection, type Feed, type Method, type PollInterval, type Scenario, type Snapshot,
} from './contract'
import { transports } from './transports'
import { RefreshConclusion, RefreshOptions, Results, RefreshSummary } from './Results'
import styles from './dashboard.module.css'

function initialSettings() {
  const query = new URLSearchParams(window.location.search)
  const method = query.get('method')
  const scenario = query.get('scenario')
  return {
    method: method && Object.hasOwn(methodLabels, method) ? method as Method : 'fixed' as const,
    scenario: scenario && Object.hasOwn(scenarioLabels, scenario) ? scenario as Scenario : 'normal' as const,
    interval: pollingIntervals.find((value) => value === Number(query.get('interval'))) ?? 3_000,
    feed: query.get('feed'),
  }
}

function feedUrl(id: string, method: Method, interval: PollInterval, scenario: Scenario) {
  const query = new URLSearchParams({ feed: id, method, interval: String(interval), scenario })
  return `${dashboardPath}?${query}`
}

function Monitor({ id, method, interval }: { id: string; method: Method; interval: PollInterval }) {
  const [connection, setConnection] = useState<Connection>('Connecting')
  const [latest, setLatest] = useState<Snapshot | null>(null)
  const lastVersion = useRef(-1)

  useEffect(() => {
    let stop = () => {}
    let closed = false

    function syncVisibility() {
      stop()
      if (document.visibilityState === 'hidden') {
        setConnection('Paused')
        return
      }
      setConnection('Connecting')
      stop = transports[method]({
        url: feedPath(id),
        interval,
        lastVersion: lastVersion.current,
        update(snapshot) {
          if (closed || snapshot.version <= lastVersion.current) return
          lastVersion.current = snapshot.version
          setLatest(snapshot)
        },
        connection(state) {
          if (!closed) setConnection(state)
        },
      })
    }

    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
    return () => {
      closed = true
      document.removeEventListener('visibilitychange', syncVisibility)
      stop()
    }
  }, [id, method, interval])

  return (
    <section aria-label="Live dashboard" lang="en">
      <div className={styles.connectionStrip}>
        <span className={styles.connection} data-testid="connection" role="status">{connection}</span>
      </div>
      {latest ? <OperationsDashboard c={classes} Scope={ThemeProvider} data={latest.data} live={latest} /> :
        <p className={styles.empty}>{connection === 'Unavailable' ? 'Feed unavailable. Restart the feed to reconnect.' : 'Waiting for the first server snapshot.'}</p>}
    </section>
  )
}

function Dashboard() {
  const [initial] = useState(initialSettings)
  const [method, setMethod] = useState<Method>(initial.method)
  const [scenario, setScenario] = useState<Scenario>(initial.scenario)
  const [interval, setInterval] = useState<PollInterval>(initial.interval)
  const [feed, setFeed] = useState(initial.feed)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const shareUrl = feed ? feedUrl(feed, method, interval, scenario) : null

  useEffect(() => {
    if (shareUrl) window.history.replaceState(null, '', shareUrl + window.location.hash)
  }, [shareUrl])

  useEffect(() => {
    if (feed) return
    const controller = new AbortController()
    setError(false)
    async function connect() {
      try {
        const response = await fetch(`${apiPath}/feeds?scenario=${scenario}`, { method: 'POST', signal: controller.signal })
        if (!response.ok) throw new Error(`Feed returned ${response.status}`)
        const next: Feed = await response.json()
        if (!controller.signal.aborted) setFeed(next.id)
      } catch {
        if (!controller.signal.aborted) setError(true)
      }
    }
    void connect()
    return () => controller.abort()
  }, [feed, scenario, attempt])

  function restart() {
    setFeed(null)
    setAttempt((value) => value + 1)
  }

  return (
    <ExperimentPage experiment="dashboard-refresh" summary={RefreshSummary}>
      <ExperimentSection id="options"><RefreshOptions /></ExperimentSection>
      <ExperimentSection id="playground" description="브랜드 테마 실험의 Operations overview를 사용합니다. 조회 방식만 바꿔 같은 카드, 차트, 최근 결과 표에 서버 값이 반영되는 차이를 확인합니다.">
        <ExperimentWorkbench>
          <section className={styles.controls} aria-label="Live dashboard settings" lang="en">
            <label>Update method
              <select aria-describedby="update-method-help" value={method} onChange={(event) => setMethod(event.target.value as Method)}>
                {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {method === 'fixed' && <label>Polling interval
              <select value={interval} onChange={(event) => setInterval(Number(event.target.value) as PollInterval)}>
                {pollingIntervals.map((value) => <option key={value} value={value}>{value / 1_000} seconds</option>)}
              </select>
            </label>}
            <label>Delivery scenario
              <select aria-describedby="delivery-scenario-help" value={scenario} onChange={(event) => {
                setScenario(event.target.value as Scenario)
                setFeed(null)
              }}>
                {Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" onClick={restart}>Restart feed</button>
          </section>
          <div className={styles.controlHelp}>
            <p id="update-method-help">조회 방식은 현재 데이터 피드에서 바로 바뀝니다.</p>
            <p id="delivery-scenario-help">서버 조건을 바꾸면 같은 갱신 일정으로 새 피드를 시작합니다.</p>
          </div>
          {shareUrl && <p className={styles.feedLink}><a href={shareUrl + '#playground'} target="_blank" rel="noreferrer" lang="en">Open this feed in another tab</a></p>}
          {feed ? <Monitor key={feed} id={feed} method={method} interval={method === 'fixed' ? interval : 1_000} /> :
            <p className={styles.empty} role={error ? 'alert' : 'status'}>{error ? '피드를 열지 못했습니다. Restart feed로 다시 시도할 수 있습니다.' : '데이터 피드에 연결 중입니다.'}</p>}
        </ExperimentWorkbench>
      </ExperimentSection>
      <ExperimentSection id="conclusion"><RefreshConclusion scenario={scenario} /></ExperimentSection>
      <ExperimentSection id="verification"><Results scenario={scenario} method={method} interval={interval} /></ExperimentSection>
    </ExperimentPage>
  )
}

createRoot(document.getElementById('root')!).render(<Dashboard />)
