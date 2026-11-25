import { memo, useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { labPath, portfolioPath, responseDelayMs, workerScope, type Portfolio, type RequestPath, type Variant } from './contract'
import { mark, metrics } from './metrics'
import { coldResults, originalResults } from './recorded'
import styles from './lab.module.css'

const params = new URLSearchParams(location.search)
const inWorkerScope = location.pathname.startsWith(workerScope)
const mode: RequestPath = inWorkerScope ? (params.get('mode') === 'mock' ? 'mock' : 'passthrough') : 'off'
const variant: Variant = params.get('variant') === 'gated' ? 'gated' : 'shell'
const labels = { off: 'MSW off', passthrough: 'MSW passthrough', mock: 'MSW mock' }
const renderingLabels = { gated: 'Wait for worker', shell: 'Render shell first' }
const paths = ['off', 'passthrough', 'mock'] as const
const number = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const metricNumber = new Intl.NumberFormat('en-US')
const reportUrl = 'https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe0fc0b6725abda9089028f1ce52634b9d1/docs/experiments/jonbeo-msw/results.md'

function Controls() {
  const [path, setPath] = useState(mode)
  return (
    <form className={styles.controls} action={path === 'off' ? labPath : workerScope}>
      <label>Request path
        <select name="mode" value={path} aria-describedby="request-path-description" onChange={(event) => setPath(event.target.value as RequestPath)}>
          {paths.map((key) => <option value={key} key={key}>{labels[key]}</option>)}
        </select>
      </label>
      <label>Initial rendering
        <select name="variant" defaultValue={variant} aria-describedby="rendering-description">
          <option value="gated">{renderingLabels.gated}</option>
          <option value="shell">{renderingLabels.shell}</option>
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>
  )
}

const ComparisonAxes = memo(function ComparisonAxes() {
  return (
    <dl className={styles.axes} lang="ko">
      <div>
        <dt lang="en">Request path</dt>
        <dd id="request-path-description">
          <span lang="en">MSW off</span>는 로컬 API로 직접 요청합니다. <span lang="en">MSW passthrough</span>는 워커를 거쳐 같은 API로 요청하고,
          {' '}<span lang="en">MSW mock</span>은 MSW 핸들러가 응답합니다. 세 경로의 응답 본문은 동일한 7종목이고 지연 설정은 {responseDelayMs} ms입니다.
        </dd>
      </div>
      <div>
        <dt lang="en">Initial rendering</dt>
        <dd id="rendering-description">
          <span lang="en">Wait for worker</span>는 워커가 준비되면 보유 종목 영역과 정렬 버튼을 그립니다. <span lang="en">Render shell first</span>는
          {' '}빈 보유 종목 영역과 버튼을 먼저 그립니다. MSW를 켠 두 구현 모두 데이터 요청은 워커가 준비된 뒤 시작합니다.
          {' '}<span lang="en">MSW off</span>에서는 두 설정 모두 워커 대기 없이 시작합니다.
        </dd>
      </div>
    </dl>
  )
})

function MetricChange({ label, values, unit = ' ms' }: {
  label: string
  values: readonly [number, number]
  unit?: string
}) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>
        <span><span className={styles.srOnly}>변경 전 </span><span>{metricNumber.format(values[0])}{unit}</span></span>
        <span aria-hidden="true" className={styles.arrow}>→</span>
        <span><span className={styles.srOnly}>변경 후 </span><span>{metricNumber.format(values[1])}{unit}</span></span>
      </dd>
    </div>
  )
}

const RecordedResults = memo(function RecordedResults() {
  return (
    <div className={styles.results} lang="ko">
      <section aria-labelledby="cold-results-title">
        <header className={styles.resultsHeader}>
          <h2 id="cold-results-title">플레이그라운드 첫 방문 결과</h2>
          <p>기록된 초회 측정의 조건별 7회 중앙값입니다. 버튼 준비와 데이터 DOM 반영은 탐색 시작 기준이며, INP는 데이터가 표시된 뒤 정렬 버튼을 8회 눌러 측정했습니다.</p>
          <p className={styles.comparisonKey}>
            <span>변경 전 · <span lang="en">{renderingLabels.gated}</span></span>
            <span aria-hidden="true">→</span>
            <span>변경 후 · <span lang="en">{renderingLabels.shell}</span></span>
          </p>
        </header>

        <div className={styles.resultGrid}>
          {paths.map((path) => {
            const { button, headers, data, inp, repeatedData } = coldResults[path]
            return (
              <article className={styles.resultCard} key={path}>
                <h3 lang="en">{labels[path]}</h3>
                <dl>
                  <MetricChange label="정렬 버튼 준비" values={button} />
                  <MetricChange label="요청 → 응답 헤더" values={headers} />
                  <MetricChange label="데이터 DOM 반영" values={data} />
                  <MetricChange label="로딩 후 INP" values={inp} />
                  <MetricChange label="재측정 데이터 DOM 반영" values={repeatedData} />
                </dl>
              </article>
            )
          })}
        </div>

        <div className={styles.finding}>
          <h3>어떤 설정이 어느 구간에 영향을 줬나요?</h3>
          <p><strong>요청 경로.</strong> <span lang="en">Render shell first</span>로 고정했을 때 헤더까지 직접 API {coldResults.off.headers[1]} ms, 요청 통과 {coldResults.passthrough.headers[1]} ms, 모의 응답 {coldResults.mock.headers[1]} ms가 걸렸습니다. 응답을 만드는 타이머, 워커 메시지 전달, 브라우저 스케줄링, 로컬 API를 이용하는 경로의 네트워크 시간을 포함한 수치입니다.</p>
          <p><strong>초기 렌더링.</strong> 버튼은 요청 통과에서 <strong>201.5 ms</strong>, 모의 응답에서 <strong>171.2 ms</strong> 먼저 준비됐습니다. 두 경로의 로딩 후 INP 중앙값은 모두 40 ms였습니다.</p>
          <p>
            초회에는 두 워커 경로의 데이터 표시가 늦어졌습니다. 같은 조건의 재측정에서는 그 방향이 반복되지 않았습니다. Chrome trace에서는 요청 전 초기 스크립트 작업과
            {' '}MSW 모듈 로드 시간이 실행마다 달랐습니다. 재측정에서 응답 본문 수신 후 DOM 반영까지는 두 구현 모두 약 11~12 ms였습니다.
          </p>
        </div>
      </section>

      <section className={styles.sourceResults} aria-labelledby="source-results-title">
        <header className={styles.resultsHeader}>
          <h2 id="source-results-title">원본 Jonbeo 개발 서버 결과</h2>
          <p>원본 Next.js 개발 서버에서 커밋별 7회 측정했습니다. INP는 포트폴리오가 표시된 뒤 통화 버튼을 8회 눌러 측정했습니다.</p>
          <p className={styles.comparisonKey}>
            <span>변경 전 · <code>d68ac41</code> 게이트 적용</span>
            <span aria-hidden="true">→</span>
            <span>변경 후 · <code>76f9ac6</code> 게이트 제거</span>
          </p>
        </header>
        <dl className={styles.sourceMetrics}>
          <MetricChange label="포트폴리오 제목 첫 DOM 등장" values={originalResults.titleSeconds} unit="초" />
          <MetricChange label="통화 전환 INP" values={originalResults.inpMs} />
        </dl>
        <p>
          변경 전에는 워커 등록 호출부터 모의 응답 활성화까지 <strong>약 {Math.round(originalResults.registerToEnabledMs)} ms</strong>가 걸렸습니다.
          {' '}탐색부터 등록 호출까지는 {originalResults.navigationToRegisterSeconds}초였습니다. 화면 전체를 가리던 게이트는 그 사이의 개발 번들 로드와 실행 시간까지 사용자가 기다리게 했습니다.
        </p>
        <p>
          통화 전환에서 가장 오래 걸린 구간은 클릭 이벤트 처리였습니다. 중앙값은 {originalResults.eventProcessingMs[0]} → {originalResults.eventProcessingMs[1]} ms입니다.
          {' '}이 결과는 로컬 개발 서버에서 측정했으며 운영 환경은 별도 검증이 필요합니다.
        </p>
      </section>
    </div>
  )
})

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

  useLayoutEffect(() => mark('appCommit'), [])

  useEffect(() => {
    mark('effect')
    const request = new AbortController()

    async function load() {
      try {
        if (mode !== 'off') {
          mark('workerStart')
          const { startWorker } = await import('./worker-client')
          mark('workerModuleReady')
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
        const parsed = JSON.parse(body) as Portfolio
        mark('stateUpdate')
        setPortfolio(parsed)
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
        <p lang="ko">요청이 어느 경로를 지나는지와 보유 종목 UI를 언제 그리는지 바꿔 보고, 정렬 버튼을 쓸 수 있는 시점과 데이터가 표시되는 시점을 비교합니다.</p>
        <div className={styles.resultLinks} lang="ko">
          <a className={styles.back} href="#cold-results-title">측정 결과 바로 보기</a>
          <a className={styles.back} href={reportUrl}>자세한 측정 보고서</a>
        </div>
      </header>
      <Controls />
      <p className={styles.condition} lang="ko">현재 실행 조건 · <span lang="en">{labels[mode]} · {renderingLabels[variant]}</span></p>
      <ComparisonAxes />
      {error && <p role="alert">{error}</p>}
      {(variant === 'shell' || workerReady) ? <Holdings portfolio={portfolio} /> : <p role="status">Starting the worker…</p>}
      <RecordedResults />
    </main>
  )
}

mark('boot')
createRoot(document.getElementById('root')!).render(<App />)
