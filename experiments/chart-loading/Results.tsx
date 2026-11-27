import { aggregate, bundles, environment as measuredEnvironment } from '../../docs/experiments/chart-loading/evidence/chart-loading-benchmark.json'
import { ExperimentOptions, ExperimentTable } from '../shared/ExperimentPage'
import { strategyLabels, type Strategy } from './contract'
import styles from './chart-loading.module.css'

interface Range { median: number; min: number; max: number }
interface Row {
  condition: 'throttled' | 'plain'; strategy: Strategy; paintLoads: number; inputLoads: number
  lcpMs: Range; blockingMs: Range; longTaskCount: Range; drawnAtLoad: Range; drawnAfterScroll: Range
  firstInputProcessingStartMs: Range; firstInputDelayMs: Range; scrollInpMs: Range; firstBlankMs: Range; maxBlankMs: Range; heapAfterLoadMb: Range; heapAfterScrollMb: Range; scriptKbBeforeLcp: Range
}
interface Bundle { initialJs: { gzipBytes: number }[]; deferredJs: { gzipBytes: number }[] }
const environment = measuredEnvironment as Partial<Record<'platform' | 'cpu' | 'node' | 'chrome' | 'chartjs' | 'react', string>>
const rows = aggregate as unknown as Row[]
const bundleBytes = bundles as unknown as Record<Strategy, Bundle>

const strategyDescription: Record<Strategy, string> = {
  eager: '차트 모듈을 첫 번들에 정적으로 넣고 마운트 직후 열두 개를 모두 그립니다.',
  split: '차트 모듈을 별도 청크로 나누지만 마운트 직후 청크를 받아 열두 개를 모두 그립니다.',
  observer: '차트 모듈을 별도 청크로 나누고, 카드가 뷰포트 200px 안에 들어올 때 청크를 받아 그 차트를 그립니다.',
  idle: 'Viewport와 같지만 load 뒤 브라우저가 한가할 때 청크를 미리 받아 둡니다. 그리는 시점은 여전히 뷰포트입니다.',
}

export function ChartOptions() {
  return (
    <>
      <h3 className={styles.groupTitle}>로딩 전략 <span lang="en">Strategy</span></h3>
      <ExperimentOptions items={(Object.keys(strategyLabels) as Strategy[]).map((id) => ({
        label: <span lang="en">{strategyLabels[id]}</span>, description: strategyDescription[id],
      }))} />
      <p className={styles.note}>화면은 차트 열두 개(선 8개, 막대 4개)가 2열로 놓인 한 페이지이며, 위쪽의 제목·Ping 버튼·지표 카드·서비스 표가 먼저 보이고 차트는 첫 화면 아래에서 시작합니다. 차트는 <code>chart.js/auto</code>로 그립니다.</p>
    </>
  )
}

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 })
const cell = (range: Range | undefined, unit = '') => range ? `${number.format(range.median)}${unit} (${number.format(range.min)}–${number.format(range.max)})` : '—'
const kb = (bytes: number) => `${number.format(Math.round(bytes / 10) / 100)} kB`

export function ChartResults({ selected }: { selected: Strategy }) {
  const conditions = [['throttled', 'CPU 4배 감속 · 10 Mbps · 왕복 60 ms'], ['plain', '감속 없음 · 로컬']] as const
  return (
    <section id="chart-results" className={styles.results} aria-labelledby="chart-results-title">
      <h3 id="chart-results-title">전략별 측정 결과</h3>
      <p>{environment.platform ? `${environment.platform} · ${environment.cpu} · Node ${environment.node} · Chrome ${environment.chrome} · Chart.js ${environment.chartjs} · React ${environment.react}` : '측정 원본 없음'} · 값은 중앙값(최소–최대)입니다.</p>
      <div className={styles.resultsCard}>
        <h4>번들 크기 · gzip</h4>
        <div className={styles.resultTable}>
          <ExperimentTable label="번들 크기">
            <thead><tr><th scope="col">전략</th><th scope="col">첫 화면 JS</th><th scope="col">나중에 받는 JS</th></tr></thead>
            <tbody>
              {(Object.keys(strategyLabels) as Strategy[]).map((id) => (
                <tr key={id} className={id === selected ? styles.selectedResult : undefined}>
                  <th scope="row"><span lang="en">{strategyLabels[id]}</span></th>
                  <td>{bundleBytes[id] ? kb(bundleBytes[id].initialJs.reduce((sum, file) => sum + file.gzipBytes, 0)) : '—'}</td>
                  <td>{bundleBytes[id]?.deferredJs.length ? kb(bundleBytes[id].deferredJs.reduce((sum, file) => sum + file.gzipBytes, 0)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </ExperimentTable>
        </div>
      </div>
      {conditions.map(([condition, title]) => {
        const list = rows.filter((row) => row.condition === condition)
        return (
          <div className={styles.resultsCard} key={condition}>
            <h4>{title}</h4>
            <p>로드 {list[0]?.paintLoads ?? 0}회(LCP·롱태스크·힙), 입력·스크롤 로드 {list[0]?.inputLoads ?? 0}회.</p>
            <div className={styles.resultTable}>
              <ExperimentTable label={`로딩 전략 측정 ${condition}`}>
                <thead>
                  <tr>
                    <th scope="col">전략</th>
                    <th scope="col">LCP</th>
                    <th scope="col">차단 시간(TBT 방식)</th>
                    <th scope="col">첫 입력 처리 시작</th>
                    <th scope="col">스크롤 중 INP</th>
                    <th scope="col">첫 차트 빈 카드 시간</th>
                    <th scope="col">빈 카드 최대</th>
                    <th scope="col">로드 시점 차트</th>
                    <th scope="col">JS 힙 로드 후</th>
                    <th scope="col">JS 힙 스크롤 후</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.strategy} className={row.strategy === selected ? styles.selectedResult : undefined}>
                      <th scope="row"><span lang="en">{strategyLabels[row.strategy]}</span></th>
                      <td>{cell(row.lcpMs, ' ms')}</td>
                      <td>{cell(row.blockingMs, ' ms')}</td>
                      <td>{cell(row.firstInputProcessingStartMs, ' ms')}</td>
                      <td>{cell(row.scrollInpMs, ' ms')}</td>
                      <td>{cell(row.firstBlankMs, ' ms')}</td>
                      <td>{cell(row.maxBlankMs, ' ms')}</td>
                      <td>{cell(row.drawnAtLoad)}</td>
                      <td>{cell(row.heapAfterLoadMb, ' MB')}</td>
                      <td>{cell(row.heapAfterScrollMb, ' MB')}</td>
                    </tr>
                  ))}
                </tbody>
              </ExperimentTable>
            </div>
          </div>
        )
      })}
      <p className={styles.dataNote}>LCP는 입력 없이 로드한 페이지에서, 첫 입력·스크롤 INP·빈 카드 시간은 Ping 버튼이 생기자마자 누르고 8번 스크롤하며 누른 별도 로드에서 잰 값입니다. 빈 카드 시간은 카드가 화면에 들어온 뒤 차트가 그려지기까지이며 미리 그려 둔 차트는 0입니다.</p>
    </section>
  )
}

export function ChartConclusion() {
  return (
    <>
      <p className={styles.finding}>결론은 <a href="https://github.com/callu9/personal-playground-react-ts/blob/main/docs/experiments/chart-loading/results.md#무엇을-고르나">결과 보고서</a>에 조건별로 정리했습니다. 아래는 전략별 장단점입니다.</p>
      <h3 className={styles.groupTitle}>전략별 장단점</h3>
      <dl className={styles.tradeoffs}>
        <div><dt lang="en">{strategyLabels.eager}</dt><dd>가장 단순하고 스크롤 중 지연이 없습니다. 첫 화면 JS가 크고 모든 차트의 그리기가 첫 입력 앞에 몰립니다.</dd></div>
        <div><dt lang="en">{strategyLabels.split}</dt><dd>첫 번들은 작아지지만 열두 개를 한꺼번에 그리는 비용은 그대로입니다.</dd></div>
        <div><dt lang="en">{strategyLabels.observer}</dt><dd>첫 화면에서 그릴 차트와 JS 힙이 줄지만 스크롤 중 청크 요청과 첫 그리기가 입력과 겹칠 수 있습니다.</dd></div>
        <div><dt lang="en">{strategyLabels.idle}</dt><dd>스크롤 전에 청크가 도착해 첫 스크롤의 대기를 줄이는 대신 한가한 시간에 네트워크와 파싱을 씁니다.</dd></div>
      </dl>
    </>
  )
}
