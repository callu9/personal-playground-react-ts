import evidence from '../../docs/experiments/job-status/evidence/job-status-benchmark.json'
import { ExperimentOptions, ExperimentTable } from '../shared/ExperimentPage'
import {
  cancelSettleMs, methodLabels, requestLimit, retryPolicyLabels, scenarioLabels,
  type Method, type PollInterval, type Scenario,
} from './contract'
import styles from './job-status.module.css'

interface ScenarioRow {
  group: string; scenario: Scenario; candidate: string; tabs: number; isolated: boolean; runs: number; versions: number; missed: number
  receivedP95Ms: number | null; completedP95Ms: number | null; completedSeen: string; recoveryP95Ms: number | null
  requestsPerRun: number; requestsPerTabMin: number; rejectedPerRun: number; earlyRetries: number
  bodyBytesPerTabMin: number; maxActiveStreams: number; maxActiveSnapshots: number
}
interface Stat { min: number; median: number; max: number }
interface CancelRow { scenario: 'cancel'; candidate: string; runs: number; clickerCancelledMs: Stat; observerCancelledMs: Stat; cancellingSeen: string }
const environment = evidence.environment as Partial<Record<'platform' | 'node' | 'chrome', string>>
const rows = evidence.aggregate as unknown as (ScenarioRow | CancelRow)[]
const scenarioRows = rows.filter((row): row is ScenarioRow => row.scenario !== 'cancel')
const cancelRows = rows.filter((row): row is CancelRow => row.scenario === 'cancel')

const candidateLabels: Record<string, string> = {
  'fixed-1s': 'Fixed polling · 1 s', 'fixed-3s': 'Fixed polling · 3 s', 'fixed-5s': 'Fixed polling · 5 s',
  'fixed-1s-ignore': 'Fixed 1 s · backoff only', 'fixed-3s-ignore': 'Fixed 3 s · backoff only',
  adaptive: 'Adaptive polling', 'adaptive-ignore': 'Adaptive · backoff only', sse: 'Server-sent events',
}

const methodDescription: Record<Method, string> = {
  fixed: '선택한 간격마다 최신 상태를 요청합니다. 느린 응답이 끝날 때까지 다음 요청은 대기하고, 작업이 끝나면 멈춥니다.',
  adaptive: '대기 상태에서는 4초마다, 진행·취소 중에는 1초마다 최신 상태를 요청합니다.',
  sse: '서버가 유지 중인 연결로 상태를 보냅니다. 재연결하면 마지막으로 받은 버전 이후의 기록을 재생합니다.',
}

const scenarioDescription: Record<Scenario, string> = {
  normal: '가상 전달 지연 40 ms. 작업이 진행되는 동안 연결이 유지됩니다.',
  slow: '가상 전달 지연 1,350 ms. 진행 일정은 정상 시나리오와 같습니다.',
  outage: '작업 시작 후 5.8초부터 8.5초까지 연결을 끊습니다. 그 외 가상 전달 지연은 40 ms입니다.',
  limited: `같은 작업의 상태 조회를 ${requestLimit.windowMs / 1_000}초 안에 ${requestLimit.requests}건까지 받습니다. 초과하면 429와 Retry-After(초)로 거절합니다. 같은 작업을 보는 모든 탭이 한도를 공유합니다.`,
}

export function JobStatusOptions() {
  return (
    <>
      <h3 className={styles.groupTitle}>조회 방식 <span lang="en">Update method</span></h3>
      <ExperimentOptions items={Object.entries(methodLabels).map(([id, label]) => ({
        label: <span lang="en">{label}</span>, description: methodDescription[id as Method],
      }))} />
      <h3 className={styles.groupTitle}>429 처리 <span lang="en">429 handling</span></h3>
      <ExperimentOptions items={[
        { label: <span lang="en">{retryPolicyLabels.honor}</span>, description: 'Retry-After만큼, 원래 조회 간격보다 짧지 않게 기다린 뒤 다시 조회합니다. 탭마다 0~250 ms를 더해 동시 재시도를 흩습니다.' },
        { label: <span lang="en">{retryPolicyLabels.ignore}</span>, description: 'Retry-After를 읽지 않고 0.5초에서 8초까지 두 배씩 늘리는 실패 백오프만 씁니다. SSE는 상태 코드와 Retry-After를 읽을 수 없어 이 방식과 같습니다.' },
      ]} />
      <h3 className={styles.groupTitle}>서버 조건 <span lang="en">Next run scenario</span></h3>
      <ExperimentOptions items={Object.entries(scenarioLabels).map(([id, label]) => ({
        label: <span lang="en">{label}</span>, description: scenarioDescription[id as Scenario],
      }))} />
    </>
  )
}

export function RunSettingsHelp() {
  return (
    <div className={styles.controlHelp} lang="ko">
      <p id="update-method-help"><strong lang="en">Update method</strong>를 바꾸면 현재 작업을 새 방식으로 다시 구독하고 관측 목록을 초기화합니다.</p>
      <p id="run-scenario-help"><strong lang="en">Next run scenario</strong>는 <span lang="en">Start run</span>을 눌러 만드는 새 작업에 적용됩니다. 취소는 <span lang="en">Cancel job</span>으로 요청하며, 서버는 {cancelSettleMs} ms 뒤 <span lang="en">Cancelled</span>를 보고합니다.</p>
    </div>
  )
}

const number = new Intl.NumberFormat('ko-KR')
const ms = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${number.format(Math.round(value))} ms`
const label = (candidate: string) => candidateLabels[candidate] ?? candidate

function candidateSelected(candidate: string, method: Method, interval: PollInterval) {
  return candidate === (method === 'fixed' ? `fixed-${interval / 1_000}s` : method)
}

export function Results({ scenario, method, interval }: { scenario: Scenario; method: Method; interval: PollInterval }) {
  const selected = scenarioRows.filter((row) => row.group === scenario)
  const tabRows = scenarioRows.filter((row) => row.group === 'tabs')
  const showRecovery = scenario === 'outage'
  const showLimit = scenario === 'limited'
  return (
    <section id="job-status-results" className={styles.results} aria-labelledby="job-status-results-title">
      <h3 id="job-status-results-title">시나리오별 측정 결과</h3>
      <p>위의 <span lang="en">Next run scenario</span>를 바꾸면 측정 원본에서 해당 조건을 찾아 표시합니다. {environment.platform ? `${environment.platform} · Node ${environment.node} · Chrome ${environment.chrome}` : '측정 원본 없음'}</p>
      <div className={styles.resultsCard}>
        <h4 id="job-status-scenario-title" lang="en">{scenarioLabels[scenario]}</h4>
        <p>단일 탭 · 후보별 {selected[0]?.runs ?? 0}회</p>
        <div className={styles.resultTable}>
          <ExperimentTable label={scenarioLabels[scenario]}>
            <thead>
              <tr>
                <th scope="col">방식</th>
                <th scope="col">전체 반영 p95</th>
                <th scope="col">완료 반영 p95</th>
                <th scope="col">완료 관측</th>
                <th scope="col">미관측 / 전체 버전</th>
                <th scope="col">평균 요청 / 작업</th>
                {showLimit && <th scope="col">429 / 작업</th>}
                {showLimit && <th scope="col">Retry-After 전 재요청</th>}
                {showRecovery && <th scope="col">최신 상태 복구</th>}
              </tr>
            </thead>
            <tbody>
              {selected.map((row) => (
                <tr key={row.candidate} className={candidateSelected(row.candidate, method, interval) ? styles.selectedResult : undefined}>
                  <th scope="row"><span lang="en">{label(row.candidate)}</span>{candidateSelected(row.candidate, method, interval) && <small>현재 선택</small>}</th>
                  <td>{ms(row.receivedP95Ms)}</td>
                  <td>{ms(row.completedP95Ms)}</td>
                  <td>{row.completedSeen}</td>
                  <td>{row.missed} / {row.versions}</td>
                  <td>{row.requestsPerRun.toFixed(1)}</td>
                  {showLimit && <td>{row.rejectedPerRun.toFixed(1)}</td>}
                  {showLimit && <td>{row.earlyRetries}</td>}
                  {showRecovery && <td>{ms(row.recoveryP95Ms)}</td>}
                </tr>
              ))}
            </tbody>
          </ExperimentTable>
        </div>
        <p className={styles.dataNote}>반영 지연은 서버 기록부터 화면에 나타날 때까지입니다. p95는 관측된 지연의 95백분위이며, 화면에 나타나지 않은 버전은 별도로 셉니다. 요청에는 상태 조회(429 포함)와 SSE 연결·재연결이 들어갑니다.</p>
      </div>
      <div className={styles.resultsCard}>
        <h4>취소 요청 후 반영 시간</h4>
        <p>정상 전달 · 후보별 {cancelRows[0]?.runs ?? 0}회 · 요청 탭과 관찰만 하는 다른 탭 · 서버는 요청 뒤 {cancelSettleMs} ms에 취소를 확정</p>
        <div className={styles.resultTable}>
          <ExperimentTable label="취소 반영 시간">
            <thead>
              <tr>
                <th scope="col">방식</th>
                <th scope="col">요청 탭 · 취소됨 중앙값</th>
                <th scope="col">요청 탭 · 범위</th>
                <th scope="col">다른 탭 · 취소됨 중앙값</th>
                <th scope="col">다른 탭 · 범위</th>
              </tr>
            </thead>
            <tbody>
              {cancelRows.map((row) => (
                <tr key={row.candidate} className={candidateSelected(row.candidate, method, interval) ? styles.selectedResult : undefined}>
                  <th scope="row"><span lang="en">{label(row.candidate)}</span></th>
                  <td>{ms(row.clickerCancelledMs.median)}</td>
                  <td>{ms(row.clickerCancelledMs.min)} ~ {ms(row.clickerCancelledMs.max)}</td>
                  <td>{ms(row.observerCancelledMs.median)}</td>
                  <td>{ms(row.observerCancelledMs.min)} ~ {ms(row.observerCancelledMs.max)}</td>
                </tr>
              ))}
            </tbody>
          </ExperimentTable>
        </div>
        <p className={styles.dataNote}>취소 요청 버튼을 누른 시각부터 화면에 Cancelled 행이 나타날 때까지입니다.</p>
      </div>
      <div className={styles.resultsCard}>
        <h4>같은 작업을 여러 탭에서 볼 때</h4>
        <p>탭은 한 브라우저 프로필에서 열었고, 표시한 경우만 탭마다 별도 프로필을 썼습니다. 조합마다 1회입니다.</p>
        <div className={styles.resultTable}>
          <ExperimentTable label="여러 탭 측정">
            <thead>
              <tr>
                <th scope="col">조건</th>
                <th scope="col">방식</th>
                <th scope="col">탭</th>
                <th scope="col">서버 요청</th>
                <th scope="col">429</th>
                <th scope="col">최대 동시 SSE 연결</th>
                <th scope="col">완료 관측 탭</th>
                <th scope="col">완료 반영 p95</th>
              </tr>
            </thead>
            <tbody>
              {tabRows.map((row) => (
                <tr key={`${row.scenario}-${row.candidate}-${row.tabs}-${row.isolated}`}>
                  <td lang="en">{scenarioLabels[row.scenario]}{row.isolated ? ' · separate profiles' : ''}</td>
                  <th scope="row"><span lang="en">{label(row.candidate)}</span></th>
                  <td>{row.tabs}</td>
                  <td>{(row.requestsPerRun).toFixed(0)}</td>
                  <td>{row.rejectedPerRun.toFixed(0)}</td>
                  <td>{row.maxActiveStreams}</td>
                  <td>{row.completedSeen}</td>
                  <td>{ms(row.completedP95Ms)}</td>
                </tr>
              ))}
            </tbody>
          </ExperimentTable>
        </div>
      </div>
    </section>
  )
}

export function JobStatusConclusion() {
  return (
    <>
      <p className={styles.finding}>결론은 <a href="https://github.com/callu9/personal-playground-react-ts/blob/main/docs/experiments/job-status/results.md#폴링으로-충분한-조건과-전환-기준">결과 보고서</a>에 조건별로 정리했습니다. 아래는 방식별 장단점입니다.</p>
      <h3 className={styles.groupTitle}>방식별 장단점</h3>
      <dl className={styles.tradeoffs}>
        <div>
          <dt lang="en">{methodLabels.fixed}</dt>
          <dd>구현과 운영이 단순합니다. 주기가 길면 완료·취소 표시가 늦고, 짧으면 탭 수에 비례해 요청이 늘며 요청 제한에 먼저 닿습니다.</dd>
        </div>
        <div>
          <dt lang="en">{methodLabels.adaptive}</dt>
          <dd>대기 중 요청을 줄이고 진행·취소 중에는 빠르게 갱신합니다. 진행 시작은 대기 주기만큼 늦게 알 수 있고, 진행 중 1초 조회는 요청 제한에 가장 먼저 닿는 조건입니다.</dd>
        </div>
        <div>
          <dt lang="en">{methodLabels.sse}</dt>
          <dd>취소와 완료가 가장 빨리 반영됩니다. 탭마다 장기 연결을 유지해야 하고, 브라우저의 HTTP/1.1 연결 한도와 429 재연결 정책을 직접 다뤄야 합니다.</dd>
        </div>
      </dl>
    </>
  )
}
