import { memo, useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ExperimentOptions, ExperimentPage, ExperimentSection, ExperimentTable, ExperimentWorkbench } from '../shared/ExperimentPage'
import { labPath, portfolioPath, responseDelayMs, workerScope, type Holding, type Portfolio, type RequestPath, type Variant } from './contract'
import { mark, metrics } from './metrics'
import { OriginalAnalysis } from './OriginalAnalysis'
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

function Controls() {
  const [path, setPath] = useState(mode)
  const action = (path === 'off' ? labPath : workerScope) + '#playground'
  return (
    <form className={styles.controls} action={action}>
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
    <div className={styles.axes}>
      <div>
        <h3 lang="en">Request path</h3>
        <p id="request-path-description">세 경로의 응답 본문은 동일한 7종목이며 지연 설정은 {responseDelayMs} ms입니다.</p>
        <ExperimentOptions items={[
          { label: <span lang="en">{labels.off}</span>, description: '로컬 API로 직접 요청합니다.' },
          { label: <span lang="en">{labels.passthrough}</span>, description: '워커를 거쳐 같은 로컬 API로 요청합니다.' },
          { label: <span lang="en">{labels.mock}</span>, description: 'MSW 핸들러가 동일한 응답 본문을 반환합니다.' },
        ]} />
      </div>
      <div>
        <h3 lang="en">Initial rendering</h3>
        <p id="rendering-description">MSW를 켠 두 구현 모두 데이터 요청은 워커가 준비된 뒤 시작합니다. <span lang="en">MSW off</span>에서는 두 구현 모두 워커 대기 없이 시작합니다.</p>
        <ExperimentOptions items={[
          { label: <span lang="en">{renderingLabels.gated}</span>, description: '워커가 준비되면 보유 종목 영역과 정렬 버튼을 그립니다.' },
          { label: <span lang="en">{renderingLabels.shell}</span>, description: '빈 보유 종목 영역과 정렬 버튼을 먼저 그립니다.' },
        ]} />
      </div>
    </div>
  )
})

function VisitChange({ values }: { values: readonly [number, number] }) {
  return (
    <td>
      <span className={styles.measurement}>
        <span className={styles.srOnly}>변경 전 </span>{metricNumber.format(values[0])}
        <span aria-hidden="true"> → </span><span className={styles.srOnly}> 변경 후 </span>{metricNumber.format(values[1])}
      </span>
    </td>
  )
}

const Findings = memo(function Findings() {
  return (
    <div className={styles.findings}>
      <div>
        <h3>플레이그라운드의 요청 경로와 초기 렌더링</h3>
        <p>
          <span lang="en">Render shell first</span>로 렌더링을 고정했을 때 요청부터 응답 헤더까지 직접 API는 {coldResults.off.headers[1]} ms,
          요청 통과는 {coldResults.passthrough.headers[1]} ms, 모의 응답은 {coldResults.mock.headers[1]} ms가 걸렸습니다.
          각 수치에는 해당 경로의 응답 타이머, 워커 메시지 전달, 브라우저 스케줄링, 로컬 API까지의 네트워크 시간이 포함됩니다.
        </p>
        <p>
          보유 종목 UI를 먼저 그리자 정렬 버튼은 요청 통과에서 <strong>201.5 ms</strong>, 모의 응답에서 <strong>171.2 ms</strong> 빨리 준비됐습니다.
          두 경로의 로딩 후 INP 중앙값은 모두 40 ms였습니다.
        </p>
        <p>
          초회에 두 워커 경로의 데이터 표시가 늦어진 방향은 같은 조건의 재측정에서 반복되지 않았습니다. Chrome trace에서는 요청 전 스크립트 작업과 MSW 모듈 로드 시간이 실행마다 달랐습니다.
          재측정에서 응답 본문 수신 후 DOM 반영까지는 두 구현 모두 약 11~12 ms였습니다.
        </p>
      </div>
    </div>
  )
})

const RecordedResults = memo(function RecordedResults() {
  return (
    <div className={styles.recorded}>
      <div>
        <h3 id="cold-results-title">플레이그라운드 첫 방문 결과</h3>
        <p>
          차트를 추가하기 전에 측정한 조건별 7회 중앙값입니다. 단위는 ms이며, 각 셀은 변경 전 <span lang="en">{renderingLabels.gated}</span> → 변경 후 <span lang="en">{renderingLabels.shell}</span> 순서입니다.
          정렬 버튼 준비와 데이터 DOM 반영은 탐색 시작 기준이며, INP는 데이터가 표시된 뒤 정렬 버튼을 8회 눌러 측정했습니다.
        </p>
        <ExperimentTable label="플레이그라운드 첫 방문 결과">
          <caption className={styles.srOnly}>조건별 중앙값, 단위 ms. Wait for worker에서 Render shell first로 변경한 결과입니다.</caption>
          <thead>
            <tr>
              <th scope="col" lang="en">Request path</th>
              <th scope="col">정렬 버튼 준비</th>
              <th scope="col">요청 → 응답 헤더</th>
              <th scope="col">데이터 DOM 반영</th>
              <th scope="col">로딩 후 INP</th>
              <th scope="col">재측정 데이터 DOM 반영</th>
            </tr>
          </thead>
          <tbody>
            {paths.map((path) => {
              const { button, headers, data, inp, repeatedData } = coldResults[path]
              return (
                <tr key={path}>
                  <th scope="row" lang="en">{labels[path]}</th>
                  <VisitChange values={button} />
                  <VisitChange values={headers} />
                  <VisitChange values={data} />
                  <VisitChange values={inp} />
                  <VisitChange values={repeatedData} />
                </tr>
              )
            })}
          </tbody>
        </ExperimentTable>
      </div>
      <div>
        <h3 id="source-results-title">원본 Jonbeo 개발 서버 결과</h3>
        <p>
          원본 Next.js 개발 서버에서 커밋별 7회 측정한 중앙값입니다. INP는 포트폴리오가 표시된 뒤 통화 버튼을 8회 눌러 측정했습니다.
        </p>
        <ExperimentTable label="원본 Jonbeo 개발 서버 결과">
          <thead>
            <tr>
              <th scope="col">측정 항목</th>
              <th scope="col">변경 전 · <code>d68ac41</code> 게이트 적용</th>
              <th scope="col">변경 후 · <code>76f9ac6</code> 게이트 제거</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">포트폴리오 제목 첫 DOM 등장</th>
              <td>{originalResults.titleSeconds[0]}초</td>
              <td>{originalResults.titleSeconds[1]}초</td>
            </tr>
            <tr>
              <th scope="row">등록 호출 → 모의 응답 활성화</th>
              <td>{originalResults.registerToEnabledMs} ms</td>
              <td>해당 없음</td>
            </tr>
            <tr>
              <th scope="row">통화 전환 INP</th>
              <td>{originalResults.inpMs[0]} ms</td>
              <td>{originalResults.inpMs[1]} ms</td>
            </tr>
            <tr>
              <th scope="row">통화 전환 이벤트 처리</th>
              <td>{originalResults.eventProcessingMs[0]} ms</td>
              <td>{originalResults.eventProcessingMs[1]} ms</td>
            </tr>
          </tbody>
        </ExperimentTable>
      </div>
    </div>
  )
})

const PortfolioChart = memo(function PortfolioChart({ holdings }: { holdings: Holding[] }) {
  const positions = holdings.map(({ code, name, shares, price }) => ({ code, name, value: shares * price }))
    .sort((a, b) => b.value - a.value)
  const maxValue = positions[0]?.value ?? 0
  const total = positions.reduce((sum, position) => sum + position.value, 0)

  return (
    <figure className={styles.chart} aria-labelledby="portfolio-chart-title" aria-describedby="portfolio-chart-note">
      <figcaption className={styles.chartCaption}>
        <div>
          <h4 id="portfolio-chart-title">보유 종목 평가액</h4>
          <strong>{number.format(total)}</strong>
        </div>
        <p id="portfolio-chart-note">수량 × 단가 · 평가액 순</p>
      </figcaption>
      <ul className={styles.chartList}>
        {positions.map(({ code, name, value }) => (
          <li key={code}>
            <span className={styles.chartCode} title={name}>{code}</span>
            <span className={styles.chartTrack} aria-hidden="true">
              <span style={{ width: maxValue > 0 ? `${value / maxValue * 100}%` : 0 }} />
            </span>
            <span className={styles.chartValue}>{number.format(value)}</span>
          </li>
        ))}
      </ul>
    </figure>
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
          <h3 id="holdings-title">Holdings</h3>
          <p role="status">{portfolio ? rows.length + ' positions' : 'Loading portfolio…'}</p>
        </div>
        <button aria-pressed={sorted} onClick={() => setSorted(!sorted)}>
          Sort by name
        </button>
      </header>
      {portfolio && (
        <div className={styles.portfolioGrid}>
          <PortfolioChart holdings={portfolio.holdings} />
          <div className={styles.tableScroll} role="region" aria-label="종목 표 스크롤 영역" tabIndex={0}>
            <table aria-labelledby="holdings-title">
              <thead><tr><th scope="col">Symbol</th><th scope="col">Name</th><th scope="col">Shares</th><th scope="col">Price</th></tr></thead>
              <tbody>
                {rows.map(({ code, name, shares, price }) => (
                  <tr key={code}><th scope="row">{code}</th><td>{name}</td><td>{shares}</td><td>{number.format(price)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
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
    <ExperimentPage
      experiment="jonbeo-msw"
      summary={{
        problem: <>원본 Jonbeo 개발 모드의 <code>MSWComponent</code>는 워커가 준비될 때까지 <code>null</code>을 반환해 페이지 전체의 렌더링을 막았습니다.</>,
        finding: <>워커 대기를 제거한 원본 개발 서버에서 제목이 DOM에 나타난 중앙값은 <strong>{originalResults.titleSeconds[0]}초 → {originalResults.titleSeconds[1]}초</strong>였습니다. 통화 전환 INP는 <strong>{originalResults.inpMs[0]} → {originalResults.inpMs[1]} ms</strong>였고, 가장 오래 걸린 구간은 클릭 이벤트 처리였습니다.</>,
        decision: '변경 커밋은 홈의 서버 데이터 경로를 유지하면서 MSW 초기화 호출과 렌더링 대기 조건을 제거했습니다. 로딩 후 클릭 지연은 이벤트 처리에서 관측됐습니다.',
      }}
      sourceAnalysis={<OriginalAnalysis />}
    >
      <ExperimentSection id="options">
        <ComparisonAxes />
      </ExperimentSection>
      <ExperimentSection id="playground" description="두 설정을 고른 뒤 Apply를 누르면 선택한 조건으로 다시 로드합니다.">
        <ExperimentWorkbench>
          <Controls />
          <p className={styles.condition}>현재 실행 조건 · <span lang="en">{labels[mode]} · {renderingLabels[variant]}</span></p>
          {error && <p role="alert">{error}</p>}
          {(variant === 'shell' || workerReady) ? <Holdings portfolio={portfolio} /> : <p role="status">Starting the worker…</p>}
        </ExperimentWorkbench>
      </ExperimentSection>
      <ExperimentSection id="conclusion">
        <Findings />
      </ExperimentSection>
      <ExperimentSection id="verification" description="플레이그라운드의 통제 실험과 원본 Jonbeo 개발 서버 재현은 별도로 측정했습니다.">
        <RecordedResults />
      </ExperimentSection>
    </ExperimentPage>
  )
}

mark('boot')
createRoot(document.getElementById('root')!).render(<App />)
