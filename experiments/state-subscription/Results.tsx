import { aggregate, environment as measuredEnvironment } from '../../docs/experiments/state-subscription/evidence/state-subscription-benchmark.json'
import { ExperimentOptions, ExperimentTable } from '../shared/ExperimentPage'
import { approachLabels, placementLabels, type Approach, type Counted, type Interaction, type Placement, type RowCount } from './contract'
import styles from './state-subscription.module.css'

interface Base { approach: Approach; placement: Placement; rows: RowCount; interaction: Interaction; cpuRate: number; loads: number }
interface InpRow extends Base {
  kind: 'inp'; clicks: number; belowThreshold: number; inpMs: number | null; inpMinMs: number | null; inpMaxMs: number | null
  inputDelayMs: number | null; processingMs: number | null; presentationMs: number | null
}
interface ProfileRow extends Base {
  kind: 'profile'; renders: Record<Counted, number>; renderedComponents: number; commits: number; actualDurationMs: number; renderToCommitMs: number | null
}
const environment = measuredEnvironment as Partial<Record<'platform' | 'cpu' | 'node' | 'chrome' | 'react' | 'zustand', string>>
const rows = aggregate as unknown as (InpRow | ProfileRow)[]
const inpRows = rows.filter((row): row is InpRow => row.kind === 'inp')
const profileRows = rows.filter((row): row is ProfileRow => row.kind === 'profile')

const approachDescription: Record<Approach, string> = {
  'context-one': '선택 상태와 단위를 하나의 Context 값에 담습니다. 값이 바뀌면 그 Context를 읽는 모든 컴포넌트가 다시 렌더링됩니다.',
  'context-split': '단위, 선택, 액션을 Context 세 개로 나눕니다. 단위를 읽는 컴포넌트는 선택이 바뀌어도 다시 렌더링되지 않습니다.',
  'zustand-full': '`useStore()`를 선택자 없이 호출해 스토어 전체를 구독합니다. 원본 Jonbeo의 `const { isWon } = useUnitStore()`와 같은 형태입니다.',
  'zustand-selector': '`useStore((state) => state.isWon)`처럼 필요한 값만 선택해 구독합니다. 선택된 행 여부는 `state.selectedId === id`로 구독합니다.',
}

export function StateOptions() {
  return (
    <>
      <h3 className={styles.groupTitle}>구독 방식 <span lang="en">Approach</span></h3>
      <ExperimentOptions items={Object.entries(approachLabels).map(([id, label]) => ({
        label: <span lang="en">{label}</span>, description: approachDescription[id as Approach],
      }))} />
      <h3 className={styles.groupTitle}>구독 위치 <span lang="en">Placement</span></h3>
      <ExperimentOptions items={[
        { label: <span lang="en">{placementLabels.row}</span>, description: '행 컴포넌트가 단위와 선택을 구독합니다. 원본처럼 상태가 바뀌면 이름·차트·금액·버튼을 가진 행 전체가 다시 렌더링됩니다.' },
        { label: <span lang="en">{placementLabels.leaf}</span>, description: '행은 메모이제이션하고 금액 셀과 선택 버튼만 구독합니다. 이름과 차트는 상태가 바뀌어도 다시 렌더링하지 않습니다.' },
      ]} />
    </>
  )
}

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 })
const ms = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${number.format(value)} ms`
const label = (row: Base) => `${approachLabels[row.approach]} · ${row.placement === 'row' ? 'row' : 'leaf'}`

export function Results({ rowCount, approach, placement }: { rowCount: RowCount; approach: Approach; placement: Placement }) {
  const profile = profileRows.filter((row) => row.rows === rowCount)
  const variants = [...new Set(profile.map((row) => `${row.approach}|${row.placement}`))]
  const find = <T extends Base>(list: T[], key: string, interaction: Interaction, cpuRate: number) =>
    list.find((row) => `${row.approach}|${row.placement}` === key && row.interaction === interaction && row.rows === rowCount && row.cpuRate === cpuRate)
  const rates = [...new Set(inpRows.filter((row) => row.rows === rowCount).map((row) => row.cpuRate))].sort((a, b) => b - a)
  const selected = (key: string) => key === `${approach}|${placement}`
  return (
    <section id="state-results" className={styles.results} aria-labelledby="state-results-title">
      <h3 id="state-results-title">행 수별 측정 결과</h3>
      <p>위의 <span lang="en">Rows</span>를 바꾸면 측정 원본에서 해당 행 수를 찾아 표시합니다. {environment.platform ? `${environment.platform} · ${environment.cpu} · Node ${environment.node} · Chrome ${environment.chrome} · React ${environment.react} · Zustand ${environment.zustand}` : '측정 원본 없음'}</p>
      <div className={styles.resultsCard}>
        <h4>렌더링 횟수와 커밋 · 행 {rowCount}개</h4>
        <p>상호작용 한 번에 렌더링된 컴포넌트 수와 Profiler가 본 렌더 단계 시간입니다. CPU 4배 감속, React 프로파일링 빌드, 조건당 상호작용 중앙값입니다.</p>
        <div className={styles.resultTable}>
          <ExperimentTable label="렌더링 횟수와 커밋">
            <thead>
              <tr>
                <th scope="col">구독 방식 · 위치</th>
                <th scope="col">단위 전환 · 렌더된 컴포넌트</th>
                <th scope="col">단위 전환 · 렌더 시간</th>
                <th scope="col">행 선택 · 렌더된 컴포넌트</th>
                <th scope="col">행 선택 · 렌더 시간</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((key) => {
                const unit = find(profile, key, 'unit', 4)
                const select = find(profile, key, 'select', 4)
                const [a, p] = key.split('|') as [Approach, Placement]
                return (
                  <tr key={key} className={selected(key) ? styles.selectedResult : undefined}>
                    <th scope="row"><span lang="en">{label({ approach: a, placement: p } as Base)}</span>{selected(key) && <small>현재 선택</small>}</th>
                    <td>{unit?.renderedComponents ?? '—'}</td>
                    <td>{ms(unit?.actualDurationMs)}</td>
                    <td>{select?.renderedComponents ?? '—'}</td>
                    <td>{ms(select?.actualDurationMs)}</td>
                  </tr>
                )
              })}
            </tbody>
          </ExperimentTable>
        </div>
      </div>
      {rates.map((rate) => (
        <div className={styles.resultsCard} key={rate}>
          <h4>INP · 행 {rowCount}개 · CPU {rate === 1 ? '감속 없음' : `${rate}배 감속`}</h4>
          <p>프로덕션 빌드에서 상호작용 8번 뒤 web-vitals가 보고한 INP의 중앙값입니다. 괄호는 입력 대기 · 이벤트 처리 · 다음 페인트 구간의 중앙값입니다.</p>
          <div className={styles.resultTable}>
            <ExperimentTable label={`INP CPU ${rate}`}>
              <thead>
                <tr>
                  <th scope="col">구독 방식 · 위치</th>
                  <th scope="col">단위 전환 INP</th>
                  <th scope="col">단위 전환 구간</th>
                  <th scope="col">행 선택 INP</th>
                  <th scope="col">행 선택 구간</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((key) => {
                  const unit = find(inpRows, key, 'unit', rate)
                  const select = find(inpRows, key, 'select', rate)
                  const [a, p] = key.split('|') as [Approach, Placement]
                  const phases = (row?: InpRow) => row?.inpMs == null ? '16 ms 미만' : `${number.format(row.inputDelayMs ?? 0)} · ${number.format(row.processingMs ?? 0)} · ${number.format(row.presentationMs ?? 0)}`
                  return (
                    <tr key={key} className={selected(key) ? styles.selectedResult : undefined}>
                      <th scope="row"><span lang="en">{label({ approach: a, placement: p } as Base)}</span></th>
                      <td>{row16(unit)}</td>
                      <td>{phases(unit)}</td>
                      <td>{row16(select)}</td>
                      <td>{phases(select)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </ExperimentTable>
          </div>
        </div>
      ))}
    </section>
  )
}

function row16(row: InpRow | undefined) {
  if (!row) return '—'
  return row.inpMs === null ? '16 ms 미만' : ms(row.inpMs)
}

export function StateConclusion() {
  return (
    <>
      <p className={styles.finding}>결론은 <a href="https://github.com/callu9/personal-playground-react-ts/blob/main/docs/experiments/state-subscription/results.md#무엇을-고르나">결과 보고서</a>에 조건별로 정리했습니다. 아래는 구독 방식별 장단점입니다.</p>
      <h3 className={styles.groupTitle}>방식별 장단점</h3>
      <dl className={styles.tradeoffs}>
        <div>
          <dt lang="en">{approachLabels['context-one']}</dt>
          <dd>추가 의존성이 없고 가장 단순합니다. 값 하나가 바뀌면 그 Context를 읽는 모든 곳이 다시 렌더링됩니다.</dd>
        </div>
        <div>
          <dt lang="en">{approachLabels['context-split']}</dt>
          <dd>서로 다른 상태 사이의 불필요한 렌더링을 막습니다. 같은 상태를 읽는 컴포넌트 안에서는 행 하나만 골라 구독할 수 없습니다.</dd>
        </div>
        <div>
          <dt lang="en">{approachLabels['zustand-full']}</dt>
          <dd>쓰기는 쉽지만 선택자 없이 부르면 Context 하나와 같은 범위가 다시 렌더링됩니다.</dd>
        </div>
        <div>
          <dt lang="en">{approachLabels['zustand-selector']}</dt>
          <dd>필요한 값만 구독해 행 하나 단위로 렌더링을 좁힐 수 있습니다. 선택자가 새 객체를 돌려주지 않게 주의해야 합니다.</dd>
        </div>
      </dl>
    </>
  )
}
