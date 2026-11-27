# 차트 지연 로딩 실험 지침

[실험 목차](../README.md) · [공통 지침](../../../AGENTS.md) · [결과 보고서](results.md) · [무엇을 고르나](results.md#무엇을-고르나) · [측정 원본](evidence/)

## 비교 설계

차트가 여러 개인 화면에서 차트 모듈을 **언제 불러오고 언제 그리는지**에 따라 첫 화면, 첫 입력, 스크롤 중 입력 반응과 메모리가 어떻게 달라지는지 같은 화면으로 비교합니다. 화면은 차트 열두 개(선 8개·1,200점 2계열, 막대 4개·48점 2계열)가 2열로 놓인 한 페이지입니다. 위에는 제목·설명, sticky **Ping** 버튼, 지표 카드 6개와 서비스 표(24행)가 있어 **차트는 첫 화면(1280×900) 아래에서 시작합니다.** 차트는 `chart.js/auto`(전체 등록)로 그리고 애니메이션은 끕니다.

| 전략 | 불러오기 | 그리기 |
|---|---|---|
| **Eager** | 차트 모듈을 첫 번들에 정적 import | 마운트 직후 열두 개 모두 |
| **Split** | 별도 청크(`import()`), 마운트 직후 요청 | 청크 도착 직후 열두 개 모두 |
| **Viewport** | 별도 청크, 카드가 뷰포트 200px 안에 들어올 때 처음 요청 | 그 카드부터 |
| **Viewport + idle preload** | Viewport와 같되 `load` 뒤 `requestIdleCallback`(최대 2초)으로 청크를 미리 받음 | 뷰포트에 들어올 때 |

전략마다 별도 HTML 진입점(`eager/`·`split/`·`observer/`·`idle/`)을 두어 번들 구성이 다르게 나옵니다. 페이지 컴포넌트·데이터·스타일·차트 설정은 공유합니다. [공유 화면](../../../experiments/chart-loading/shared/ChartPage.tsx) · [차트 모듈](../../../experiments/chart-loading/shared/chart-runtime.ts)

- 새 패키지 의존성은 `chart.js` 하나입니다. 비교 대상인 차트 라이브러리의 실제 초기화 비용을 보려고 추가했습니다. 다른 차트 라이브러리, 트리 셰이킹한 `chart.js` 등록은 측정하지 않았습니다.
- 차트 데이터는 시드 고정 합성 값입니다.

## 측정 지표

- **LCP**·FCP: 입력 없이 로드한 페이지에서 `largest-contentful-paint`·`paint` 관측값. 로드 3초 뒤에 읽습니다. 후보 요소는 제목 텍스트입니다(캔버스는 LCP 후보가 아닙니다).
- **차단 시간(TBT 방식)**: 탐색 시작 뒤 5초 안의 롱태스크마다 `max(0, 길이 − 50 ms)`의 합.
- **첫 입력 처리 시작**: Ping 버튼이 DOM에 생기자마자 Playwright가 클릭한 입력의 이벤트 `processingStart`(탐색 시작 기준). 같은 입력의 입력 지연(`processingStart − startTime`)도 기록합니다.
- **스크롤 중 INP**: 로드 3초 뒤 8단계로 600px씩 스크롤하며 단계마다 Ping을 눌러 얻은 상호작용 8개 중 가장 긴 이벤트 `duration`(8 ms 단위, 16 ms 미만은 기록되지 않음).
- **빈 카드 시간**: 스크롤 중 카드가 화면(여백 없음)에 처음 들어온 시각과 그 차트가 그려진 시각의 차(미리 그려졌으면 0). 첫 차트와 최대를 봅니다. 청크를 미리 받아 두는 효과가 여기에 나타납니다.
- **로드 시점 차트**: 로드 3초 뒤 `data-drawn`이 붙은 캔버스 수. 스크롤 뒤에는 전략과 무관하게 12개가 모두 그려져야 합니다.
- **JS 힙**: 로드 3초 뒤와 스크롤 뒤에 강제 GC를 한 `JSHeapUsedSize`.
- **번들**: 전략별 첫 화면 JS와 나중에 받는 JS의 gzip 합계(매니페스트 기준).

## 조건

| 조건 | 설정 | 반복 |
|---|---|---|
| `throttled` | CPU 4배 감속, 네트워크 10 Mbps·왕복 60 ms(CDP), 새 브라우저 컨텍스트 | 전략별 5회(LCP 로드, 입력·스크롤 로드 각각) |
| `plain` | 감속 없음(로컬) | 전략별 3회 |

프로덕션 빌드를 로컬 Vite 미리보기(HTTP/1.1, 압축 없음)로 서비스하고 Chrome 헤드리스(`channel: 'chrome'`) 1280×900에서 잽니다. 회차마다 전략 순서를 돌립니다.

## 화면에서 확인하기

[공통 실행 절차](../../../README.md#로컬-실행)로 서버를 켜고 [Chart loading](http://127.0.0.1:5173/experiments/chart-loading/#playground)을 엽니다. **Strategy**를 바꾸면 해당 화면이 아래에 열립니다. 개발자 도구 Network에서 `chart-runtime` 청크가 언제 요청되는지, 스크롤하면 빈 카드가 어느 순간 차트로 바뀌는지 볼 수 있습니다.

## 재실행과 원본

```sh
npm run build
npm run measure:charts
npm test -- tests/chart-loading.spec.ts --workers=1
```

`npm run measure:charts`는 `test-results/chart-dist`에 빌드한 뒤 측정하고 `test-results/chart-loading.json`에 기록합니다. `--repeats=`·`--plain-repeats=`로 반복을 바꿉니다. [측정 코드](../../../scripts/measure-chart-loading.mjs) · [Playwright 검증](../../../tests/chart-loading.spec.ts) · [측정 원본](evidence/chart-loading-benchmark.json)
