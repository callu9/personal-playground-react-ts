import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ExperimentPage, ExperimentSection, ExperimentWorkbench } from '../shared/ExperimentPage'
import {
  apiPath, experimentPath, isTerminal, methodLabels, pollingIntervals, retryPolicyLabels, runPath, scenarioLabels,
  type Connection, type Method, type PollInterval, type RetryPolicy, type Run, type Scenario, type Snapshot,
} from './contract'
import { transports } from './transports'
import { JobStatusConclusion, JobStatusOptions, Results, RunSettingsHelp } from './Results'
import styles from './job-status.module.css'

function initialSettings() {
  const query = new URLSearchParams(window.location.search)
  const method = query.get('method')
  const scenario = query.get('scenario')
  const retry = query.get('retry')
  return {
    method: method && Object.hasOwn(methodLabels, method) ? method as Method : 'fixed' as const,
    scenario: scenario && Object.hasOwn(scenarioLabels, scenario) ? scenario as Scenario : 'normal' as const,
    retryPolicy: retry && Object.hasOwn(retryPolicyLabels, retry) ? retry as RetryPolicy : 'honor' as const,
    interval: pollingIntervals.find((value) => value === Number(query.get('interval'))) ?? 3_000,
    run: query.get('run'),
  }
}

function monitorUrl(run: string, method: Method, interval: PollInterval, scenario: Scenario, retry: RetryPolicy) {
  const query = new URLSearchParams({ run, method, interval: String(interval), scenario, retry })
  return `${experimentPath}?${query}`
}

function RunMonitor({ run, method, interval, retryPolicy }: { run: string; method: Method; interval: PollInterval; retryPolicy: RetryPolicy }) {
  const [connection, setConnection] = useState<Connection>('Connecting')
  const [history, setHistory] = useState<Snapshot[]>([])
  const [rateLimited, setRateLimited] = useState(0)
  const [cancelState, setCancelState] = useState<'idle' | 'sending' | 'requested' | 'failed'>('idle')
  const latest = history.at(-1)
  const canCancel = cancelState === 'idle' && !isTerminal(latest?.status) && latest?.status !== 'Cancelling'

  useEffect(() => {
    let stop = () => {}
    let last: Snapshot | undefined
    let closed = false

    function onVisibilityChange() {
      stop()
      if (closed || isTerminal(last?.status)) return
      if (document.visibilityState === 'hidden') {
        setConnection('Paused')
        return
      }
      setConnection('Connecting')
      stop = transports[method]({
        url: runPath(run),
        interval,
        retryPolicy,
        lastVersion: last?.version ?? -1,
        lastStatus: last?.status,
        update(snapshot) {
          if (closed || snapshot.version <= (last?.version ?? -1)) return
          last = snapshot
          setHistory((previous) => [...previous, snapshot])
          if (isTerminal(snapshot.status)) {
            stop()
            setConnection('Complete')
          } else {
            setConnection('Live')
          }
        },
        connection(state) {
          if (!closed && !isTerminal(last?.status)) setConnection(state)
        },
        rateLimited() {
          if (!closed) setRateLimited((count) => count + 1)
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
  }, [run, method, interval, retryPolicy])

  async function cancel() {
    setCancelState('sending')
    try {
      const response = await fetch(`${runPath(run)}/cancel`, { method: 'POST' })
      setCancelState(response.ok ? 'requested' : 'failed')
    } catch {
      setCancelState('failed')
    }
  }

  return (
    <>
      <div className={styles.summary} aria-label="Current result">
        <div><span>Job status</span><strong data-testid="job-status" aria-live="polite">{latest?.status ?? 'Waiting'}</strong></div>
        <div><span>Progress</span><strong data-testid="job-progress">{latest ? `${latest.progress}%` : '—'}</strong></div>
        <div><span>Connection</span><strong data-testid="connection" aria-live="polite">{connection}</strong></div>
        <div><span>Updates observed</span><strong>{history.filter(({ version }) => version > 0).length}</strong></div>
        <div><span>429 responses</span><strong data-testid="rate-limited">{rateLimited}</strong></div>
      </div>
      <div className={styles.cancel}>
        <button type="button" data-testid="cancel" disabled={!canCancel} onClick={cancel}>Cancel job</button>
        {cancelState === 'sending' && <span role="status">Sending the cancel request…</span>}
        {cancelState === 'requested' && !isTerminal(latest?.status) && <span role="status">Cancel requested. Waiting for the server to report it.</span>}
        {cancelState === 'failed' && <span role="alert">The cancel request failed.</span>}
      </div>
      <section className={styles.history}>
        <h3>Observed updates</h3>
        {history.length === 0 && <p>Waiting for the first result.</p>}
        <ol aria-label="Observed updates">
          {history.slice().reverse().map(({ version, status, progress, recordedAt }) => (
            <li key={version} data-version={version} data-status={status} data-recorded-at={recordedAt}>
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

function JobStatusLab() {
  const [initial] = useState(initialSettings)
  const [method, setMethod] = useState<Method>(initial.method)
  const [scenario, setScenario] = useState<Scenario>(initial.scenario)
  const [interval, setInterval] = useState<PollInterval>(initial.interval)
  const [retryPolicy, setRetryPolicy] = useState<RetryPolicy>(initial.retryPolicy)
  const [run, setRun] = useState(initial.run ? { id: initial.run, scenario: initial.scenario } : null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(false)
  const joinUrl = run ? monitorUrl(run.id, method, interval, run.scenario, retryPolicy) : null
  const monitorKey = run ? `${run.id}:${method}:${method === 'fixed' ? interval : ''}:${method === 'sse' ? '' : retryPolicy}` : ''

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
      experiment="job-status"
      summary={{
        problem: '오래 걸리는 작업의 상태를 폴링으로 보여 줄 때, 서버가 요청 수를 제한하거나 사용자가 작업을 취소하면 화면이 얼마나 늦게 따라오고, 같은 작업을 여러 탭에서 열면 요청이 얼마나 늘어날까?',
        finding: <>취소 후 <span lang="en">Cancelled</span> 표시까지 중앙값은 SSE <strong>862 ms</strong>, 고정 3초 <strong>2,522 ms</strong>였습니다. 같은 작업을 5개 탭에서 3초 폴링하면 요청 31건 중 <strong>10건이 429</strong>였고 완료 반영 p95가 <strong>6,297 ms</strong>로 늘었습니다.</>,
        decision: '완료·취소 표시가 3초 안팎 늦어도 되고 탭 수 ÷ 조회 간격이 요청 한도 안이면 폴링으로 충분합니다. 취소를 1초 안에 보여 주거나 탭이 한도를 넘거나 중간 상태를 놓치면 안 되면 SSE를 검토합니다.',
      }}
    >
      <ExperimentSection id="options">
        <JobStatusOptions />
      </ExperimentSection>
      <ExperimentSection id="playground" description="방식과 서버 조건을 선택해 실제 가상 작업을 시작합니다. 진행 중인 작업은 다른 탭에서 같은 주소로 열 수 있고, Cancel job으로 취소할 수 있습니다.">
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
            {method !== 'sse' && <label>429 handling
              <select value={retryPolicy} onChange={(event) => setRetryPolicy(event.target.value as RetryPolicy)}>
                {Object.entries(retryPolicyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
              <RunMonitor key={monitorKey} run={run.id} method={method} interval={interval} retryPolicy={retryPolicy} />
            </div>
          ) : <p className={styles.empty} lang="en">Choose a method and start a run to see the job status, cancel it and read the update history.</p>}
        </ExperimentWorkbench>
      </ExperimentSection>
      <ExperimentSection id="conclusion">
        <JobStatusConclusion />
      </ExperimentSection>
      <ExperimentSection id="verification">
        <Results scenario={scenario} method={method} interval={interval} />
      </ExperimentSection>
    </ExperimentPage>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing job status mount')
createRoot(root).render(<JobStatusLab />)
