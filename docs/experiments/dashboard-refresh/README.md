# 대시보드 실시간 갱신 실험 지침

[실험 목차](../README.md) · [공통 지침](../../../AGENTS.md) · [결과 보고서](results.md) · [사용 목적별 선택](results.md#사용-목적별-선택) · [측정 원본](evidence/)

## 비교 설계

계속 변하는 최신 스냅샷을 사용자가 얼마나 빨리 보게 되는지 잽니다. 고정 폴링 1·3·5초, 적응형 폴링, SSE에 **같은 브랜드 대시보드, 서버 데이터, 갱신 일정과 전달 조건**을 적용합니다. 측정에서는 Grove 계정을 고정합니다.

- 고정 폴링은 설정 간격으로 최신 스냅샷을 GET합니다. 적응형은 4초에서 시작해 새 버전을 관측한 뒤 3초 동안 1초 폴링을 사용합니다. SSE는 열린 연결로 새 스냅샷을 받고 단절 후 최신 상태부터 이어갑니다.
- 서버는 16초 주기로 평상시 두 번과 집중 구간 여덟 번을 반복합니다. 정상 전달 지연은 40ms, 느린 전달은 1,350ms입니다. 일시 단절은 시작 후 9.6~13.2초에 한 번 발생합니다. [일정 정의](../../../experiments/dashboard-refresh/fixture.ts) · [서버 구현](../../../experiments/dashboard-refresh/server.ts)
- Chrome에서 실제 DOM 반영을 관측합니다. 목표 관찰 창은 32초입니다. 초기 표시, 평상시·집중 갱신 p95, 미관측 버전과 뒤처진 시간, 탭당 요청·본문, 단절 복구를 집계합니다. p95에는 브라우저에서 본 버전만 포함합니다.

## 화면에서 확인하기

[공통 실행 절차](../../../README.md#로컬-실행)로 서버를 켜고 [Dashboard auto refresh](http://127.0.0.1:5173/experiments/dashboard-refresh/#playground)를 엽니다.

1. 기본 고정 3초에서 **Live snapshot** 번호와 Operations overview의 카드·차트·표가 계속 갱신되는 것을 확인합니다.
2. **Update method**에서 적응형 또는 SSE로 전환합니다. 피드와 브랜드·검색 상태가 유지됩니다.
3. **Delivery scenario**를 바꿉니다. 서버 조건이 적용된 새 피드가 열리고 **검증 결과**가 해당 시나리오로 바뀝니다. 공유 링크를 열면 새 탭에서 같은 피드를 구독합니다. [사용 목적별 선택 화면](http://127.0.0.1:5173/experiments/dashboard-refresh/#refresh-choice)

## 재실행과 원본

```sh
npm run build
npm run measure:refresh
npm test -- tests/dashboard-refresh.spec.ts --workers=1
```

정상 전달은 후보별 3회, 느린 전달과 단절은 각각 2회이며 정상 전달의 두 탭 조건도 포함합니다. 검증은 피드 지속 갱신, 동일 테마 재사용, 조회 단일 실행, 탭 복귀, SSE 재연결을 다룹니다. 새 출력은 `test-results/dashboard-refresh.json`에 기록됩니다. [게시된 38회 표본](evidence/dashboard-refresh-benchmark.json) · [측정 코드](../../../scripts/measure-dashboard-refresh.mjs)

공통 화면과 CSS Modules 테마는 [브랜드 테마 실험](../brand-theme/README.md)에서 재사용합니다. 운영 서버나 프록시의 처리량은 이 로컬 실험의 범위 밖입니다.
