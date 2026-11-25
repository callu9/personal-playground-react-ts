# Personal React + TypeScript Playground

React 구현 후보를 같은 조건에서 비교하고 검증 근거를 남기는 저장소입니다.

## 목차

- [로컬 실행](#로컬-실행)
- [실험](#실험)
- [공통 작업 지침](AGENTS.md)
- [저장소 구조](#저장소-구조)

## 로컬 실행

Node.js 24와 Google Chrome으로 실행합니다.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

[React playground](http://127.0.0.1:5173/)에서 실험을 선택합니다. 다른 포트를 사용하면 문서의 화면 링크에 적힌 경로를 해당 서버 주소에 붙입니다.

## 실험

| 실험 | 로컬 Playground | 실험 지침 | 결과 보고서 |
|---|---|---|---|
| 브랜드 테마 | [Brand style runtime](http://127.0.0.1:5173/experiments/brand-theme/#playground) | [설계·실행·화면 캡처](docs/experiments/brand-theme/README.md) | [후보 비교와 추천](docs/experiments/brand-theme/results.md) |
| 대시보드 실시간 갱신 | [Dashboard auto refresh](http://127.0.0.1:5173/experiments/dashboard-refresh/#playground) | [조건과 계측 방법](docs/experiments/dashboard-refresh/README.md) | [폴링·SSE 비교와 사용 목적별 선택](docs/experiments/dashboard-refresh/results.md) |
| Jonbeo MSW | [Jonbeo MSW performance](http://127.0.0.1:5173/experiments/jonbeo-msw/#playground) | [Playground·원본 재현 방법](docs/experiments/jonbeo-msw/README.md) | [코드 분석과 Chrome 측정](docs/experiments/jonbeo-msw/results.md) |

[실험 문서 목차](docs/experiments/README.md)에서 개별 측정 원본과 브라우저 화면의 핵심 구간도 찾을 수 있습니다.

## 저장소 구조

| 위치 | 내용 |
|---|---|
| [`experiments/`](experiments/) | 실험별 코드와 진입점, 공통 화면·문서 링크 |
| [`docs/experiments/`](docs/experiments/) | 실험 지침, 결과 보고서, `evidence/` 측정 원본 |
| [`scripts/`](scripts/) | 벤치마크와 원본 프로젝트 재현 스크립트 |
| [`tests/`](tests/) | Chrome·Playwright 검증. 전체 실행은 `npm test`, 프로덕션 빌드는 `npm run build` |
| [`screenshots/`](screenshots/) | 문서에서 연결하는 화면 캡처 |
