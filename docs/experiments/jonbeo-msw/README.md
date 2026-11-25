# Jonbeo MSW 실험 지침

[실험 목차](../README.md) · [공통 지침](../../../AGENTS.md) · [결과 보고서](results.md) · [원본 코드 분석](results.md#원본-코드에서-확인한-경로) · [측정 원본](evidence/)

## 비교 설계

첫 화면에서 입력할 수 있게 되는 시점, 데이터가 DOM에 표시되는 시점, 로딩 후 클릭 INP를 따로 잽니다.

| 범위 | 설정과 검증 |
|---|---|
| 로컬 Playground | **MSW off / passthrough / mock** 각각에서 **Wait for worker / Render shell first**를 비교합니다. 7종목 응답, 타이머 150ms, HTTP 상태, `Content-Type`, 캐시 정책, 본문 해시를 맞춥니다. 워커가 필요한 요청은 두 방식 모두 준비 후 시작합니다. |
| 원본 Jonbeo | `d68ac41`과 `76f9ac6`의 Next.js 개발 서버를 별도로 실행합니다. 등록을 보류해 렌더링 대기 의존성을 먼저 재현하고, 시간 측정에서는 인위적인 보류를 해제합니다. 원본의 통화 전환과 Playground의 정렬은 서로 다른 상호작용입니다. |

Chrome의 첫 방문·재방문, 워커 시작·모듈 준비·등록, 응답 본문 수신, React 갱신과 DOM 반영을 구분합니다. 정렬 또는 통화 전환은 데이터 표시 후 8회 실행합니다. 초기 버튼 준비는 INP와 별도이며 테스트 컨텍스트의 INP로 실제 사용자 FID를 추정하지 않습니다.

## 화면에서 확인하기

[공통 실행 절차](../../../README.md#로컬-실행)로 서버를 켜고 [Jonbeo MSW Playground](http://127.0.0.1:5173/experiments/jonbeo-msw/#playground)를 엽니다. **Request path**와 **Initial rendering**을 선택해 **Apply**를 누릅니다. 정렬 버튼과 보유 종목 표·차트가 표시되는 시점을 확인합니다. [원본 코드 분석 화면](http://127.0.0.1:5173/experiments/jonbeo-msw/#source-analysis)에서는 렌더링 조건, 데이터 경로와 통화 전환 코드의 근거를 볼 수 있습니다.

워커의 제어 범위는 이 실험의 `worker/` 아래이며, **MSW off**와 다른 실험 페이지는 이 워커의 제어를 받지 않습니다. [워커 설정](../../../experiments/jonbeo-msw/worker-client.ts)

## 재실행과 원본

```sh
npm run build
npm run measure:msw
npm test -- tests/jonbeo-msw.spec.ts --workers=1
```

일반 벤치마크는 조건당 7회이며 Event Timing, Long Tasks, 응답 출처와 실행 환경을 `test-results/jonbeo-msw/results.json`에 저장합니다. 반복 횟수는 `MSW_BENCH_ROUNDS`로 조정할 수 있습니다.

| 확인 대상 | 원본 |
|---|---|
| Playground의 초기 비교 | [초회 기록](evidence/jonbeo-msw-benchmark.json) |
| 동일 조건 재측정과 구간 분석 | [재측정](evidence/jonbeo-msw-rerun.json) · [Chrome trace 추출값](evidence/jonbeo-msw-trace-analysis.json) |
| 원본 워커 등록 보류·해제 | [관측값](evidence/jonbeo-msw-history.json) · [재현 스크립트](../../../scripts/verify-jonbeo-source-gate.mjs) |
| 원본 반복 측정과 통화 전환 INP | [개발 서버 기록](evidence/jonbeo-source-benchmark.json) · [측정 스크립트](../../../scripts/measure-jonbeo-source.mjs) |

현재 Jonbeo 프로덕션의 입력 지연 개선 과제는 원본 저장소에서 추적합니다. [Jonbeo #9](https://github.com/callu9/jonbeo-next-ts/issues/9)

### Chrome trace 수집

프로덕션 빌드 뒤 PowerShell에서 실행합니다. trace 옵션은 첫 방문마다 Chrome CDP 기록을 추가합니다. 계측 마크만 있는 일반 측정과 trace 측정은 별도 실행으로 비교합니다.

```powershell
$env:MSW_BENCH_ROUNDS = '3'
$env:MSW_BENCH_TRACE = '1'
npm run measure:msw
Remove-Item Env:MSW_BENCH_TRACE, Env:MSW_BENCH_ROUNDS
```

`test-results/jonbeo-msw/traces/`에서 `.json.gz`를 Chrome DevTools **Performance → Load profile**로 열고 **Timings**, **Main**, **Network**를 함께 봅니다. 마크는 `jonbeo:appCommit`, `jonbeo:effect`, `jonbeo:workerStart`, `jonbeo:workerModuleReady`, `jonbeo:workerReady`, `jonbeo:request`, `jonbeo:body`, `jonbeo:stateUpdate`, `jonbeo:data` 순서입니다. `jonbeo:data`는 레이아웃 effect에서 찍은 DOM 커밋 시점입니다. [구간별 해석](results.md#chrome-trace로-확인한-구간) · [Chrome trace 사용법](https://developer.chrome.com/docs/devtools/performance/reference/) · [React useLayoutEffect](https://react.dev/reference/react/useLayoutEffect)

### Jonbeo 원본 측정

[원본 저장소](https://github.com/callu9/jonbeo-next-ts)의 `d68ac41`과 `76f9ac6`을 각각 체크아웃합니다. 두 체크아웃에서 `npm ci`를 실행하고 아래 서버를 별도 터미널에서 켭니다. 첫 컴파일을 제외하려면 각 서버의 `/api/portfolio`와 `/`에 먼저 한 번씩 요청해 HTTP 200을 확인합니다.

```sh
# d68ac41
npm run dev -- --hostname 127.0.0.1 --port 4188

# 76f9ac6
npm run dev -- --hostname 127.0.0.1 --port 4189
```

플레이그라운드 루트에서 실행합니다. 첫 스크립트는 등록 보류·해제를 검사합니다. 두 번째는 API 본문을 대조하고 새 Chrome 컨텍스트에서 통화 전환을 실행합니다. 개별 결과와 커밋별 trace는 `test-results/jonbeo-msw/source-development/`에 저장합니다.

```sh
node scripts/verify-jonbeo-source-gate.mjs http://127.0.0.1:4188/ http://127.0.0.1:4189/
node scripts/measure-jonbeo-source.mjs http://127.0.0.1:4188/ http://127.0.0.1:4189/ development
```

[원본 클론의 Chrome 측정 결과](results.md#jonbeo-원본-클론-재측정)
