# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Freedom Timeline은 경제적 자유(FIRE) 달성 시점을 가정·시뮬레이션하는 정적 웹앱이다.
빌드 도구·패키지 매니저·테스트 프레임워크가 없는 순수 vanilla JS/HTML/CSS이며, 의존성은 CDN으로 로드하는 Chart.js 단 하나다.

## 실행 / 배포

- **로컬 실행**: `docs/index.html`을 브라우저에서 직접 연다. 빌드 단계 없음.
  - 정적 서버가 필요하면 `cd docs && python3 -m http.server`.
- **테스트/린트**: 없음. 변경 검증은 브라우저에서 직접 동작 확인으로 한다.
- **배포**: GitHub Pages가 `main` 브랜치의 `/docs` 폴더를 루트로 서빙한다.
  앱 코드는 반드시 `docs/` 안에 둬야 배포에 포함된다.

## 아키텍처

전체 앱은 `docs/`의 3개 파일로 구성된다: `index.html`(정적 마크업 셸), `style.css`, `app.js`(전 로직).

데이터 흐름은 단방향 재렌더링이다:

1. **단일 `state` 객체** — `{ family, finance }`. `loadState()`가 `localStorage`의 `freedom-timeline-state` 키에서 복원하고, 없거나 깨졌으면 `DEFAULT_STATE`로 폴백한다.
2. **이벤트 → state 변경** — 모든 input/click은 `document.body`에 위임된 단일 핸들러가 `data-*` 속성(`data-key`, `data-index`, `data-type`, `data-action`)으로 식별해 처리한다. 개별 요소에 리스너를 붙이지 않는다.
3. **`recalculateAndRender()`** — state 변경 후 항상 이 함수를 호출한다. 저장 → 전체 재렌더(가족·재무필드·결과카드·시나리오·차트)를 한 번에 수행하는 단일 진입점이다. 부분 갱신 패턴은 없다.

### 핵심 계산: `calculateProjection(overrides)`

`app.js`의 심장. `family[0]`을 기준 인물("owner")로 삼아 현재 나이부터 기대 수명까지 1년 단위로 순자산을 복리 시뮬레이션한다:

- 은퇴 전: 소득에 `incomeGrowthRate` 적용. 은퇴 후: 소득 0, 단 `pensionStartAge` 이후엔 연금 수령.
- 매년 `netWorth = netWorth * (1 + returnRate) + income - expense`, 지출은 `inflationRate`로 증가.
- FI 목표 자산 = `expense / withdrawalRate`. 순자산이 이를 처음 넘는 나이가 `fiAge`.
- `overrides`로 일부 파라미터만 바꿔 재계산 가능 — 시나리오 비교(`renderScenarioCards`)가 이를 이용해 보수적/낙관적 케이스를 만든다.

### 선언적 입력 필드: `FIELD_CONFIGS`

재무 입력 슬라이더/숫자 필드는 `FIELD_CONFIGS` 배열에 선언적으로 정의된다(`key`, `label`, `min`, `max`, `step`).
**새 재무 입력을 추가하려면**: `FIELD_CONFIGS`에 항목 추가 + `DEFAULT_STATE.finance`에 기본값 추가 + 필요하면 `calculateProjection`에서 사용. 렌더링·이벤트 처리는 자동으로 연결된다.

## 주의점

- Chart.js는 CDN 의존이라 로드 실패 가능성이 있다. `renderCharts()`는 `typeof Chart === "undefined"`를 확인해 fallback 메시지를 표시하므로, 차트 관련 변경 시 이 분기를 깨지 않도록 한다.
- 사용자 입력은 `clamp()`로 `FIELD_CONFIGS`의 min/max 범위에 제한된다. 슬라이더와 숫자 입력은 같은 `data-key`를 공유하며 한쪽 변경 시 양쪽이 동기화된다.
- 모든 금액 단위는 원(KRW), `formatMoney()`로 포맷한다.
