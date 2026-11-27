# 실험 문서 목차

[저장소 목차](../../README.md) · [공통 지침](../../AGENTS.md) · [로컬 실행](../../README.md#로컬-실행)

실험 **지침**에는 비교 조건과 재현 명령이, **결과 보고서**에는 관측값과 판단이 있습니다. **측정 원본**에서 표에 사용한 기록을 확인할 수 있습니다.

| 실험 | 화면에서 바로 볼 내용 | 지침 | 보고서 | 측정 원본 |
|---|---|---|---|---|
| 브랜드 테마 | [공통 대시보드와 계정별 배경](http://127.0.0.1:5173/experiments/brand-theme/#playground) | [다섯 구현 후보와 확인 순서](brand-theme/README.md) | [후보 선택](brand-theme/results.md) · [빌드·개발 반영·런타임 상세](brand-theme/build-runtime.md) | [브랜드 테마](brand-theme/evidence/) |
| 차트 지연 로딩 | [로딩 전략별 측정](http://127.0.0.1:5173/experiments/chart-loading/#verification) | [전략과 재실행](chart-loading/README.md) | [로딩 전략 선택 기준](chart-loading/results.md) | [차트 지연 로딩](chart-loading/evidence/) |
| 대시보드 실시간 갱신 | [용도별 방식 선택](http://127.0.0.1:5173/experiments/dashboard-refresh/#refresh-choice) | [스냅샷과 전달 시나리오](dashboard-refresh/README.md) | [비교표와 선택 기준](dashboard-refresh/results.md) | [실시간 갱신](dashboard-refresh/evidence/) |
| 작업 상태 조회 | [요청 제한·취소·여러 탭](http://127.0.0.1:5173/experiments/job-status/#verification) | [폴링·SSE 조건과 재실행](job-status/README.md) | [폴링 충분 조건과 전환 기준](job-status/results.md) | [작업 상태 조회](job-status/evidence/) |
| Jonbeo MSW | [원본 코드 분석](http://127.0.0.1:5173/experiments/jonbeo-msw/#source-analysis) | [로컬·원본 재현](jonbeo-msw/README.md) | [Worker 준비, DOM 반영, 통화 전환 INP](jonbeo-msw/results.md) | [Jonbeo MSW](jonbeo-msw/evidence/) |
| 전역 상태 구독과 입력 반응 | [구독 방식·위치별 INP](http://127.0.0.1:5173/experiments/state-subscription/#verification) | [비교 설계와 재실행](state-subscription/README.md) | [구독 방식 선택 기준](state-subscription/results.md) | [전역 상태 구독](state-subscription/evidence/) |

대시보드 실시간 갱신은 브랜드 테마의 `Operations overview`와 CSS Modules 테마를 재사용합니다. 실시간 갱신 결과는 같은 UI에서 조회 방식을 바꿔 얻었습니다. [공유 대시보드 코드](../../experiments/brand-theme/shared/dashboard.tsx)
