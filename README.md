# Personal React + TypeScript Playground

독립적인 React 실험과 검증 결과를 모아두는 저장소입니다. 첫 실험은 하나의 운영 대시보드에 브랜드 테마를 적용하는 네 가지 방식을 비교합니다.

## 실행

Node.js 24와 Google Chrome을 사용했습니다.

```sh
npm ci
npm run dev
```

Vite가 출력한 로컬 주소를 열고 구현을 선택한 뒤, 화면 우측 상단의 **Demo account**에서 Grove, Signal, Ember를 선택합니다. 계정은 이 탭에서 새로고침 후에도 유지되며, **Signed out**을 선택하면 환경 변수로 설정한 브랜드로 돌아갑니다.

환경 변수는 `.env.example`을 참고해 `.env.local`에 `VITE_DEFAULT_BRAND=signal` 등으로 설정합니다. 공통 우선순위는 **데모 계정 브랜드 → 유효한 환경 변수 → Grove**입니다. 프로덕션의 env 기본값을 바꾸려면 다시 빌드합니다.

페이지 배경은 Grove가 공통 기본값을 쓰고, Signal과 Ember는 각각 지정한 색을 씁니다. 상단의 **Page background**에서 기본값과 브랜드 지정값을 구분할 수 있습니다.

## 검증 및 측정

```sh
npm test
npm run build
npm run measure
```

테스트는 설치된 Chrome을 새 테스트 컨텍스트로 실행합니다. 측정 명령은 `dist`를 사용해 `test-results/theme-benchmark.json`과 후보별 대시보드 캡처를 저장합니다.

## 구조

- `experiments/brand-theme/shared/`는 대시보드 동작, 고정 데이터, 브랜드 토큰을 공유합니다.
- 실험의 각 후보는 자체 HTML과 스타일 진입점이 있습니다. Tailwind와 shadcn/ui는 유틸리티 정의를 공유하면서도 각각의 HTML에서 스타일을 로드합니다.
- 새 주제는 `experiments/<주제>/`에 자체 진입점을 둡니다. 현재 의존성은 하나의 npm 패키지에서 관리합니다.

## 실험 기록

[실험별 구현 시간·복잡도·트레이드오프](docs/experiments/README.md)
