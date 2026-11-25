import { samples } from '../../docs/experiments/dashboard-refresh/evidence/dashboard-refresh-benchmark.json'
import { ExperimentOptions, ExperimentTable } from '../shared/ExperimentPage'
import { methodLabels, scenarioLabels, type Method, type PollInterval, type Scenario } from './contract'
import styles from './dashboard.module.css'

const methodDescription: Record<Method, string> = {
  fixed: '선택한 간격마다 최신 상태를 요청합니다. 느린 응답이 끝날 때까지 다음 요청은 대기합니다.',
  adaptive: '대기 상태에서는 4초마다, 진행 상태를 확인한 뒤에는 1초마다 최신 상태를 요청합니다.',
  sse: '서버가 유지 중인 연결로 상태를 보냅니다. 재연결하면 마지막으로 받은 버전 이후의 기록을 재생합니다.',
}

const scenarios = {
  normal: {
    conditions: '가상 전달 지연 40 ms. 작업이 진행되는 동안 연결이 유지됩니다.',
    finding: 'SSE는 한 번 연결해 모든 버전을 받았고, 적응형 폴링보다 응답 본문을 더 많이 받았습니다. 고정 폴링의 간격을 늘리면 요청 수가 줄고 중간 상태를 건너뛸 가능성이 커졌습니다.',
  },
  slow: {
    conditions: '가상 전달 지연 1,350 ms. 진행 일정은 정상 시나리오와 같습니다.',
    finding: '1초 폴링도 1,350 ms 응답을 기다린 뒤 다음 요청을 보냅니다. 이 표본에서 두 폴링 방식은 중간 버전을 하나씩 건너뛰었습니다.',
  },
  outage: {
    conditions: '작업 시작 후 5.8초부터 8.5초까지 연결을 끊습니다. 그 외 가상 전달 지연은 40 ms입니다.',
    finding: 'SSE는 최신 상태를 가장 빨리 복구했고 빠진 버전을 재생했습니다. 복구까지 기다린 과거 버전도 p95에 들어가므로 SSE의 전체 반영 p95가 높아졌습니다.',
  },
} satisfies Record<Scenario, { conditions: string; finding: string }>

export function RefreshOptions() {
  return (
    <>
      <h3 className={styles.groupTitle}>조회 방식 <span lang="en">Update method</span></h3>
      <ExperimentOptions items={Object.entries(methodLabels).map(([id, label]) => ({
        label: <span lang="en">{label}</span>,
        description: methodDescription[id as Method],
      }))} />
      <h3 className={styles.groupTitle}>서버 조건 <span lang="en">Next run scenario</span></h3>
      <ExperimentOptions items={Object.entries(scenarioLabels).map(([id, label]) => ({
        label: <span lang="en">{label}</span>,
        description: scenarios[id as Scenario].conditions,
      }))} />
    </>
  )
}

export function RunSettingsHelp() {
  return (
    <div className={styles.controlHelp} lang="ko">
      <p id="update-method-help"><strong lang="en">Update method</strong>를 바꾸면 현재 작업을 새 방식으로 다시 구독하고 관측 목록을 초기화합니다.</p>
      <p id="run-scenario-help"><strong lang="en">Next run scenario</strong>는 <span lang="en">Start run</span>을 눌러 만드는 새 작업에 적용됩니다.</p>
    </div>
  )
}

const candidates = [
  { id: 'fixed-1s', method: 'fixed', interval: 1_000, label: 'Fixed polling · 1 s' },
  { id: 'fixed-3s', method: 'fixed', interval: 3_000, label: 'Fixed polling · 3 s' },
  { id: 'fixed-5s', method: 'fixed', interval: 5_000, label: 'Fixed polling · 5 s' },
  { id: 'adaptive', method: 'adaptive', label: methodLabels.adaptive },
  { id: 'sse', method: 'sse', label: methodLabels.sse },
] as const

const number = new Intl.NumberFormat('ko-KR')
const ms = (value: number | undefined) => value === undefined ? '—' : `${number.format(value)} ms`
const observed = (values: (number | null)[]) => values.filter((value): value is number => value !== null)

function p95(values: number[]) {
  return values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]
}

function collectResults(scenario: Scenario) {
  return candidates.flatMap((candidate) => {
    const runs = samples.filter((run) => run.tabs === 1 && run.scenario === scenario && run.method === candidate.id)
    if (!runs.length) return []
    const observations = runs.map((run) => run.observations).flat()
    const updates = observations.map((tab) => tab.updates).flat()
    const received = observed(updates.map(({ delayMs }) => delayMs))
    const completed = observed(updates.filter(({ status }) => status === 'Completed').map(({ delayMs }) => delayMs))
    return [{
      candidate,
      delivery: p95(received),
      completion: p95(completed),
      missed: updates.length - received.length,
      versions: updates.length,
      requests: runs.reduce((total, run) => total + run.snapshotRequests + run.streamRequests, 0) / runs.length,
      bodyBytes: runs.reduce((total, run) => total + run.bodyBytes, 0) / runs.length,
      recovery: p95(observed(observations.map(({ recoveryMs }) => recoveryMs))),
    }]
  })
}

export function Results({ scenario, method, interval }: { scenario: Scenario; method: Method; interval: PollInterval }) {
  const rows = collectResults(scenario)
  const showRecovery = scenario === 'outage'
  const isSelected = (candidate: typeof candidates[number]) => candidate.method === method &&
    (candidate.method !== 'fixed' || candidate.interval === interval)

  return (
    <section id="refresh-results" className={styles.results} aria-labelledby="refresh-results-title">
      <h3 id="refresh-results-title">시나리오별 측정 결과</h3>
      <p>위의 <span lang="en">Next run scenario</span>를 바꾸면 기존 벤치마크에서 해당 조건을 찾아 표시합니다.</p>
      <div className={styles.resultsCard}>
        <h4 id="refresh-scenario-title" lang="en">{scenarioLabels[scenario]}</h4>
        <p>{scenario === 'normal' ? '단일 탭 · 후보별 3회' : '단일 탭 · 후보별 1회 · 고정 폴링 1초만 측정'}</p>
        {!rows.some(({ candidate }) => isSelected(candidate)) &&
          <p>현재 선택한 고정 주기는 이 시나리오에서 측정하지 않았습니다.</p>}
        <div className={styles.resultTable}>
          <ExperimentTable label={scenarioLabels[scenario]}>
            <thead>
              <tr>
                <th scope="col">방식</th>
                <th scope="col">전체 반영 p95</th>
                <th scope="col">완료 반영 {scenario === 'normal' ? 'p95' : '지연'}</th>
                <th scope="col">미관측 / 전체 버전</th>
                <th scope="col">평균 요청 / 작업</th>
                <th scope="col">평균 응답 본문 / 작업</th>
                {showRecovery && <th scope="col">최신 상태 복구</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.candidate.id} className={isSelected(row.candidate) ? styles.selectedResult : undefined}>
                  <th scope="row"><span lang="en">{row.candidate.label}</span>{isSelected(row.candidate) && <small>현재 선택</small>}</th>
                  <td>{ms(row.delivery)}</td>
                  <td>{ms(row.completion)}</td>
                  <td>{row.missed} / {row.versions}</td>
                  <td>{row.requests.toFixed(1)}</td>
                  <td>{number.format(Math.round(row.bodyBytes))} B</td>
                  {showRecovery && <td>{ms(row.recovery)}</td>}
                </tr>
              ))}
            </tbody>
          </ExperimentTable>
        </div>
        <p className={styles.dataNote}>반영 지연은 서버 기록부터 화면에 나타날 때까지입니다. p95는 관측된 지연의 95백분위이며, 화면에 나타나지 않은 버전은 별도로 셉니다. 요청에는 스냅샷 조회와 SSE 연결·재연결이 포함됩니다. 본문에는 SSE 프레임과 하트비트가 포함되며 HTTP 헤더와 TLS 비용은 제외합니다.</p>
        {showRecovery && <p className={styles.dataNote}>최신 상태 복구는 단절 종료부터 그 시점의 최신 버전 이상이 화면에 나타날 때까지입니다.</p>}
      </div>
      <p className={styles.dataNote}><a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/docs/experiments/dashboard-refresh/results.md">측정 조건과 전체 보고서</a></p>
    </section>
  )
}

export function RefreshConclusion({ scenario }: { scenario: Scenario }) {
  return (
    <>
      <p className={styles.finding}><strong lang="en">{scenarioLabels[scenario]}</strong> {scenarios[scenario].finding}</p>
      <h3 className={styles.groupTitle}>방식별 장단점</h3>
      <dl className={styles.tradeoffs}>
        <div>
          <dt lang="en">{methodLabels.fixed}</dt>
          <dd>최신 상태만 필요할 때 구현과 운영이 단순합니다. 주기가 길면 완료 표시가 늦고, 짧으면 요청이 늘어납니다.</dd>
        </div>
        <div>
          <dt lang="en">{methodLabels.adaptive}</dt>
          <dd>대기 중 요청을 줄이고 진행을 확인한 뒤 빠르게 갱신합니다. 진행 시작은 대기 주기만큼 늦게 감지할 수 있고 중간 버전은 건너뛸 수 있습니다.</dd>
        </div>
        <div>
          <dt lang="en">{methodLabels.sse}</dt>
          <dd>빠른 반영과 단절 후 재생에 유리합니다. 장기 연결, 프록시 버퍼링, 서버의 버전 이력을 관리해야 합니다.</dd>
        </div>
      </dl>
    </>
  )
}
