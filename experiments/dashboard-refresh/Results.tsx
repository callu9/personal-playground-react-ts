import { summary, targetWindowMs } from '../../docs/experiments/dashboard-refresh/evidence/dashboard-refresh-benchmark.json'
import { ExperimentOptions, ExperimentTable } from '../shared/ExperimentPage'
import { methodLabels, scenarioLabels, type Method, type PollInterval, type Scenario } from './contract'
import { normalDelayMs, outageEndMs, outageStartMs, slowDelayMs } from './fixture'
import styles from './dashboard.module.css'

const methodDescription: Record<Method, string> = {
  fixed: '1·3·5초 중 선택한 간격으로 최신 스냅샷을 요청합니다. 응답이 느리면 요청을 겹치지 않습니다.',
  adaptive: '평소 4초마다 확인합니다. 새 버전을 관측하면 이후 3초 동안 1초마다 조회하고, 추가 갱신을 받으면 기간을 연장합니다.',
  sse: '열린 연결로 최신 스냅샷을 받습니다. 재연결 시 최신 버전부터 갱신을 이어갑니다.',
}

const scenarioDescription: Record<Scenario, string> = {
  normal: `모든 후보에 ${normalDelayMs} ms의 전달 지연을 적용합니다.`,
  slow: `데이터 갱신은 같은 일정대로 진행되며, 전달 지연만 ${slowDelayMs.toLocaleString('en-US')} ms로 늘어납니다.`,
  outage: `시작 후 ${outageStartMs / 1_000}~${outageEndMs / 1_000}초 사이에 연결을 끊습니다. 지표는 계속 갱신됩니다.`,
}

const normalRows = summary.normal
const fixed3 = normalRows.find(({ candidate }) => candidate.id === 'fixed-3s')
const push = normalRows.find(({ candidate }) => candidate.id === 'sse')
const number = new Intl.NumberFormat('ko-KR')
const ms = (value: number | null) => value === null ? '—' : `${number.format(value)} ms`

export const RefreshSummary = {
  problem: '대시보드를 열어 둔 동안 지표가 계속 바뀝니다. 조회 간격을 늘리면 요청은 줄지만, 갱신이 몰리는 동안 화면이 최신 상태보다 뒤처질 수 있습니다.',
  finding: fixed3 && push
    ? <>고정 3초 폴링은 <strong>{fixed3.requests.toFixed(1)}건/분/탭</strong>이었고 갱신 {fixed3.missed}/{fixed3.versions}개가 화면에 나타나지 않았습니다. 정상 시 SSE의 집중 갱신 반영 p95는 <strong>{ms(push.burstP95)}</strong>였습니다.</>
    : '반영 지연, 지속 요청/분/탭, 화면이 최신 버전보다 뒤처진 시간, 단절 후 복구를 비교합니다.',
  decision: '최신 상태만 필요하면 허용 지연과 요청 예산을 만족하는 고정 주기를 고릅니다. 갱신이 몰릴 때만 신속한 반영이 필요하면 적응형, 낮은 지연이 중요하고 열린 연결을 운영할 수 있으면 SSE를 검토합니다.',
}

export function RefreshOptions() {
  return (
    <>
      <h3 className={styles.groupTitle}>조회 방식 <span lang="en">Update method</span></h3>
      <ExperimentOptions items={Object.entries(methodLabels).map(([id, label]) => ({
        label: <span lang="en">{label}</span>,
        description: methodDescription[id as Method],
      }))} />
      <h3 className={styles.groupTitle}>서버 조건 <span lang="en">Delivery scenario</span></h3>
      <ExperimentOptions items={Object.entries(scenarioLabels).map(([id, label]) => ({
        label: <span lang="en">{label}</span>,
        description: scenarioDescription[id as Scenario],
      }))} />
    </>
  )
}

export function Results({ scenario, method, interval }: { scenario: Scenario; method: Method; interval: PollInterval }) {
  const rows = summary[scenario]
  const showRecovery = scenario === 'outage'
  const isSelected = (candidate: (typeof rows)[number]['candidate']) => candidate.method === method &&
    (candidate.method !== 'fixed' || candidate.interval === interval)

  return (
    <section className={styles.results} aria-labelledby="refresh-results-title">
      <h3 id="refresh-results-title">시나리오별 측정 결과</h3>
      <p>서버 조건을 바꾸면 해당 시나리오의 로컬 Chrome 측정 결과가 표시됩니다.</p>
      <div className={styles.resultsCard}>
        <h4 lang="en">{scenarioLabels[scenario]}</h4>
        {rows.length > 0 ? <>
          <p>단일 탭 · 목표 창 {targetWindowMs / 1_000}초 · 후보별 {rows[0].repeats}회</p>
          {!rows.some(({ candidate }) => isSelected(candidate)) && <p>현재 선택한 고정 주기는 이 조건에서 측정하지 않았습니다.</p>}
          <div className={styles.resultTable}>
            <ExperimentTable label={scenarioLabels[scenario]}>
              <thead>
                <tr>
                  <th scope="col">방식</th>
                  <th scope="col">평상시 반영 p95</th>
                  <th scope="col">집중 갱신 반영 p95</th>
                  <th scope="col">미관측 / 전체</th>
                  <th scope="col">뒤처진 시간</th>
                  <th scope="col">요청 / 분 / 탭</th>
                  <th scope="col">응답 본문 / 분 / 탭</th>
                  {showRecovery && <th scope="col">최신 상태 복구 p95</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.candidate.id} className={isSelected(row.candidate) ? styles.selectedResult : undefined}>
                    <th scope="row"><span lang="en">{row.candidate.label}</span>{isSelected(row.candidate) && <small>현재 선택</small>}</th>
                    <td>{ms(row.steadyP95)}</td>
                    <td>{ms(row.burstP95)}</td>
                    <td>{row.missed} / {row.versions}</td>
                    <td>{row.behindPct.toFixed(1)}%</td>
                    <td>{row.requests.toFixed(1)}</td>
                    <td>{number.format(Math.round(row.bodyBytes))} B</td>
                    {showRecovery && <td>{ms(row.recoveryP95)} ({row.recovered}/{row.repeats}회)</td>}
                  </tr>
                ))}
              </tbody>
            </ExperimentTable>
          </div>
          <p className={styles.dataNote}>반영 p95는 브라우저 DOM에서 관측한 버전에만 적용됩니다. 뒤처진 시간은 화면 버전이 서버 최신 버전보다 오래된 구간의 비율로, 중간 버전을 건너뛴 영향도 포함합니다. 요청에는 SSE 연결·재연결을 포함합니다. 전송량은 HTTP 헤더와 TLS를 제외한 응답 본문입니다.</p>
          {showRecovery && <p className={styles.dataNote}>복구는 단절 종료 때 서버에 있던 버전 이상을 처음 화면에 보여 준 시점으로 계산합니다.</p>}
        </> : <p>이 시나리오의 벤치마크 결과를 준비 중입니다.</p>}
      </div>
      <p className={styles.dataNote}><a href="https://github.com/callu9/personal-playground-react-ts/blob/feature/jonbeo-msw-performance/docs/experiments/dashboard-refresh/results.md">측정 조건과 전체 보고서</a></p>
    </section>
  )
}

export function RefreshConclusion({ scenario }: { scenario: Scenario }) {
  const finding = {
    normal: '폴링은 조회 사이에 생긴 중간 스냅샷을 건너뛸 수 있고, SSE는 연결을 열어 둔 채 변경마다 데이터를 받습니다.',
    slow: '단일 요청 정책을 쓰면 느린 응답 동안 다음 폴링이 밀립니다. SSE도 전달 지연을 받지만 다음 갱신을 받으려고 GET 완료를 기다리는 단계는 없습니다.',
    outage: '두 방식 모두 최신 버전부터 복구합니다. 폴링은 다음 조회나 재시도 때, SSE는 연결이 다시 열린 뒤 서버가 최신 스냅샷을 보내면 반영합니다.',
  }
  return (
    <>
      <p className={styles.finding}><strong lang="en">{scenarioLabels[scenario]}</strong> {finding[scenario]}</p>
      <h3 className={styles.groupTitle}>방식별 장단점</h3>
      <dl className={styles.tradeoffs}>
        <div>
          <dt lang="en">{methodLabels.fixed}</dt>
          <dd>일반 GET과 일정한 주기를 사용합니다. 값이 그대로여도 요청을 보내며 긴 주기는 최신 값 반영이 느립니다.</dd>
        </div>
        <div>
          <dt lang="en">{methodLabels.adaptive}</dt>
          <dd>변경이 뜸하면 요청을 줄입니다. 집중 갱신의 시작은 직전의 긴 주기 동안 놓칠 수 있습니다.</dd>
        </div>
        <div>
          <dt lang="en">{methodLabels.sse}</dt>
          <dd>연결을 유지해 변경 시 서버가 최신 값을 보냅니다. 탭별 연결 수, 프록시 버퍼링과 종료·재연결을 관리해야 합니다.</dd>
        </div>
      </dl>
    </>
  )
}
