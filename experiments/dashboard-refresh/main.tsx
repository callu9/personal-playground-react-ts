import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ExperimentPage, ExperimentSection, ExperimentWorkbench } from '../shared/ExperimentPage'
import {
  apiPath, dashboardPath, methodLabels, pollingIntervals, runPath, scenarioLabels,
  type Connection, type Method, type PollInterval, type Run, type Scenario, type Snapshot,
} from './contract'
import { transports } from './transports'
import { RefreshConclusion, RefreshOptions, Results, RunSettingsHelp } from './Results'
import styles from './dashboard.module.css'

function initialSettings() {
  const query = new URLSearchParams(window.location.search)
  const method = query.get('method')
  const scenario = query.get('scenario')
  return {
    method: method && Object.hasOwn(methodLabels, method) ? method as Method : 'fixed' as const,
    scenario: scenario && Object.hasOwn(scenarioLabels, scenario) ? scenario as Scenario : 'normal' as const,
    interval: pollingIntervals.find((value) => value === Number(query.get('interval'))) ?? 3_000,
    run: query.get('run'),
  }
}

function monitorUrl(run: string, method: Method, interval: PollInterval, scenario: Scenario) {
  const query = new URLSearchParams({ run, method, interval: String(interval), scenario })
  return `${dashboardPath}?${query}`
}

function RunMonitor({ run, method, interval }: { run: string; method: Method; interval: PollInterval }) {
  const [connection, setConnection] = useState<Connection>('Connecting')
  const [history, setHistory] = useState<Snapshot[]>([])
  const latest = history.at(-1)

  useEffect(() => {
    let stop = () => {}
    let last: Snapshot | undefined
    let closed = false

    function onVisibilityChange() {
      stop()
      if (closed || last?.status === 'Completed') return
      if (document.visibilityState === 'hidden') {
        setConnection('Paused')
        return
      }
      setConnection('Connecting')
      stop = transports[method]({
        url: runPath(run),
        interval,
        lastVersion: last?.version ?? -1,
        lastStatus: last?.status,
        update(snapshot) {
          if (closed || snapshot.version <= (last?.version ?? -1)) return
          last = snapshot
          setHistory((previous) => [...previous, snapshot])
          if (snapshot.status === 'Completed') {
            stop()
            setConnection('Complete')
          } else {
            setConnection('Live')
          }
        },
        connection(state) {
          if (!closed && last?.status !== 'Completed') setConnection(state)
        },
      })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    onVisibilityChange()
    return () => {
      closed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [run, method, interval])

  return (
    <>
      <div className={styles.summary} aria-label="Current result">
        <div><span>Job status</span><strong data-testid="job-status" aria-live="polite">{latest?.status ?? 'Waiting'}</strong></div>
        <div><span>Progress</span><strong data-testid="job-progress">{latest ? `${latest.progress}%` : '—'}</strong></div>
        <div><span>Connection</span><strong data-testid="connection" aria-live="polite">{connection}</strong></div>
        <div><span>Updates observed</span><strong>{history.filter(({ version }) => version > 0).length}</strong></div>
      </div>
      <section className={styles.history}>
        <h3>Observed updates</h3>
        {history.length === 0 && <p>Waiting for the first result.</p>}
        <ol aria-label="Observed updates">
          {history.slice().reverse().map(({ version, status, progress, recordedAt }) => (
            <li key={version} data-version={version} data-recorded-at={recordedAt}>
              <span>Version {version}</span>
              <strong>{status}</strong>
              <span>{progress}%</span>
              <time dateTime={new Date(recordedAt).toISOString()}>{new Date(recordedAt).toLocaleTimeString()}</time>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function Dashboard() {
  const [initial] = useState(initialSettings)
  const [method, setMethod] = useState<Method>(initial.method)
  const [scenario, setScenario] = useState<Scenario>(initial.scenario)
  const [interval, setInterval] = useState<PollInterval>(initial.interval)
  const [run, setRun] = useState(initial.run ? { id: initial.run, scenario: initial.scenario } : null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(false)
  const joinUrl = run ? monitorUrl(run.id, method, interval, run.scenario) : null
  const monitorKey = run ? `${run.id}:${method}:${method === 'fixed' ? interval : ''}` : ''

  useEffect(() => {
    if (joinUrl) window.history.replaceState(null, '', joinUrl)
  }, [joinUrl])

  async function start() {
    setStarting(true)
    setError(false)
    try {
      const response = await fetch(`${apiPath}/runs?scenario=${scenario}`, { method: 'POST' })
      if (!response.ok) throw new Error(`Start failed with status ${response.status}`)
      const next: Run = await response.json()
      setRun({ id: next.id, scenario })
    } catch {
      setError(true)
    } finally {
      setStarting(false)
    }
  }

  return (
    <ExperimentPage
      experiment="dashboard-refresh"
      summary={{
        problem: '최신 상태를 드물게 조회하면 완료 표시가 늦고, 두 요청 사이에 여러 번 바뀐 중간 상태를 건너뜁니다. 조회 주기를 줄이면 작업이 대기 중일 때도 요청이 늘어납니다.',
        finding: <>정상 시나리오에서 고정 주기를 1초에서 3초로 늘리자 평균 요청은 <strong>14.0 → 5.7건/작업</strong>, 완료 반영 p95는 <strong>524 → 2,105 ms</strong>, 놓친 갱신은 <strong>2/18 → 8/18</strong>이었습니다. SSE는 전체 반영 p95 <strong>75 ms</strong>로 3회에서 총 18개 갱신을 모두 받았습니다.</>,
        decision: '최신 상태나 완료만 필요하면 허용 지연과 요청 예산에 맞춰 고정 폴링을 고릅니다. 대기가 길고 진행 중 빠른 반영이 필요하면 적응형 폴링, 모든 버전이 필요하고 장기 연결을 운영할 수 있으면 SSE를 검토합니다.',
      }}
    >
      <ExperimentSection id="options">
        <RefreshOptions />
      </ExperimentSection>
      <ExperimentSection id="playground" description="방식과 서버 조건을 선택해 실제 가상 작업을 시작합니다. 진행 중인 작업은 다른 탭에서 같은 주소로 열 수 있습니다.">
        <ExperimentWorkbench>
          <section className={styles.controls} aria-label="Run settings" lang="en">
            <label>Update method
              <select aria-describedby="update-method-help" value={method} onChange={(event) => setMethod(event.target.value as Method)}>
                {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {method === 'fixed' && <label>Polling interval
              <select value={interval} onChange={(event) => setInterval(Number(event.target.value) as PollInterval)}>
                {pollingIntervals.map((value) => <option key={value} value={value}>{value / 1_000} s</option>)}
              </select>
            </label>}
            <label>Next run scenario
              <select aria-describedby="run-scenario-help" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>
                {Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" disabled={starting} onClick={start}>{starting ? 'Starting…' : 'Start run'}</button>
          </section>
          <RunSettingsHelp />
          {error && <p role="alert" lang="en">The run could not start. Try again.</p>}
          {run && joinUrl ? (
            <div lang="en">
              <div className={styles.runInfo}><span>Run {run.id.slice(0, 8)} · {scenarioLabels[run.scenario]}</span><a href={joinUrl} target="_blank" rel="noreferrer">Open this run in another tab</a></div>
              <RunMonitor key={monitorKey} run={run.id} method={method} interval={interval} />
            </div>
          ) : <p className={styles.empty} lang="en">Choose a method and start a run to see the job status and update history.</p>}
        </ExperimentWorkbench>
      </ExperimentSection>
      <ExperimentSection id="conclusion">
        <RefreshConclusion scenario={scenario} />
      </ExperimentSection>
      <ExperimentSection id="verification">
        <Results scenario={scenario} method={method} interval={interval} />
      </ExperimentSection>
    </ExperimentPage>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing dashboard mount')
createRoot(root).render(<Dashboard />)
