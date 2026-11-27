import { createRoot } from 'react-dom/client'
import { ExperimentFrame, ExperimentOptions, ExperimentPage, ExperimentSection, ExperimentTable } from '../shared/ExperimentPage'
import { brandBuildReport, documentsFor, repositoryPath } from '../shared/experiment-documents'
import styles from './overview.module.css'

const options = [
  {
    label: 'CSS Modules + React Context',
    description: 'ThemeRegion이 Context에서 테마를 읽고 CSS 변수로 설정합니다. 모듈 CSS가 그 변수를 참조합니다.',
  },
  {
    label: 'styled-components',
    description: 'ThemeProvider로 토큰을 전달하면 스타일 함수가 색상과 글꼴을 읽어 CSS 규칙을 만듭니다.',
  },
  {
    label: 'styled-components + CSS variables',
    description: 'styled-components를 유지하되 ThemeProvider는 CSS 변수만 영역에 설정합니다. 스타일은 var(--ds-*)를 참조해 테마 값을 보간하지 않습니다.',
  },
  {
    label: 'Tailwind CSS',
    description: '@theme inline에서 CSS 변수에 별칭을 붙이고 bg-brand 같은 유틸리티를 사용합니다.',
  },
  {
    label: 'shadcn/ui + Tailwind',
    description: '가져온 Button의 bg-primary 같은 기존 클래스에 디자인 시스템의 CSS 변수를 연결합니다.',
  },
]

function BrandOverview() {
  return (
    <ExperimentPage
      experiment="brand-theme"
      summary={{
        problem: '공통 디자인 토큰을 유지하면서 계정에 따라 색상·글꼴·배경을 바꿔야 합니다. 브랜드 값을 연결하는 방식에 따라 새 토큰을 추가할 때의 수정 범위와 브라우저 비용이 달라집니다.',
        finding: <>모달 테두리 토큰 수정은 CSS Modules와 styled-components에서 각각 <strong>1곳</strong>, Tailwind 계열에서 <strong>2곳</strong>이었습니다. 테마 값을 보간하는 styled-components는 새 브랜드마다 CSS 규칙을 <strong>73개</strong> 추가했고, CSS 변수로 넘기면 <strong>0개</strong>였습니다.</>,
        decision: '등록 브랜드의 토큰 값만 바꾸는 범위에서는 CSS Modules + React Context + CSS 변수를 기본으로 제안합니다. 기존 styled-components 화면은 값을 CSS 변수로 넘기면 규칙 증가를 없앨 수 있습니다. 개발 중 색상 수정은 다섯 후보 모두 전체 새로고침을 일으켰습니다.',
      }}
    >
      <ExperimentSection id="options" description="다섯 후보는 같은 브랜드 토큰을 받고, 상세 버튼의 강조색을 각자의 방식으로 연결합니다.">
        <ExperimentOptions items={options} />
        <details className={styles.codeDisclosure}>
          <summary id="injection-title">공통 토큰 흐름과 후보별 주입 코드</summary>
          <div className={styles.sharedFlow}>
            <h3>공통 토큰 흐름</h3>
            <ol className={styles.flowSteps}>
              <li><strong>브랜드 선택</strong> <code>resolveBrand</code>가 데모 계정, 유효한 환경 변수, Grove 순으로 <code>brandId</code>를 정합니다.</li>
              <li><strong>테마 계산</strong> <code>resolveTheme</code>가 공통 토큰에 브랜드별 값을 덮어씁니다. <code>useMemo</code>의 의존성은 <code>brandId</code>입니다.</li>
              <li><strong>테마 전달</strong> 공통 대시보드가 최종 테마를 각 후보의 <code>Scope</code>에 전달합니다. 아래 예시는 모두 상세 버튼의 브랜드 강조색을 연결하는 코드입니다.</li>
            </ol>
            <figure className={styles.sourceExcerpt}>
              <figcaption>브랜드 선택과 테마 계산 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/shared/dashboard.tsx#L91-L92">dashboard.tsx</a></figcaption>
              <pre><code>{`const brandId = resolveBrand(account, import.meta.env.VITE_DEFAULT_BRAND)
const theme = useMemo(() => resolveTheme(brandId), [brandId])`}</code></pre>
            </figure>
          </div>

          <div className={styles.candidateGrid}>
            <article className={styles.candidateCode} aria-labelledby="modules-code">
              <h3 id="modules-code">CSS Modules + React Context</h3>
              <p>Context를 직접 읽는 곳은 <code>ThemeRegion</code> 한 곳입니다. 영역에 <code>--ds-*</code>를 설정하면 모듈 CSS가 상속된 변수를 사용합니다.</p>
              <figure className={styles.sourceExcerpt}>
                <figcaption>Context와 영역 연결 <a href={repositoryPath('experiments/brand-theme/css-modules/theme.tsx#L8-L18')}>css-modules/theme.tsx</a></figcaption>
                <pre><code>{`<ThemeContext.Provider value={theme}>
  <ThemeRegion className={className}
    aria-label="Operations theme" data-brand={theme.brandId}>
    {children}
  </ThemeRegion>
</ThemeContext.Provider>

// ThemeRegion
const theme = useContext(ThemeContext)
if (!theme) throw new Error('ThemeRegion needs a ThemeProvider')
return <section {...props} style={themeVariables(theme.tokens)}>
  {children}
</section>`}</code></pre>
              </figure>
              <figure className={styles.sourceExcerpt}>
                <figcaption>상세 버튼이 변수를 읽는 CSS <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/css-modules/dashboard.module.css#L74-L75">dashboard.module.css</a></figcaption>
                <pre><code>{`.action {
  /* … */
  background: var(--ds-color-accent);
  color: var(--ds-color-on-accent);
}`}</code></pre>
              </figure>
            </article>

            <article className={styles.candidateCode} aria-labelledby="styled-code">
              <h3 id="styled-code">styled-components</h3>
              <p><code>ThemeProvider</code>에 토큰 객체를 넘깁니다. <code>Region</code>의 스타일 함수가 색상과 글꼴을 읽어 CSS 규칙을 생성합니다.</p>
              <figure className={styles.sourceExcerpt}>
                <figcaption>토큰 객체 전달 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/styled-components/main.tsx#L8-L12">styled-components/main.tsx</a></figcaption>
                <pre><code>{`<ThemeProvider theme={theme.tokens}>
  <Region className={className}
    aria-label="Operations theme" data-brand={theme.brandId}>
    {children}
  </Region>
</ThemeProvider>`}</code></pre>
              </figure>
              <figure className={styles.sourceExcerpt}>
                <figcaption>상세 버튼이 토큰을 읽는 스타일 함수 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/styled-components/Region.ts#L82-L83">Region.ts</a></figcaption>
                <pre><code>{`export const Region = styled.section\`
  /* … */
  .lab-action {
    /* … */
    background: \${({ theme }) => theme.color.accent};
    color: \${({ theme }) => theme.color.onAccent};
  }
  /* … */
\``}</code></pre>
              </figure>
            </article>

            <article className={styles.candidateCode} aria-labelledby="styled-variables-code">
              <h3 id="styled-variables-code">styled-components + CSS variables</h3>
              <p><code>ThemeProvider</code>는 그대로 두고, <code>Region</code>이 <code>attrs</code>로 <code>--ds-*</code> 변수를 영역에 설정합니다. 스타일 본문에는 테마 보간이 없어 브랜드가 바뀌어도 새 클래스가 생기지 않습니다.</p>
              <figure className={styles.sourceExcerpt}>
                <figcaption>변수 주입 <a href={repositoryPath('experiments/brand-theme/styled-css-variables/Region.ts#L9-L10')}>Region.ts</a></figcaption>
                <pre><code>{`export const Region = styled.section
  .attrs(({ theme }) => ({ style: themeVariables(theme) }))\`
  /* … */
\``}</code></pre>
              </figure>
              <figure className={styles.sourceExcerpt}>
                <figcaption>상세 버튼이 변수를 읽는 스타일 <a href={repositoryPath('experiments/brand-theme/styled-css-variables/Region.ts#L82')}>Region.ts</a></figcaption>
                <pre><code>{`.lab-action {
  /* … */
  background: var(--ds-color-accent);
  color: var(--ds-color-on-accent);
}`}</code></pre>
              </figure>
            </article>

            <article className={styles.candidateCode} aria-labelledby="tailwind-code">
              <h3 id="tailwind-code">Tailwind CSS</h3>
              <p><code>Scope</code>가 영역에 <code>--ds-*</code>를 설정합니다. <code>@theme inline</code>에 연결한 별칭으로 <code>bg-brand</code> 같은 정적 유틸리티를 사용합니다.</p>
              <figure className={styles.sourceExcerpt}>
                <figcaption>영역에 CSS 변수 설정 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/tailwind/Scope.tsx#L4-L6">tailwind/Scope.tsx</a></figcaption>
                <pre><code>{`<section className={className}
  style={themeVariables(theme.tokens)}
  aria-label="Operations theme" data-brand={theme.brandId}>
  {children}
</section>`}</code></pre>
              </figure>
              <figure className={styles.sourceExcerpt}>
                <figcaption>강조색 별칭 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/tailwind/tokens.css#L1-L14">tailwind/tokens.css</a></figcaption>
                <pre><code>{`@theme inline {
  /* … */
  --color-brand: var(--ds-color-accent);
  --color-brand-soft: var(--ds-color-accent-soft);
  --color-brand-ink: var(--ds-color-accent-ink);
  --color-on-brand: var(--ds-color-on-accent);
}`}</code></pre>
              </figure>
              <figure className={styles.sourceExcerpt}>
                <figcaption>상세 버튼의 유틸리티 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/tailwind/classes.ts#L37">tailwind/classes.ts</a></figcaption>
                <pre><code>{`action: 'inline-grid size-[31px] place-items-center rounded-[7px] bg-brand p-0 text-on-brand hover:bg-brand-ink',`}</code></pre>
              </figure>
            </article>

            <article className={styles.candidateCode} aria-labelledby="shadcn-code">
              <h3 id="shadcn-code">shadcn/ui + Tailwind</h3>
              <p>Tailwind의 <code>Scope</code>와 토큰을 공유합니다. DS 강조색을 <code>primary</code>에 매핑하면 가져온 <code>Button</code>이 기존 <code>bg-primary</code> 클래스로 브랜드 색을 사용합니다.</p>
              <figure className={styles.sourceExcerpt}>
                <figcaption>공통 대시보드에 Button 연결 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/shadcn/main.tsx#L10-L17">shadcn/main.tsx</a></figcaption>
                <pre><code>{`Button: (props) => <Button {...props} size="icon-sm" />,`}</code></pre>
              </figure>
              <figure className={styles.sourceExcerpt}>
                <figcaption>컴포넌트가 쓰는 토큰 연결 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/shadcn/theme.css#L6-L13">shadcn/theme.css</a></figcaption>
                <pre><code>{`@theme inline {
  --color-primary: var(--ds-color-accent);
  --color-primary-foreground: var(--ds-color-on-accent);
  /* … */
}`}</code></pre>
              </figure>
              <figure className={styles.sourceExcerpt}>
                <figcaption>Button의 기본 변형 <a href="https://github.com/callu9/personal-playground-react-ts/blob/0a26ebe/experiments/brand-theme/shadcn/components/ui/button.tsx#L11">button.tsx</a></figcaption>
                <pre><code>{`default: "bg-primary text-primary-foreground hover:bg-primary/90",`}</code></pre>
              </figure>
            </article>
          </div>
        </details>
      </ExperimentSection>

      <ExperimentSection
        id="playground"
        description="CSS Modules 대시보드의 Demo account에서 Grove, Signal, Ember를 골라 배경색, 강조색, 글꼴을 비교할 수 있습니다."
      >
        <ExperimentFrame href="./css-modules/" title="CSS Modules 브랜드 대시보드" />
      </ExperimentSection>

      <ExperimentSection
        id="conclusion"
        description={<><strong>이 실험의 대표 구현은 CSS Modules + React Context + CSS 변수</strong>입니다. 초기 JS·CSS 합계가 가장 작았고, 브랜드 전환 시 CSS 규칙을 추가하지 않았습니다.</>}
      >
        <div className={styles.changeNote}>
          <h3>새 모달 테두리 토큰을 연결한 경우</h3>
          <p>공통 토큰 정의와 연결에 든 3개 파일의 6곳은 후보별 수정량 집계에서 제외했습니다. CSS Modules와 styled-components 두 방식은 각 후보에서 테두리 선언 한 곳을 수정했습니다. Tailwind는 이름이 있는 유틸리티를 쓰기 위해 <code>tokens.css</code>의 별칭과 <code>classes.ts</code>의 모달 클래스를 수정했습니다. shadcn/ui는 같은 두 파일을 공유해 전용 코드 수정이 없었습니다.</p>
        </div>
        <p>현재 테마를 읽는 React 컴포넌트는 <code>ThemeRegion</code> 한 곳입니다. CSS 변수를 영역에 직접 주입하면 읽어야 할 경로를 줄일 수 있습니다.</p>
        <h3 id="tradeoffs-title" className={styles.subheading}>후보별 장단점</h3>
        <ExperimentTable label="후보별 장단점">
          <thead><tr><th scope="col">후보</th><th scope="col">장점</th><th scope="col">비용과 제약</th></tr></thead>
          <tbody>
            <tr className={styles.selected}>
              <th scope="row">CSS Modules<br />+ React Context</th>
              <td>파일 단위로 스타일을 격리하고 기존 디자인 토큰을 CSS 변수로 연결하기 쉽습니다.</td>
              <td>컴포넌트 변형과 포커스 등 상태별 CSS를 직접 관리합니다.</td>
            </tr>
            <tr>
              <th scope="row">styled-components</th>
              <td>타입이 있는 테마와 props를 받아 스타일 규칙을 직접 계산할 수 있습니다.</td>
              <td>이 구현은 새 브랜드에서 CSS 규칙을 생성하며, 런타임 라이브러리가 JS 번들에 포함됩니다.</td>
            </tr>
            <tr>
              <th scope="row">styled-components<br />+ CSS variables</th>
              <td>기존 styled-components 코드와 컴포넌트 경계를 유지하면서 브랜드 전환에서 규칙을 만들지 않습니다. 테두리 토큰은 선언 한 곳을 수정했습니다.</td>
              <td>styled-components 런타임이 번들에 남습니다. 스타일에서 테마 값을 props처럼 계산할 수 없어 변수 이름을 직접 관리합니다.</td>
            </tr>
            <tr>
              <th scope="row">Tailwind CSS</th>
              <td>기존 유틸리티와 토큰을 활용해 반응형·상태 스타일을 조합하기 쉽습니다.</td>
              <td>시맨틱 토큰 매핑과 클래스 탐지 범위를 관리해야 합니다.</td>
            </tr>
            <tr>
              <th scope="row">shadcn/ui + Tailwind</th>
              <td>Button, Card, Badge처럼 요구에 맞는 컴포넌트의 소스와 사용 패턴을 재사용할 수 있습니다.</td>
              <td>가져온 컴포넌트의 기본 스타일과 전환을 디자인 시스템에 맞추고 변경 사항을 직접 관리합니다.</td>
            </tr>
          </tbody>
        </ExperimentTable>
      </ExperimentSection>

      <ExperimentSection id="verification">
        <h3 id="performance-title" className={styles.subheading}>성능과 빌드 크기</h3>
        <ExperimentTable label="성능과 빌드 크기">
          <thead>
            <tr>
              <th scope="col">후보</th>
              <th scope="col">초기 JS+CSS<br />gzip</th>
              <th scope="col">Vite 빌드<br />중앙값</th>
              <th scope="col">개발 중 색상 수정<br />첫 반영 중앙값</th>
              <th scope="col">브랜드 전환<br />스타일 정착 중앙값</th>
              <th scope="col">새 브랜드<br />추가 CSS 규칙</th>
            </tr>
          </thead>
          <tbody>
            <tr className={styles.selected}><th scope="row">CSS Modules<br />+ React Context</th><td>77,558 B</td><td>170 ms</td><td>128 ms</td><td>16.6 ms</td><td>0</td></tr>
            <tr><th scope="row">styled-components</th><td>87,713 B</td><td>162 ms</td><td>30 ms</td><td>16.7 ms</td><td>73</td></tr>
            <tr><th scope="row">styled-components<br />+ CSS variables</th><td>87,723 B</td><td>162 ms</td><td>35 ms</td><td>16.7 ms</td><td>0</td></tr>
            <tr><th scope="row">Tailwind CSS</th><td>81,219 B</td><td>168 ms</td><td>48 ms</td><td>16.7 ms</td><td>0</td></tr>
            <tr><th scope="row">shadcn/ui + Tailwind</th><td>95,462 B</td><td>182 ms</td><td>160 ms</td><td>166.9 ms</td><td>0</td></tr>
          </tbody>
        </ExperimentTable>
        <p className={styles.measurementNote}>2026-11-26 macOS(Apple M2) · Node v24.18.0 · Chrome 158.0.8127.37에서 다섯 후보를 같은 조건으로 다시 잰 값입니다. 이전 Windows 측정은 결과 보고서에 따로 있습니다. Vite 빌드(7회)는 shadcn/ui를 뺀 네 후보의 범위가 겹쳤고, 개발 중 색상 수정(3회)은 측정마다 편차가 커 순위로 읽지 않습니다. 스타일 정착 시간은 글꼴과 버튼·페이지의 배경색이 목표 값에 도달할 때까지 잰 값입니다. Provider 자체 비용은 별도로 측정하지 않았으며, shadcn/ui 결과에는 버튼의 150 ms 색상 전환 효과가 포함됩니다.</p>
        <p className={styles.measurementNote}><a href={`${documentsFor('brand-theme').report}#브라우저와-빌드`}>브라우저 측정 기록</a> · <a href={brandBuildReport}>빌드·개발 반영·런타임 상세</a></p>
      </ExperimentSection>
    </ExperimentPage>
  )
}

createRoot(document.getElementById('root')!).render(<BrandOverview />)
