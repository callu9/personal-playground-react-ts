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

const scenarioFinding: Record<Scenario, string> = {
  normal: '고정 3초의 탭당 요청량과 본문 전송량은 고정 1초보다 적었습니다. SSE는 모든 버전을 관측했고 반영 p95가 가장 낮았습니다.',
  slow: '1,350 ms의 전달 지연은 SSE에도 적용됩니다. 폴링은 앞선 응답을 기다린 뒤 다음 GET을 보내므로 짧게 설정한 조회 주기만큼 자주 받을 수 없습니다.',
  outage: '폴링과 SSE는 모두 최신 스냅샷으로 복구했습니다. 아래 복구 수치는 후보별 2회이며 재시도 타이밍에 따라 달라질 수 있습니다.',
}

const normalResult = (id: string) => summary.normal.find(({ candidate }) => candidate.id === id)
const fixed1 = normalResult('fixed-1s')
const fixed3 = normalResult('fixed-3s')
const fixed5 = normalResult('fixed-5s')
const adaptive = normalResult('adaptive')
const push = normalResult('sse')
const number = new Intl.NumberFormat('ko-KR')
const ms = (value: number | null) => value === null ? '—' : `${number.format(value)} ms`

export const RefreshSummary = {
  problem: '대시보드를 열어 둔 동안 지표가 계속 바뀝니다. 조회 간격을 늘리면 요청은 줄지만, 갱신이 몰리는 동안 화면이 최신 상태보다 뒤처질 수 있습니다.',
  finding: fixed3 && push
    ? <>고정 3초 폴링은 <strong>{fixed3.requests.toFixed(1)}건/분/탭</strong>이었고 갱신 {fixed3.missed}/{fixed3.versions}개가 화면에 나타나지 않았습니다. 정상 시 SSE의 집중 갱신 반영 p95는 <strong>{ms(push.burstP95)}</strong>였습니다.</>
    : '반영 지연, 지속 요청/분/탭, 화면이 최신 버전보다 뒤처진 시간, 단절 후 복구를 비교합니다.',
  decision: <>일상 운영 현황 화면의 기본값은 <strong>고정 3초</strong>입니다. 몇 초 늦어도 최신 집계와 최근 결과를 확인할 수 있고, 일반 GET으로 운영할 수 있습니다. <a href="#refresh-choice">사용 목적별 선택</a></>,
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
        <p>{scenarioFinding[scenario]}</p>
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

export function RefreshConclusion() {
  return (
    <section id="refresh-choice" className={styles.choiceGuide} aria-labelledby="refresh-choice-title">
      <h3 id="refresh-choice-title" className={styles.groupTitle}>사용 목적별 선택</h3>
      <p>아래 지연·요청 기준은 방식 선택을 보여 주기 위한 예시입니다. 수치는 정상 전달을 후보별 3회 재서 얻었으며, 반영 p95는 화면에 나타난 버전의 지연입니다.</p>
      {fixed1 && fixed3 && fixed5 && adaptive && push && <dl className={styles.tradeoffs}>
        <div>
          <dt>일상 운영 현황<strong>고정 3초 · 이 화면의 기본값</strong></dt>
          <dd>관측 p95 약 3초와 탭당 25건/분을 허용하고 최신 집계와 최근 결과를 볼 때 고릅니다. 집중 갱신 p95 <strong>{ms(fixed3.burstP95)}</strong>, {fixed3.requests.toFixed(1)}건/분/탭이었고 {fixed3.missed}/{fixed3.versions}개 중간 버전을 건너뛰었습니다.</dd>
        </div>
        <div>
          <dt>보고용 화면·요청 예산 우선<strong>고정 5초</strong></dt>
          <dd>관측 p95 약 4.5초를 허용하고 탭당 15건/분 정도로 줄여야 할 때 고릅니다. {fixed5.requests.toFixed(1)}건/분/탭이었고 집중 갱신 p95는 <strong>{ms(fixed5.burstP95)}</strong>였습니다.</dd>
        </div>
        <div>
          <dt>장기 연결 없이 고른 응답 속도<strong>고정 1초</strong></dt>
          <dd>일반 GET으로 평상시와 집중 갱신 모두 약 1.2초 이내의 관측 p95를 목표로 할 때 고릅니다. 각각 <strong>{ms(fixed1.steadyP95)}</strong>, {ms(fixed1.burstP95)}였고 탭당 {fixed1.requests.toFixed(1)}건/분이 들었습니다.</dd>
        </div>
        <div>
          <dt>몰리는 갱신에만 빠르게 반응<strong>적응형 폴링</strong></dt>
          <dd>장기 연결이 어렵고 집중 갱신 p95는 약 1초, 평상시는 약 4초를 허용할 때 고릅니다. 각각 {ms(adaptive.burstP95)}, <strong>{ms(adaptive.steadyP95)}</strong>였고 고정 1초보다 요청을 줄여 {adaptive.requests.toFixed(1)}건/분/탭을 사용했습니다.</dd>
        </div>
        <div>
          <dt>상시 관제·낮은 지연 우선<strong>SSE</strong></dt>
          <dd>서버가 밀어 주는 최신 상태를 바로 봐야 하고 탭별 장기 연결을 운영할 수 있을 때 고릅니다. 정상 집중 갱신 p95 <strong>{ms(push.burstP95)}</strong>, 미관측 {push.missed}/{push.versions}개였습니다. 연결은 탭당 1회였고 응답 본문은 고정 3초의 약 {(push.bodyBytes / fixed3.bodyBytes).toFixed(1)}배였습니다.</dd>
        </div>
      </dl>}
    </section>
  )
}
