# 전역 상태 구독과 입력 반응 실험 지침

[실험 목차](../README.md) · [공통 지침](../../../AGENTS.md) · [결과 보고서](results.md) · [무엇을 고르나](results.md#무엇을-고르나) · [측정 원본](evidence/)

## 비교 설계

[Jonbeo MSW 실험](../jonbeo-msw/results.md)의 원본 측정에서 통화 전환 INP의 대부분은 이벤트 처리였습니다. 단위 하나를 바꾸면 종목 행과 금액이 다시 그려지는 화면에서 **상태를 구독하는 방식이나 위치를 바꾸면 입력 반응이 얼마나 달라지는지**를 같은 화면으로 비교합니다.

| 축 | 값 |
|---|---|
| 구독 방식 | **Context · one**(상태 전체를 값 하나에) · **Context · split**(단위·선택·액션을 세 Context로) · **Zustand · whole store**(`useStore()`를 선택자 없이 호출) · **Zustand · selector**(`useStore((state) => …)`) |
| 구독 위치 | **row**: 행 컴포넌트가 구독하고 이름·차트·금액·버튼을 모두 다시 렌더링 · **leaf**: 행은 `memo`로 고정하고 금액 셀과 선택 버튼만 구독 |
| 행 수 | 7 · 100 · 1,000 (가상화 없음) |
| 상호작용 | **단위 전환**(₩ ↔ $, 모든 행의 금액이 바뀜) · **행 선택**(한 번에 한 행만 바뀜) |
| CPU | 4배 감속(Jonbeo 측정과 같은 조건)을 기본으로 하고, 행 1,000개는 감속 없음도 측정 |

- 같은 `Stock` 데이터(시드 고정), 같은 마크업·스타일·포맷터(`Intl.NumberFormat` 인스턴스 재사용)를 쓰고, 네 구독 방식은 같은 훅 인터페이스(`useIsWon`·`useSelected`·`useToggle`·`useSelect`) 뒤에 둡니다. 컴포넌트 트리는 구독 위치 두 가지만 다릅니다. [바인딩](../../../experiments/state-subscription/bindings.tsx) · [화면](../../../experiments/state-subscription/screen.tsx)
- 원본 Jonbeo(`callu9/jonbeo-next-ts`의 기본 브랜치 `f1189c2`)의 `UnitButton`·`StockListItem`은 `useUnitStore()`를 선택자 없이 부르고, 스토어에는 단위(`isWon`) 하나만 있습니다. 원본에는 없는 **선택 상태**를 이 실험이 더해 구독 범위의 차이가 드러나게 했습니다. 원본은 읽기만 했고 이 실험은 원본 코드가 아닙니다. 측정한 `d68ac41`·`76f9ac6`의 같은 파일은 이 실험에서 대조하지 않았습니다.
- 원본 행에는 애니메이션 컴포넌트(`motion`, `AmountTransition`)가 있습니다. 이 실험의 행은 CSS와 SVG만 씁니다.
- 새 패키지 의존성은 `zustand` 하나입니다. 실험의 비교 후보라서 추가했습니다.

## 측정 지표

- **렌더링 횟수와 커밋**: 컴포넌트 본문에서 세는 렌더 횟수(`row`·`amount`·`select`·`header`·`toggle`)와 React Profiler의 커밋 수·`actualDuration`(렌더 단계 시간)·`startTime`→`commitTime`. `react-dom/client`를 `react-dom/profiling`으로 바꾼 프로덕션 빌드에서 상호작용 하나당 값을 잡습니다.
- **INP**: 프로덕션 빌드에서 Chrome 입력으로 8번 누른 뒤 `web-vitals/attribution`(`reportAllChanges`, 16 ms 임계)이 보고한 값과 입력 대기·이벤트 처리·다음 페인트 구간입니다. 한 번 로드가 값 하나이며 로드 사이의 중앙값을 냅니다. `duration`은 8 ms 단위로 보고되고 16 ms 미만은 기록되지 않습니다. 단위 전환 8번, 또는 서로 다른 행을 고르는 선택 8번을 누르며 클릭 사이에 500 ms를 둡니다.
- 각 로드는 새 브라우저 컨텍스트에서 시작합니다. 클릭은 Playwright가 CDP 입력으로 보냅니다.

## 화면에서 확인하기

[공통 실행 절차](../../../README.md#로컬-실행)로 서버를 켜고 [State subscription and INP](http://127.0.0.1:5173/experiments/state-subscription/#playground)를 엽니다.

1. **Approach**·**Placement**·**Rows**를 바꾸면 같은 화면이 해당 조건으로 다시 열립니다(주소에 `approach`·`placement`·`rows`가 남습니다).
2. **Reset counts**를 누르고 **₩ → $**를 누른 뒤 **Show render counts**로 렌더링된 컴포넌트 수를 봅니다.
3. 행의 **Select**를 눌러 같은 방식으로 세어 보고, 구독 방식과 위치를 바꿔 숫자가 어떻게 달라지는지 비교합니다.

## 재실행과 원본

```sh
npm run build
npm run measure:state
npm test -- tests/state-subscription.spec.ts --workers=1
```

`npm run measure:state`는 일반 프로덕션 빌드(INP)와 프로파일링 빌드(렌더 횟수·커밋)를 `test-results/`에 따로 만들고 각각 로컬 미리보기로 서비스합니다. 기본 반복은 INP 5회(조건당 로드), 프로파일 2회이며 `--loads=`·`--profile-loads=`·`--rows=7,100`·`--only=inp`로 바꿀 수 있습니다. 출력은 `test-results/state-subscription.json`입니다. [측정 코드](../../../scripts/measure-state-subscription.mjs) · [Playwright 검증](../../../tests/state-subscription.spec.ts) · [측정 원본](evidence/state-subscription-benchmark.json)

원본 Jonbeo의 프로덕션 측정은 이 실험에 포함하지 않았습니다(미측정).
