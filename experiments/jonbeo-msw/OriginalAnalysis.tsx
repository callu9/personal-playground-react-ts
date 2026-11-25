import { originalResults } from './recorded'
import styles from './lab.module.css'

const repo = 'https://github.com/callu9/jonbeo-next-ts'
const before = `${repo}/blob/d68ac41/src`
const report = 'https://github.com/callu9/personal-playground-react-ts/blob/feature/jonbeo-msw-performance/docs/experiments/jonbeo-msw/results.md'

export function OriginalAnalysis() {
  return (
    <div className={styles.originalAnalysis}>
      <p className={styles.analysisIntro}>
        Jonbeo의 <code>d68ac41</code>과 바로 다음 <code>76f9ac6</code>을 직접 비교했습니다. 아래 근거는 원본 Next.js 개발 서버와 코드에서 확인했습니다.
      </p>
      <article>
        <h3>첫 화면을 막은 조건</h3>
        <p>
          <code>RootLayout</code>의 <code>Providers</code> 안에서 <code>MSWComponent</code>가 페이지 전체를 감쌉니다.
          최초 렌더에서 <code>mswReady</code>는 <code>false</code>입니다. 개발 모드의 브라우저에서
          <code> initMocks()</code>가 MSW 모듈을 가져오고 <code>worker.start()</code>까지 끝나야 자식을 렌더링합니다.
        </p>
        <pre><code>if (!mswReady) return null;</code></pre>
        <p>
          Chrome에서 워커 등록을 보류하면 변경 전에는 제목과 종목이 DOM에 없었고 등록을 재개하자 나타났습니다.
          변경 후에는 레이아웃의 초기화 호출과 Provider의 이 조건이 제거되어 등록을 호출하지 않고 제목과 종목이 나타났습니다.
        </p>
        <p>
          별도 반복 측정에서 제목이 DOM에 나타난 시간은 <strong>{originalResults.titleSeconds[0]}초 → {originalResults.titleSeconds[1]}초</strong>였습니다.
          변경 전 탐색부터 등록 호출까지는 {originalResults.navigationToRegisterSeconds}초, 호출부터 mock 활성화까지는 {originalResults.registerToEnabledMs} ms였습니다.
          첫 화면에는 개발 번들의 로드·실행과 그 뒤의 렌더링도 포함됩니다.
        </p>
        <div className={styles.sourceLinks}>
          <a href={`${before}/providers/MSWComponent.tsx#L6-L20`}>Provider의 초기 렌더링 조건</a>
          <a href={`${before}/mocks/index.ts#L1-L9`}>개발 모드의 워커 시작 경로</a>
          <a href={`${repo}/commit/76f9ac6`}>초기화 호출과 Provider 제거 diff</a>
        </div>
      </article>
      <article>
        <h3>종목 데이터가 들어온 경로</h3>
        <p>
          두 커밋 모두 서버의 <code>PortfolioPage</code>가 <code>getPortfolio()</code> → <code>getPortfolioData()</code>로
          <code> portfolio.json</code>을 읽고 그 결과를 클라이언트 컴포넌트에 전달했습니다.
          원본 측정 14회에서 브라우저의 <code>/api/portfolio</code>와 <code>/portfolio</code> 요청은 총 <strong>0건</strong>이었습니다.
        </p>
        <p>
          150 ms 지연은 별도 mock 핸들러에 있습니다. 서버 HTTP 요청을 fixture 읽기로 바꾼 시점은 앞선 <code>48ccd38</code>입니다.
          이번 원본 성능 수치는 그 변경 이후 두 커밋의 비교입니다.
        </p>
        <div className={styles.sourceLinks}>
          <a href={`${before}/app/page.tsx#L16-L32`}>서버 페이지와 props 전달</a>
          <a href={`${before}/data/portfolio.ts#L1-L6`}>fixture 읽기</a>
          <a href={`${before}/mocks/handler/portfolio.ts#L4-L11`}>150 ms mock 핸들러</a>
          <a href={`${repo}/commit/48ccd38`}>앞선 데이터 경로 변경</a>
        </div>
      </article>
      <article>
        <h3>화면이 뜬 뒤 통화 전환이 느린 구간</h3>
        <p>
          <code>UnitButton</code>을 누르면 Zustand의 <code>isWon</code>이 바뀌고 이를 구독하는 계정 금액과 종목 행이 갱신됩니다.
          두 커밋에서 이 경로는 같습니다. Chrome의 INP 중앙값은 {originalResults.inpMs[0]} → {originalResults.inpMs[1]} ms였고,
          가장 긴 구간은 <strong>이벤트 처리 {originalResults.eventProcessingMs[0]} → {originalResults.eventProcessingMs[1]} ms</strong>였습니다.
        </p>
        <p>trace에서 React 개발 빌드 호출을 확인했습니다. 개별 컴포넌트 비용과 원본 프로덕션 성능은 따로 측정하지 않았습니다.</p>
        <div className={styles.sourceLinks}>
          <a href={`${before}/components/UnitButton.tsx#L4-L14`}>통화 버튼의 클릭 처리</a>
          <a href={`${before}/store/unitStore.ts#L8-L12`}>Zustand 상태 변경</a>
          <a href={`${before}/components/portfolio/StockListItem.tsx#L19-L52`}>종목 행의 구독과 금액 표시</a>
        </div>
      </article>
      <div className={styles.sourceLinks}>
        <a href="#source-results-title">원본 Chrome 측정표</a>
        <a href={report}>측정 보고서와 원시 데이터</a>
      </div>
    </div>
  )
}
