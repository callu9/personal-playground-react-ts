# 작업 상태 조회 실험 지침

[실험 목차](../README.md) · [공통 지침](../../../AGENTS.md) · [결과 보고서](results.md) · [폴링 충분 조건과 전환 기준](results.md#폴링으로-충분한-조건과-전환-기준) · [측정 원본](evidence/)

## 비교 설계

장시간 분석 작업처럼 끝날 때까지 수 초에서 수 분이 걸리는 작업의 상태(대기 → 진행 → 완료)를 화면에 보여 줄 때, **폴링이 어디까지 충분하고 언제 SSE 같은 연결 유지 방식으로 바꿔야 하는지**를 잽니다. 서버 요청 제한과 사용자의 취소, 같은 작업을 여러 탭에서 보는 상황을 더합니다. 이전 [작업 상태 실험](https://github.com/callu9/personal-playground-react-ts/blob/60c12c6/docs/experiments/dashboard-refresh/results.md)을 별도 실험으로 복원하고 조건을 넓힌 것입니다.

| 축 | 값 |
|---|---|
| 조회 방식 | 고정 폴링 1·3·5초, 적응형 폴링(대기 4초 · 진행·취소 중 1초), SSE |
| 429 처리(폴링) | **Retry-After 준수**: 헤더의 초만큼, 원래 간격보다 짧지 않게 기다린 뒤 0~250 ms를 더해 재시도 · **백오프만**: 헤더를 읽지 않고 0.5초에서 8초까지 두 배씩 늘리는 실패 백오프 |
| 서버 조건 | 정상(전달 지연 40 ms) · 느린 응답(1,350 ms) · 일시 단절(시작 후 5.8~8.5초) · **요청 제한**(같은 작업의 조회 8건/10초, 초과 시 `429` + `Retry-After`) |
| 사용자 동작 | 작업 시작 후 6.5초에 **Cancel job**. 서버는 즉시 `Cancelling`, 800 ms 뒤 `Cancelled`를 보고 |
| 탭 수 | 같은 작업을 1·5·20개 탭에서 조회 |

- 작업은 생성 2초 뒤 시작하고, 시작 기준 **4.52·5.35·6.18·7.83·9.89·12.20초**에 버전 1~6을 기록합니다. 버전 6이 `Completed`입니다. 취소하면 그 시점까지의 버전 뒤에 `Cancelling`, `Cancelled`가 붙고 이후 일정은 사라집니다. [서버 구현](../../../experiments/job-status/server.ts) · [계약과 한도](../../../experiments/job-status/contract.ts)
- 요청 제한은 같은 작업을 보는 모든 탭이 공유합니다. 운영에서는 사용자·IP·API 키 같은 키로 걸리는 한도의 대역입니다. 거절한 요청은 한도에 세지 않고, `Retry-After`는 창에서 가장 오래된 요청이 빠질 때까지 남은 초(올림, 최소 1초)입니다.
- 폴링은 응답이 끝나기 전에 다음 요청을 보내지 않고, 완료·취소 완료에서 멈추며, 숨김 탭에서는 멈췄다가 돌아오면 바로 다시 시작합니다. SSE는 `Last-Event-ID`·`after` 커서로 이어받고, 닫힌 연결은 0.5~8초 백오프로 다시 엽니다. 브라우저의 `EventSource`는 `429`와 `404` 같은 비정상 응답에서 연결을 닫고 상태 코드와 `Retry-After`를 스크립트에 알려 주지 않으므로, SSE는 백오프만 쓸 수 있습니다. [폴링](../../../experiments/job-status/polling.ts) · [적응형](../../../experiments/job-status/adaptive.ts) · [SSE](../../../experiments/job-status/sse.ts)
- Chrome에서 DOM에 버전 행이 처음 나타난 시각을 서버 기록 시각과 비교합니다. 서버는 요청 수, 거절 수, `Retry-After` 이전 재요청 수, 동시 연결 수, 응답 본문 바이트를 셉니다.

## 측정 지표

- **반영 지연**: 서버 기록 시각 → DOM에 버전이 나타난 시각. 완료 p95는 `Completed` 행만 모읍니다. 화면에 나타나지 않은 버전은 p95에서 빼고 따로 셉니다.
- **취소 반영 시간**: Cancel job을 누른 시각 → DOM에 `Cancelled` 행이 나타난 시각. 누른 탭과 관찰만 하는 다른 탭을 따로 봅니다. 서버 확정까지의 하한은 요청 지연 40 ms + 800 ms입니다.
- **요청량**: 상태 조회(429·503 포함)와 SSE 연결·재연결 합계. 탭당 분당 요청은 작업 생성부터 종료까지의 관찰 창(19.5초)으로 환산합니다. 헤더·TLS는 제외합니다.
- **연결 수**: 서버가 본 동시 SSE 스트림 최대치. 폴링은 동시 조회 최대치를 봅니다.
- **완료 관측**: 탭 중 `Completed`가 화면에 나타난 비율.

## 화면에서 확인하기

[공통 실행 절차](../../../README.md#로컬-실행)로 서버를 켜고 [Job status polling](http://127.0.0.1:5173/experiments/job-status/#playground)을 엽니다.

1. **Update method**와 **Next run scenario**를 고르고 **Start run**을 누릅니다. 상태, 진행률, 연결 상태, 관측한 버전 목록이 갱신됩니다.
2. **Next run scenario**를 **Request limit**으로 두고 고정 1초를 고르면 **429 responses** 카운터가 오릅니다. **429 handling**을 바꿔 같은 조건에서 두 정책을 비교합니다.
3. 진행 중 **Cancel job**을 누르면 `Cancelling`, `Cancelled`가 목록에 붙습니다. 폴링은 `Cancelling`을 건너뛸 수 있습니다.
4. **Open this run in another tab**으로 같은 작업을 다른 탭에서 열어 요청과 연결이 탭 수만큼 늘어나는지 확인합니다.

## 재실행과 원본

```sh
npm run build
npm run measure:job-status
npm test -- tests/job-status.spec.ts --workers=1
```

측정은 프로덕션 빌드를 로컬 Vite 미리보기로 서비스하고 설치된 Chrome(Playwright `channel: 'chrome'`)의 새 컨텍스트에서 실행합니다. 출력은 `test-results/job-status.json`에 기록됩니다. `--groups=cancel,tabs`로 일부만 다시 재고 `--base=<이전 json>`으로 나머지 표본을 이어 붙일 수 있습니다.

| 그룹 | 조건 | 횟수 |
|---|---|---|
| `normal` | 후보 5개, 단일 탭 | 후보별 3회(페이지 시작 오프셋 0·1.1·2.35초) |
| `slow` · `outage` | 고정 1초·적응형·SSE | 후보별 2회 |
| `limited` | 고정 1초(준수·백오프만), 고정 3초, 적응형(준수·백오프만), SSE | 후보별 3회 |
| `cancel` | 후보 5개, 탭 2개(요청·관찰) | 후보별 5회(페이지 시작 오프셋 0·0.6·1.2·1.8·2.4초) |
| `tabs` | 정상: 고정 1초·3초, 적응형, SSE × 탭 1·5·20, SSE 20개 별도 프로필 · 요청 제한: 고정 3초(준수·백오프만), SSE × 탭 5·20 | 조합별 1회 |

[측정 코드](../../../scripts/measure-job-status.mjs) · [Playwright 검증](../../../tests/job-status.spec.ts) · [측정 원본](evidence/job-status-benchmark.json)

운영 서버·프록시의 처리량, HTTP/2 환경, 실제 인증 만료, 작업 수천 건을 한 화면에서 보는 목록은 이 로컬 실험의 범위 밖입니다.
