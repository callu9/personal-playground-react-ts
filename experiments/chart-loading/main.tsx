import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ExperimentFrame, ExperimentPage, ExperimentSection, ExperimentWorkbench } from '../shared/ExperimentPage'
import { strategyLabels, type Strategy } from './contract'
import { ChartConclusion, ChartOptions, ChartResults } from './Results'
import styles from './chart-loading.module.css'

function Lab() {
  const [strategy, setStrategy] = useState<Strategy>('observer')
  return (
    <ExperimentPage
      experiment="chart-loading"
      summary={{
        problem: '차트가 여러 개인 화면에서 차트 모듈을 처음부터 불러오고 모두 그리면 첫 화면과 입력이 얼마나 늦어지고, 보일 때 불러오거나 미리 받아 두면 얼마나 나아질까?',
        finding: <>Eager 대비 보일 때 그리기(Viewport)는 LCP가 <strong>404 → 304 ms</strong>, 로드 직후 차단이 <strong>260 → 0 ms</strong>, 로드 후 JS 힙이 6.8 → 1.9 MB였습니다. 청크를 미리 받으면 첫 차트의 빈 카드가 202 → 99.5 ms로 줄었습니다.</>,
        decision: '차트가 첫 화면 아래에 있으면 별도 청크로 나눠 보일 때 그립니다. 스크롤 직후의 빈 카드가 거슬리면 한가할 때 청크를 미리 받습니다.',
      }}
    >
      <ExperimentSection id="options">
        <ChartOptions />
      </ExperimentSection>
      <ExperimentSection id="playground" description="같은 열두 개 차트 화면을 네 가지 로딩 전략으로 열 수 있습니다. 전략을 바꾸면 해당 화면이 다시 열리고, 개발자 도구의 Network에서 차트 청크를 받는 시점을 볼 수 있습니다.">
        <ExperimentWorkbench>
          <section className={styles.controls} aria-label="Strategy" lang="en">
            <label>Strategy
              <select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}>
                {Object.entries(strategyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </section>
          <ExperimentFrame key={strategy} href={`./${strategy}/`} title={`${strategyLabels[strategy]} 로딩 화면`} />
        </ExperimentWorkbench>
      </ExperimentSection>
      <ExperimentSection id="conclusion">
        <ChartConclusion />
      </ExperimentSection>
      <ExperimentSection id="verification">
        <ChartResults selected={strategy} />
      </ExperimentSection>
    </ExperimentPage>
  )
}

createRoot(document.getElementById('root')!).render(<Lab />)
