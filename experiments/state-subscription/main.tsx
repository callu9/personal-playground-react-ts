import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ExperimentPage, ExperimentSection, ExperimentWorkbench } from '../shared/ExperimentPage'
import { approachLabels, countedComponents, experimentPath, placementLabels, rowCounts } from './contract'
import { StateConclusion, StateOptions, Results } from './Results'
import { renders, settings, StockScreen } from './screen'
import './inp'
import styles from './state-subscription.module.css'

function setSetting(name: string, value: string) {
  const query = new URLSearchParams(window.location.search)
  query.set(name, value)
  window.location.assign(`${experimentPath}?${query}#playground`)
}

function RenderCounts() {
  const [counts, setCounts] = useState<typeof renders | null>(null)
  return (
    <div className={styles.counter} lang="en">
      <button type="button" onClick={() => setCounts({ ...renders })}>Show render counts</button>
      <button type="button" onClick={() => { for (const name of countedComponents) renders[name] = 0; setCounts({ ...renders }) }}>Reset counts</button>
      {counts && <dl data-testid="render-counts">{countedComponents.map((name) => <div key={name}><dt>{name}</dt><dd data-testid={`count-${name}`}>{counts[name]}</dd></div>)}</dl>}
    </div>
  )
}

function Lab() {
  return (
    <ExperimentPage
      experiment="state-subscription"
      summary={{
        problem: '통화 단위 하나를 바꿀 때 입력 반응의 대부분이 이벤트 처리였다면, 상태 구독 방식이나 구독 위치를 바꾸면 행 수가 늘어도 입력 반응이 얼마나 달라질까?',
        finding: <>행 1,000개·CPU 4배 감속에서 단위 전환 INP는 행이 구독하면 네 방식 모두 <strong>192~208 ms</strong>로 같았고, 금액 셀만 구독하면 <strong>144~160 ms</strong>였습니다. 행 하나만 바뀌는 선택은 Zustand selector가 <strong>64 ms</strong>로 줄이고 나머지는 112~120 ms였습니다.</>,
        decision: '모든 행이 바뀌는 상태는 구독 방식보다 구독 위치와 행 수를 줄이는 쪽이 효과가 있고, 일부 행만 바뀌는 상태에서 행이 100개 이상이면 Zustand selector를 고릅니다.',
      }}
    >
      <ExperimentSection id="options">
        <StateOptions />
      </ExperimentSection>
      <ExperimentSection id="playground" description="같은 종목 목록을 네 가지 구독 방식과 두 가지 구독 위치, 세 가지 행 수로 열 수 있습니다. 단위 전환과 행 선택을 눌러 렌더링 횟수를 확인합니다.">
        <ExperimentWorkbench>
          <section className={styles.controls} aria-label="Screen settings" lang="en">
            <label>Approach
              <select value={settings.approach} onChange={(event) => setSetting('approach', event.target.value)}>
                {Object.entries(approachLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Placement
              <select value={settings.placement} onChange={(event) => setSetting('placement', event.target.value)}>
                {Object.entries(placementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Rows
              <select value={settings.rows} onChange={(event) => setSetting('rows', event.target.value)}>
                {rowCounts.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </section>
          <div className={styles.screen}><StockScreen /></div>
          <RenderCounts />
        </ExperimentWorkbench>
      </ExperimentSection>
      <ExperimentSection id="conclusion">
        <StateConclusion />
      </ExperimentSection>
      <ExperimentSection id="verification">
        <Results rowCount={settings.rows} approach={settings.approach} placement={settings.placement} />
      </ExperimentSection>
    </ExperimentPage>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing state subscription mount')
createRoot(root).render(<Lab />)
