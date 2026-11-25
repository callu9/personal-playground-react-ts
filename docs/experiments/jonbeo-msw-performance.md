# 03. Jonbeo MSW와 입력 반응성

**원본에서는 MSW 초기화를 기다리는 렌더링 게이트 때문에 첫 화면에서 입력할 수 없었다.** 플레이그라운드에서 보유 종목 UI를 먼저 그리니 첫 방문의 버튼 준비가 요청 통과에서 **201.5ms**, 모의 응답에서 **171.2ms** 빨라졌다. 데이터가 표시된 뒤 같은 동작의 INP는 아래 표에 기록했다. 과거 사용자의 실제 입력 지연은 당시 trace가 없어 원인을 확정할 수 없다.

## 원본 코드에서 확인한 경로

1. 게이트 제거 직전 `d68ac41`에서 `MSWComponent`는 초기 상태의 `mswReady`가 `false`이면 하위 앱 전체를 렌더링하지 않았다. 개발 모드에서는 effect가 `initMocks()`를 호출하고 브라우저에서 `await worker.start()`가 끝날 때까지 이 상태가 지속된다. 등록이 실패하면 준비 상태를 갱신하는 경로도 없었다. [MSWComponent](https://github.com/callu9/jonbeo-next-ts/blob/d68ac41/src/providers/MSWComponent.tsx) · [초기화 코드](https://github.com/callu9/jonbeo-next-ts/blob/d68ac41/src/mocks/index.ts)
2. 해당 커밋의 포트폴리오 페이지는 서버 데이터 계층에서 보유 종목을 읽었다. 브라우저의 포트폴리오 mock은 별도 개발 주소에 150ms 지연을 설정했고, 화면에는 250ms를 기본값으로 하는 스켈레톤 유지 로직도 있었다. 화면이 비어 있던 시간, 스켈레톤을 표시한 시간, HTTP 응답 시간은 각각 따로 재야 한다. [페이지](https://github.com/callu9/jonbeo-next-ts/blob/d68ac41/src/app/page.tsx) · [데이터 접근](https://github.com/callu9/jonbeo-next-ts/blob/d68ac41/src/apis/portfolio.ts) · [mock 핸들러](https://github.com/callu9/jonbeo-next-ts/blob/d68ac41/src/mocks/handler/portfolio.ts) · [스켈레톤 훅](https://github.com/callu9/jonbeo-next-ts/blob/d68ac41/src/hooks/useMinLoading.tsx)
3. `76f9ac6`은 레이아웃의 `initMocks()` 호출과 Provider의 `MSWComponent` 경계를 제거했다. Jonbeo의 과거 보고서에는 이후 프로덕션 Lighthouse 기준선이 있지만, 당시 문제 입력의 FID·INP trace나 현장 표본은 저장소에서 확인되지 않았다. Lighthouse 점수는 과거 수치로만 참고했다. [게이트 제거 커밋](https://github.com/callu9/jonbeo-next-ts/commit/76f9ac6) · [Jonbeo 성능 보고서](https://github.com/callu9/jonbeo-next-ts/blob/main/docs/performance-refactoring.md)

두 커밋의 Next 개발 서버도 Chrome에서 실행했다. 등록 호출을 보류한 동안 `d68ac41`에서는 포트폴리오 제목이 보이지 않았고, 등록을 재개하자 제목과 종목을 표시했다. `76f9ac6`에서는 등록 호출 없이 등록을 보류한 상태에서도 동일한 제목과 종목을 표시했다. 이 검사는 원본 코드에서 대기의 영향만 확인했으며, 보류 시간을 성능 수치에 포함하지 않았다. [원본 실행 관측값](evidence/jonbeo-msw-history.json)

## 동일 조건 설계

| 경로 | 실제 처리 | 설정 지연 |
|---|---|---:|
| MSW 끔 | 제어 워커 없이 Vite 로컬 API 요청 | API 타이머 150ms |
| 요청 통과 | 실제 Service Worker에서 가로챈 뒤 `passthrough()`로 같은 API 요청 | 같은 API 타이머 150ms |
| 모의 응답 | 실제 Service Worker에서 가로챈 뒤 앱의 MSW 핸들러가 응답 | mock 핸들러 타이머 150ms |

- 원본과 같은 종목 수인 합성 포트폴리오 7개를 사용했다. 본문, HTTP 상태, `Content-Type`, 캐시 정책을 맞췄다. 출처 헤더와 Chrome의 `fromServiceWorker()`, controller 경로로 세 조건을 확인하고, 모든 본문의 SHA-256을 대조했다.
- **개선 전**은 준비가 끝나면 보유 종목 영역을 보여 준다. **개선 후**는 빈 목록 상태와 정렬 버튼을 즉시 마운트한다. 두 구현 모두 워커가 필요한 경로의 fetch는 준비 후에 시작한다. 원본은 앱 전체를 가렸고, 실험에서는 설정 UI를 공통으로 유지한 채 보유 종목 영역에만 같은 대기 의존성을 적용했다. [MSW 워커 시작 API](https://mswjs.io/api/setup-worker/start) · [요청 통과 API](https://mswjs.io/api/passthrough)
- API의 타이머는 Node에서 실행하고, mock 타이머는 워커가 메시지를 보낸 페이지의 MSW 핸들러에서 실행한다. 타이머 설정값을 맞춘 뒤 브라우저에서 실제 헤더 도착까지 잰다. 측정 차이에는 타이머 스케줄링, 스레드 간 메시지, HTTP 경로가 함께 포함된다.
- **입력 가능 시점**은 탐색 시작부터 보유 종목 영역과 정렬 버튼이 DOM에 커밋될 때까지다. 워커 모듈 로드를 일부러 멈춘 회귀 테스트에서는 개선 후 버튼을 눌러 상태가 변경되고 데이터를 받은 뒤에도 정렬이 유지됨을 확인했다.
- **INP**는 데이터 로딩 후 실제 Chrome 입력으로 정렬 버튼을 8회 누르고, 페이지를 벗어나 `visibilitychange`가 `hidden`이 된 뒤 `web-vitals/attribution`에서 수집한다. FID와 같은 구간인 첫 입력 대기는 `first-input`의 시작부터 처리 시작까지 따로 잰다. 시작 당시 입력이 불가능한 경우에는 버튼을 눌렀을 때의 INP 자체가 생기지 않는다. 로컬 INP는 이 입력 시나리오의 표본이며 실제 방문 p75는 측정 범위 밖이다. [Chrome INP 정의와 FID 차이](https://web.dev/articles/inp) · [web-vitals INP 및 attribution](https://github.com/GoogleChrome/web-vitals#inp)

## Chrome 측정

2026-11-25, Windows 10.0.26200, Intel(R) Core(TM) i5-14400F, 헤드리스 Chrome 158.0.8127.37, Node v24.20.0, React 19.3.1, Vite 8.3.8, MSW 3.0.7, web-vitals 6.2.3. 프로덕션 빌드, localhost, 1280×900, 페이지 대상 Chrome CPU 4배 감속, 네트워크 인위 감속 없음. 새 Chrome 컨텍스트에서 첫 방문을 잰 뒤 같은 탭에서 나갔다 돌아와 재방문을 쟀다. 실행 순서를 회차마다 한 칸씩 바꿨다. 조건별 7회, 총 84페이지에서 INP 84개를 얻었다. 전체 측정에는 183.7초가 걸렸다. 모든 응답은 465바이트였고 본문 SHA-256이 일치했다. [회차별 측정값](evidence/jonbeo-msw-benchmark.json)

### 입력 가능 시점과 응답

단위는 ms이며 모든 값은 중앙값이다. 각 셀은 게이트 적용 전후를 `개선 전 → 개선 후` 순으로 표시한다. 워커 초기화에는 동적 모듈 로드와 등록·준비가 포함되며, 데이터 표시와 버튼 준비는 탐색 시작을 기준으로 한다.

| 방문 | 경로 | 버튼 준비 | 워커 초기화 | 요청 → 헤더 | 데이터 표시 |
|---|---|---:|---:|---:|---:|
| 첫 방문 | MSW 끔 | 293 → 274.4 | — → — | 164.5 → 162.9 | 621 → 604.8 |
| 첫 방문 | 요청 통과 | 491.3 → 289.8 | 133.7 → 123.6 | 208.5 → 217.9 | 709.3 → 781.9 |
| 첫 방문 | 모의 응답 | 452.1 → 280.9 | 136 → 121.6 | 211.8 → 209.3 | 662.2 → 807.4 |
| 재방문 | MSW 끔 | 94.1 → 96.8 | — → — | 161.8 → 163.8 | 317.5 → 359.7 |
| 재방문 | 요청 통과 | 198.4 → 85.6 | 59.6 → 63.8 | 177 → 177 | 373.3 → 376.7 |
| 재방문 | 모의 응답 | 198.5 → 89.2 | 60.9 → 66.8 | 178.5 → 175.2 | 383.6 → 386.6 |

### 데이터 로딩 후 INP

| 방문 | 경로 | INP 중앙값 | INP 최솟값–최댓값 | 첫 입력 대기 중앙값 | INP 입력 대기 중앙값 |
|---|---|---:|---:|---:|---:|
| 첫 방문 | MSW 끔 | 48 → 40 | 40–56 → 40–56 | 11.7 → 14.6 | 1 → 0.9 |
| 첫 방문 | 요청 통과 | 40 → 40 | 32–56 → 32–56 | 12.1 → 12.4 | 0.8 → 0.9 |
| 첫 방문 | 모의 응답 | 40 → 40 | 32–40 → 32–56 | 11.3 → 12.3 | 0.8 → 1 |
| 재방문 | MSW 끔 | 24 → 40 | 24–40 → 24–72 | 5.1 → 5.1 | 0.8 → 0.6 |
| 재방문 | 요청 통과 | 32 → 32 | 24–40 → 24–40 | 3.4 → 4.3 | 1 → 0.7 |
| 재방문 | 모의 응답 | 32 → 32 | 24–80 → 24–40 | 4.1 → 5.8 | 0.4 → 0.7 |

- **입력 가능 시점.** 첫 방문에 요청 통과는 201.5ms, 모의 응답은 171.2ms 앞당겨졌다. 재방문에도 각각 112.8ms, 109.3ms 먼저 버튼을 쓸 수 있었다. 워커 등록을 보류한 브라우저 테스트에서 같은 현상을 직접 재현했다.
- **입력 처리.** 요청 통과와 모의 응답의 INP 중앙값은 첫 방문 40ms, 재방문 32ms였다. 모든 조건에서 INP를 결정한 상호작용의 입력 대기 중앙값은 0.4~1.0ms였고, 나머지는 주로 이벤트 처리와 다음 페인트에서 발생했다. 게이트가 없는 MSW 끔에서도 첫 방문과 재방문에 INP 변화 방향이 달라 작은 표본의 변동을 확인할 수 있다.
- **응답과 데이터 표시.** 개선 후 첫 방문의 요청 → 헤더 중앙값은 MSW 끔 162.9ms, 요청 통과 217.9ms, 모의 응답 209.3ms였다. 설정상 같은 150ms라도 두 워커 경로의 실측은 달랐다. 첫 방문에 워커가 있는 두 경로에서 데이터 표시는 각각 72.6ms, 145.2ms 늦었다. 버튼을 먼저 그리는 개선은 데이터가 표시되는 시점까지 당겨 준다는 보장이 없다.

## 적용 판단

- **개발·QA에서 MSW가 필요한 경우**에는 페이지 전체를 준비 상태에 묶지 않는다. 독립적인 UI는 먼저 보여 주고, 응답 출처가 중요한 요청만 워커를 기다리게 한다. 등록이 실패하면 영역에 오류를 표시하거나 테스트를 실패 처리한다. 모의 데이터가 필요한 상황에서 API로 조용히 우회하면 테스트가 잘못 통과할 수 있다.
- **서버 fixture나 Route Handler로 충분한 경우**에는 Jonbeo의 수정처럼 포트폴리오 데이터를 서버가 제공하도록 하는 편이 단순하다. 워커 등록을 기다리는 경로가 줄고 코드에서 개발용 mock과 실제 데이터를 구분하기 쉬워진다. 다른 팀과 독립적으로 API 오류·지연을 재현해야 한다면 브라우저 인터셉션의 이점이 크다. [Jonbeo 서버 데이터와 Route Handler](https://github.com/callu9/jonbeo-next-ts/blob/main/docs/performance-refactoring.md)
- **표시된 버튼을 누르고도 느린 경우**에는 입력과 겹친 긴 메인 스레드 작업, 이벤트 처리, 다음 페인트를 각각 본다. 원본의 스켈레톤 최소 시간은 콘텐츠 표시를 늦추는 별도 후보이고, CPU 작업의 영향은 해당 작업과 입력 시점이 겹친 trace에서 판단한다.

## 재실행

```sh
npm ci
npm run build
npm run measure:msw
npx playwright test tests/jonbeo-msw.spec.ts --workers=1
```

`npm run dev`의 런처에서 **Jonbeo MSW performance**를 열면 세 요청 경로와 두 렌더링 방식을 바꿔 볼 수 있다. 워커는 실험의 `worker/` 하위에서만 등록되며 MSW 끔 경로와 다른 실험을 제어하지 않는다. 벤치마크는 원시 Event Timing과 Long Tasks, 응답 출처, 환경을 `test-results/jonbeo-msw/results.json`에 남긴다. 달리 지정하려면 `MSW_BENCH_ROUNDS`를 설정한다.
