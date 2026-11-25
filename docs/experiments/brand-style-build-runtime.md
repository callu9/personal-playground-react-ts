# 브랜드 테마의 빌드와 런타임 비용

2026-11-25 · [브랜드 테마 전체 결과](../brand-theme-results.md)

## 결정 조건

제품에서는 **등록된 브랜드의 색상과 글꼴만 전환**합니다. 우선 기준은 **개발 중 빠른 수정과 빌드**입니다. 이 조건에서 **CSS Modules + React Context + CSS 변수**를 기본으로 권장합니다. 동일한 모달 토큰 변경에서 후보별 수정이 한 곳이었고, 브랜드 전환 시 CSS 규칙을 추가하지 않았습니다. 네 후보의 프로덕션 빌드 시간이 겹쳐 빌드 속도만으로 특정 후보를 고르기는 어렵습니다.

## 어느 단계에서 어떤 작업을 하는가

클래스와 선언의 **구조를 정하는 시점**과 브랜드 **값을 선택하는 시점**은 다릅니다. 이 저장소에서 계정으로 브랜드를 고르는 일은 네 후보 모두 브라우저에서 수행합니다. CSS Modules·Tailwind·shadcn은 미리 만든 CSS에 브랜드 CSS 변수 값을 넘깁니다. styled-components는 테마 객체의 값을 CSS 템플릿에 보간하고, 새로운 결과가 나오면 브라우저의 스타일시트에 규칙을 추가합니다. 어떤 등록 브랜드로 전환하든 다시 빌드할 필요가 없습니다. 소스에 들어 있는 브랜드 정의를 편집해 배포하려면 네 후보 모두 다시 빌드합니다.

| 후보 | 빌드에서 하는 일 | 브라우저에서 하는 일 | 빠른 수정 기준의 장점 | 비용과 제약 |
|---|---|---|---|---|
| CSS Modules + React Context | 모듈 클래스 이름을 스코프하고 CSS를 출력 | Context에서 브랜드를 전달하고 루트의 CSS 변수 값 갱신 | 색상·글꼴 데이터와 스타일이 쓰이는 위치를 찾기 쉽고, 이번 모달 토큰 변경은 후보별 1파일·1지점 | 공통 상태 스타일과 컴포넌트 CSS를 직접 작성하고 관리 |
| styled-components | CSS 템플릿과 라이브러리를 JS로 번들링. 이번 설정에는 styled-components 전용 Babel·SWC 변환 플러그인 없음 | ThemeProvider의 값을 보간, 처음 보는 결과의 클래스·CSS 규칙 생성, 기존 결과 재사용 | 테마 값을 타입으로 받아 CSS를 작성할 수 있어 스타일 규칙 자체의 분기가 많을 때 표현이 직접적 | 단순 색상·글꼴 변경도 현재 구현에서는 새 스타일 조합의 규칙을 생성. 런타임 JS와 스타일시트 비용이 추가됨. CSS 변수를 보간 대신 쓰면 규칙 재생성을 줄일 수 있음 |
| Tailwind CSS | `@source`에서 완전한 클래스 이름을 탐지하고 유틸리티 CSS 생성. `@theme inline`으로 유틸리티와 CSS 변수 연결 | 고정 유틸리티에서 브랜드 CSS 변수 값을 참조 | 기존 Tailwind 화면에서는 색상·글꼴 변경이 데이터 수정으로 끝나고 레이아웃 유틸리티를 재사용 | 새 토큰은 변수 매핑과 클래스 사용처를 함께 수정. 런타임에 문자열로 조립한 클래스는 빌드 탐지 대상이 아님 |
| shadcn/ui + Tailwind CSS | Tailwind가 공유 유틸리티와 레지스트리 컴포넌트의 클래스를 탐지해 CSS 생성. 컴포넌트 JS도 번들에 포함 | 기존 클래스 조합과 시맨틱 CSS 변수로 색상·글꼴 적용 | Button·Card·Badge 재사용으로 화면 작업을 줄일 수 있고, 이번 모달 토큰 변경은 Tailwind 매핑 공유 | 공유 Tailwind 설정 외에 제공 컴포넌트의 기본 스타일·토큰·전환을 DS에 맞추는 비용. 레지스트리 컴포넌트 설치 시간은 아래 빌드 측정에 미포함 |

[Vite CSS Modules](https://vite.dev/guide/features.html#css-modules) · [styled-components 런타임 성능](https://styled-components.com/docs/advanced#performance) · [styled-components 빌드 플러그인](https://styled-components.com/docs/tooling) · [Tailwind 클래스 탐지](https://tailwindcss.com/docs/detecting-classes-in-source-files#dynamic-class-names) · [Tailwind 테마 변수](https://tailwindcss.com/docs/theme#referencing-other-variables) · [shadcn/ui 테마](https://ui.shadcn.com/docs/theming)

## 단일 페이지 프로덕션 빌드

기존 Vite 설정을 유지하고 HTML 입력 하나만 후보별로 지정했습니다. 후보당 워밍업 1회 후 7회씩 실행 순서를 교대했습니다. 매 회차에 새 Node 프로세스를 사용한 로컬 측정입니다. **Vite 시간**에는 설정 로드와 번들 생성이, **프로세스 시간**에는 Node 및 Vite 모듈 시작이 추가로 포함됩니다. 타입 검사, 산출물 디스크 쓰기, 패키지 설치, OS 파일 캐시 초기화는 포함하지 않았습니다.

| 후보 | Vite 중앙값 (최소–최대) | 프로세스 중앙값 |
|---|---:|---:|
| CSS Modules + React Context | 1,180ms (865–2,837) | 1,450ms |
| styled-components | 1,098ms (888–2,902) | 1,346ms |
| Tailwind CSS | 1,246ms (882–2,988) | 1,482ms |
| shadcn/ui | 1,351ms (917–2,573) | 1,694ms |

이번 크기의 대시보드에서는 **styled-components가 빌드를 일관되게 더 느리게 한다는 근거가 없었습니다**. 중앙값 간격에 비해 실행 간 변동이 컸습니다. 이 실험의 styled-components에서 확인된 차이는 브라우저의 규칙 생성과 초기 자산입니다. styled-components 전용 컴파일러 플러그인을 추가한 빌드, 더 큰 규모의 프로젝트, CI 빌드 시간은 측정하지 않았습니다. [28회 빌드 원시 기록](evidence/theme-build-benchmark.json)

## 개발 중 색상 수정

임시 복사본의 `brands.ts`에서 Grove의 강조 색상 한 값을 바꿨습니다. 일반 Vite 개발 서버에 연결된 상태에서 파일 쓰기 시작부터 첫 행 버튼의 계산된 색상이 새 값에 도달하기까지를 측정했습니다. 후보당 3회입니다. 첫 반영 이후 500ms 동안 페이지 새로고침을 관찰하고 최종색을 다시 확인했습니다.

| 후보 | 첫 반영 중앙값 (최소–최대) | 새로고침 발생 |
|---|---:|---:|
| CSS Modules + React Context | 50ms (33–56) | 3/3회 |
| styled-components | 42ms (40–47) | 3/3회 |
| Tailwind CSS | 58ms (57–58) | 3/3회 |
| shadcn/ui | 188ms (185–227) | 3/3회 |

이 시간에는 브라우저 스타일 정착까지 포함됩니다. shadcn 버튼의 150ms 전환과 페이지 새로고침이 영향을 줄 수 있습니다. 개발 로그에서 공통 `dashboard.tsx`의 `mountDashboard` 내보내기가 Fast Refresh 경계에서 무효화되는 현상과 일부 진입점의 중복 `createRoot` 경고를 확인했습니다. 따라서 표의 반영 시간은 현재 앱의 개발 피드백이며 스타일 라이브러리 자체의 HMR 지연으로 해석하기 어렵습니다. 이 측정에서는 해당 공통 구조를 수정하지 않았습니다. [12회 개발 수정 원시 기록](evidence/theme-dev-edit-benchmark.json)

## 브라우저에서 생성된 규칙

로컬 프로덕션 빌드에서 Grove → Signal → Ember → Grove를 같은 탭에서 선택했습니다. 각 단계에 인라인 스타일시트의 CSSOM 최상위 규칙 수를 기록했습니다. 미디어 쿼리의 내부 규칙은 중복해서 세지 않았으며, 루트의 CSS 변수 선언은 개별 스타일 선언으로 취급했습니다.

| 후보 | 인라인 CSS 규칙 수 | 루트 브랜드 변수 수 |
|---|---|---:|
| CSS Modules + React Context | 0 → 0 → 0 → 0 | 4 |
| styled-components | 73 → 146 → 219 → 219 | 0 |
| Tailwind CSS | 0 → 0 → 0 → 0 | 4 |
| shadcn/ui | 0 → 0 → 0 → 0 | 4 |

styled-components는 **처음 방문한 브랜드마다 73개의 최상위 규칙을 추가**했습니다. Grove로 돌아갈 때 규칙 수가 그대로였습니다. CSS 변수 기반 후보도 브라우저에서 스타일을 재계산하지만, 관찰한 전환에서 스타일시트 규칙을 추가하지 않았습니다. 규칙 수는 메인 스레드 실행 시간, 메모리 사용량, 사용자 입력 지연을 직접 나타내지 않습니다. [CSSOM 원시 기록](evidence/theme-runtime-style-rules.json)

## 재실행

```sh
node scripts/measure-theme-build.mjs
node scripts/measure-theme-change.mjs --watch
npm run build
npm run measure
```

원시 출력은 `test-results/`에 생성됩니다.
