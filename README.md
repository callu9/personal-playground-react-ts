# Personal React + TypeScript Playground

같은 조건에서 React 구현 후보를 비교하고 로컬 검증 근거를 기록하는 저장소입니다.

## 실험

| 실험 | 비교 질문 | 결과 | 로컬 화면 경로 | 기준 측정 |
|---|---|---|---|---|
| 브랜드 테마 | 같은 디자인 토큰을 CSS Modules, styled-components, Tailwind CSS, shadcn/ui에 적용하면 수정·빌드·브라우저 비용이 어떻게 달라지는가? | [브랜드 테마 결과](docs/experiments/brand-theme/results.md) | `/experiments/brand-theme/` | `npm run measure` |
| 대시보드 결과 자동 조회 | 고정 폴링, 적응형 폴링, SSE의 반영 지연·요청량·단절 복구는 어떻게 다른가? | [대시보드 자동 조회 결과](docs/experiments/dashboard-refresh/results.md) | `/experiments/dashboard-refresh/` | `npm run measure:refresh` |
| Jonbeo MSW | MSW 세 요청 경로와 워커 준비 대기가 화면·버튼 준비 시간과 로딩 후 INP에 어떤 영향을 주는가? | [Jonbeo MSW 결과](docs/experiments/jonbeo-msw/results.md) | `/experiments/jonbeo-msw/` | `npm run measure:msw` |

세 실험의 자료와 공통 기록 기준은 [실험 문서](docs/experiments/README.md)에서 볼 수 있습니다.

## 로컬 실행

Node.js 24와 Google Chrome을 사용했습니다.

```sh
npm ci
npm run dev
```

Vite가 출력한 주소에서 실험을 선택합니다. 위 표의 경로를 그 주소에 붙여 바로 열 수도 있습니다.

- **Brand style runtime**에서 대표 화면과 네 구현의 비교표를 봅니다. **대시보드 열기**를 누른 뒤 **Demo account**에서 Grove, Signal, Ember를 전환할 수 있습니다. 같은 탭에서 새로고침하면 선택한 계정이 유지됩니다. **Signed out**을 고르면 기본 브랜드가 적용됩니다.
- **Dashboard auto refresh**에서는 조회 방식과 시나리오를 고른 뒤 **Start run**을 누릅니다. 가상 작업의 상태와 화면이 반영한 버전을 볼 수 있습니다.
- **Jonbeo MSW performance**에서는 MSW 끔·요청 통과·모의 응답을 고르고, 워커를 기다린 뒤 포트폴리오를 그리는 방식과 화면을 먼저 그리는 방식을 비교합니다.

## 브랜드 테마 화면

CSS Modules 대시보드의 배경색, 강조색, 글꼴을 브랜드별로 비교할 수 있습니다. 상단의 **Page background**는 배경의 적용 출처를 표시합니다. 이미지를 누르면 원본을 볼 수 있습니다.

| Grove · 공통 배경 | Signal · 브랜드 배경 | Ember · 브랜드 배경 |
|---|---|---|
| [![공통 배경의 Grove 대시보드](screenshots/grove.jpg)](screenshots/grove.jpg) | [![블루 바이올렛 배경의 Signal 대시보드](screenshots/signal.jpg)](screenshots/signal.jpg) | [![피치 배경의 Ember 대시보드](screenshots/ember.jpg)](screenshots/ember.jpg) |

브랜드 적용 우선순위는 **데모 계정 브랜드 → 유효한 환경 변수 → Grove**입니다. 기본 브랜드를 바꾸려면 [환경 변수 예시](.env.example)를 참고해 `.env.local`에 `VITE_DEFAULT_BRAND=signal` 등을 설정합니다. 프로덕션 빌드의 기본값을 바꾸려면 다시 빌드합니다.

## 검증 및 측정

```sh
npm test
npm run build
```

테스트는 설치된 Chrome을 새 테스트 컨텍스트에서 실행합니다. 빌드 후 표에서 필요한 측정 명령을 실행합니다. 각 명령은 `dist`로 로컬 미리보기 서버를 열고 결과를 저장합니다.

| 측정 명령 | 출력 |
|---|---|
| `npm run measure` | `test-results/theme-benchmark.json` 및 후보별 대시보드 캡처 |
| `npm run measure:refresh` | `test-results/dashboard-refresh.json` |
| `npm run measure:msw` | `test-results/jonbeo-msw/results.json` |

Jonbeo 결과 문서에 [Chrome trace 수집](docs/experiments/jonbeo-msw/results.md#chrome-trace-수집)과 [원본 클론 측정](docs/experiments/jonbeo-msw/results.md#jonbeo-원본-측정) 절차도 있습니다.

## 저장소 구조

- [실험 코드](experiments/)는 `experiments/<주제>/`에 자체 진입점을 두고 하나의 npm 패키지로 의존성을 관리합니다.
- [브랜드 디자인 시스템](experiments/brand-theme/shared/design-system/)의 `tokens.ts`는 공통값, `brands.ts`는 브랜드별 변경값, `theme.ts`는 네 후보가 받는 최종 테마와 CSS 변수 매핑을 정의합니다. 각 후보는 자체 HTML과 스타일 진입점을 가지며 Tailwind와 shadcn/ui는 유틸리티 정의를 공유합니다.
- [실험 문서](docs/experiments/)는 코드와 같은 주제 이름의 폴더에 `results.md`와 측정 원본을 둡니다.
