# Personal React + TypeScript Playground

## 프로젝트 개요

React와 TypeScript로 서로 다른 프론트엔드 질문을 작은 단위로 실험하는 저장소입니다. 후보마다 같은 화면과 데이터를 사용해 **구현·수정에 드는 시간, 코드 복잡도, 브라우저·서버 비용**을 비교합니다. 어떤 조건에서 무엇을 선택할지와 그 판단의 근거를 실험별 보고서에 남깁니다.

현재 주제는 브랜드 테마 주입, 대시보드 실시간 갱신, Jonbeo의 MSW 초기화와 입력 반응입니다. React·TypeScript·Vite 의존성은 하나의 npm 패키지에서 관리하며, 실험마다 독립 진입점을 둡니다. 브라우저 검증은 Chrome과 Playwright로 실행합니다.

[폴더 구조](#폴더-구조) · [따르는 지침](#따르는-지침) · [로컬 실행](#로컬-실행) · [실험 목록](#실험)

## 폴더 구조

| 경로 | 역할 |
|---|---|
| [`experiments/<실험명>/`](experiments/) | 실험별 화면, 스타일 진입점과 비교 구현 |
| [`experiments/shared/`](experiments/shared/) | 화면 골격, 실험 이동, 문서 링크 |
| [`docs/experiments/<실험명>/`](docs/experiments/) | `README.md`에 비교 설계와 재현 절차, `results.md`에 판단과 측정값, `evidence/`에 측정 원본 |
| [`scripts/`](scripts/) | 측정 자동화와 원본 프로젝트 재현 |
| [`tests/`](tests/) | 화면 동작, 실험 간 격리, 문서 연결 검증 |
| [`screenshots/`](screenshots/) | 실험 지침에서 인용하는 화면 캡처 |

## 따르는 지침

- **실험 격리.** 실험마다 HTML 진입점과 스타일 범위를 둡니다. 함께 쓰는 UI·토큰·데이터가 비교에 영향을 주면 실험 지침에 기록합니다.
- **같은 조건에서 비교.** 후보가 같은 화면과 데이터로 동작하게 하고, 바꾸는 조건과 관측 지표를 먼저 정합니다. 구현·수정 시간, 브라우저 반영 시간, 검증 완료 시간은 각각 기록합니다.
- **검증 근거 남기기.** 실행 환경, 반복 횟수, 단위와 원본 경로를 결과에 붙입니다. 로컬 모의 실험, 원본 프로젝트 재현, 운영 관측을 구분하고 측정하지 않은 값은 미측정으로 표시합니다.
- **화면과 문서를 함께 갱신.** 각 실험의 화면에서 지침·보고서·측정 원본을 열 수 있게 하고, 문서에서 관련 Playground로 돌아갈 수 있게 합니다.

[프로젝트 공통 지침 전문](AGENTS.md) · [실험 문서 목차](docs/experiments/README.md)

## 로컬 실행

세 실험이 있는 [통합 브랜치](https://github.com/callu9/personal-playground-react-ts/tree/feature/jonbeo-msw-performance)에서 Node.js 24와 Google Chrome으로 실행합니다. 처음 내려받을 때는 다음 명령을 사용합니다.

```sh
git clone --branch feature/jonbeo-msw-performance https://github.com/callu9/personal-playground-react-ts.git
cd personal-playground-react-ts
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

[React playground](http://127.0.0.1:5173/)에서 실험을 선택합니다. 다른 포트를 사용하면 문서의 화면 링크에 적힌 경로를 해당 서버 주소에 붙입니다.

전체 Chrome 검증은 `npm test`, 프로덕션 빌드는 `npm run build`로 실행합니다. 실험별 계측 명령은 아래 지침에 있습니다.

## 실험

| 실험 | 로컬 Playground | 실험 지침 | 결과 보고서 |
|---|---|---|---|
| 브랜드 테마 | [Brand style runtime](http://127.0.0.1:5173/experiments/brand-theme/#playground) | [설계·실행·화면 캡처](docs/experiments/brand-theme/README.md) | [후보 비교와 추천](docs/experiments/brand-theme/results.md) |
| 대시보드 실시간 갱신 | [Dashboard auto refresh](http://127.0.0.1:5173/experiments/dashboard-refresh/#playground) | [조건과 계측 방법](docs/experiments/dashboard-refresh/README.md) | [폴링·SSE 비교와 사용 목적별 선택](docs/experiments/dashboard-refresh/results.md) |
| Jonbeo MSW | [Jonbeo MSW performance](http://127.0.0.1:5173/experiments/jonbeo-msw/#playground) | [Playground·원본 재현 방법](docs/experiments/jonbeo-msw/README.md) | [코드 분석과 Chrome 측정](docs/experiments/jonbeo-msw/results.md) |

[실험 문서 목차](docs/experiments/README.md)에는 실험의 핵심 화면과 측정 원본이 연결돼 있습니다.
