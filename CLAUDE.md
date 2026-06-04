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

1. **단일 `state` 객체** — `{ family, finance, events }`. `loadState()`가 `localStorage`의 `freedom-timeline-state` 키에서 복원하고, 없거나 깨졌으면 `DEFAULT_STATE`로 폴백한다.
2. **이벤트 → state 변경** — 모든 input/click은 `document.body`에 위임된 단일 핸들러가 `data-*` 속성(`data-key`, `data-index`, `data-type`, `data-action`)으로 식별해 처리한다. 개별 요소에 리스너를 붙이지 않는다.
3. **재렌더 — 두 진입점**:
   - `recalculateAndRender()` — 가족·이벤트 추가/삭제·이름·생일 변경, 초기 로드, 리셋 시. 가족·재무·이벤트 필드를 포함한 전체 UI를 다시 그린다.
   - `rerenderResults()` — 재무 슬라이더/숫자/체크박스 입력 변경 시. 저장 + 결과카드·시나리오·몬테카를로·차트만 갱신한다. 입력 필드를 재생성하지 않아 슬라이더 드래그가 끊기지 않으며, 짝꿍 input과 `.field-hint`는 핸들러가 직접 갱신한다.

### 핵심 계산: `simulate` / `calculateProjection`

`app.js`의 심장은 연 단위 명목 시뮬레이션 코어 `simulate(finance, rateForYear)`이며, `calculateProjection`(결정론, 고정 수익률)과 `runMonteCarlo`(변동 수익률 샘플)가 이를 공유한다. `family[0]`을 기준 인물("owner")로 삼아 현재 나이부터 기대 수명까지 순자산을 시뮬레이션한다:

- 은퇴 전: 소득에 `incomeGrowthRate`. 은퇴 후: 소득 0, `pensionStartAge` 이후 연금(`pensionInflationLinked`면 인플레 연동, 아니면 명목 고정). 은퇴 직후 생활비는 `retirementExpenseRatio`로 1회 조정.
- 생활비는 `inflationRate`로 증가. **자녀 교육비**(`eduCostAt`)는 family 구성원 나이가 `eduStartAge~eduEndAge`인 인원수 × `eduCostPerYear`로 매년 가산되며 생활비와 분리된다(FI 목표 자산엔 미포함). **일회성 이벤트**(`sumEventsAt`, `state.events`)는 해당 나이에 순자산을 가감한다. 교육비·이벤트 입력은 오늘 가치로 보고 명목 환산한다.
- 매년 `netWorth = netWorth*(1+수익률) + 소득 − 총지출`. FI 목표 자산 = `생활비/withdrawalRate`, 순자산이 처음 넘는 나이가 `fiAge`. 순자산이 처음 음수가 되는 나이가 `depletionAge`(자산 고갈).
- `overrides`로 일부 파라미터만 바꿔 재계산 — 시나리오 비교(`renderScenarioCards`)가 이용한다.
- **표시 모드** (`displayMode`, `freedom-timeline-mode` 키): 명목 계산을 끝낸 뒤 `"real"`(오늘 가치, 기본)이면 결과 rows를 `(1 + inflationRate)^경과연수`로 나눠 현재 화폐가치로 환산한다. `"nominal"`(미래 가치)은 환산하지 않는다. 디플레이트는 표시값에만 적용되며 `fiAge`·`depletionAge`는 명목 비교로 구해 모드와 무관하다. 결과 패널의 `.mode-toggle` 버튼으로 전환한다.
- **몬테카를로**(`runMonteCarlo`): 매년 수익률을 `N(returnRate, returnVolatility)`에서 샘플(`randNormal`, Box-Muller)해 `MC_ITERATIONS`회 `simulate` 실행 → 성공확률(고갈 없이 기대수명 도달 비율) + 최종 순자산 P10/P50/P90.

### 선언적 입력 필드: `FIELD_CONFIGS`

재무 입력 슬라이더/숫자 필드는 `FIELD_CONFIGS` 배열에 선언적으로 정의된다(`key`, `label`, `min`, `max`, `step`, `unit`). `unit`(`"money" | "percent" | "age"`)은 필드 하단 `.field-hint` 보조표기 포맷을 결정한다(`formatHint`).
**새 재무 입력을 추가하려면**: `FIELD_CONFIGS`에 항목 추가 + `DEFAULT_STATE.finance`에 기본값 추가 + 필요하면 `calculateProjection`에서 사용. 렌더링·이벤트 처리는 자동으로 연결된다.

## 주의점

- Chart.js는 CDN 의존이라 로드 실패 가능성이 있다. `renderCharts()`는 `typeof Chart === "undefined"`를 확인해 fallback 메시지를 표시하므로, 차트 관련 변경 시 이 분기를 깨지 않도록 한다.
- 사용자 입력은 `clamp()`로 `FIELD_CONFIGS`의 min/max 범위에 제한된다. 슬라이더와 숫자 입력은 같은 `data-key`를 공유하며 한쪽 변경 시 양쪽이 동기화된다.
- `state`는 `{ family, finance, events }`. 일회성 이벤트(`state.events`)는 가족 목록과 동일한 동적 리스트 패턴(`renderEvents`, `data-event`/`data-action="delete-event"` 위임)으로 편집한다. 체크박스류(`data-toggle`, 예: `pensionInflationLinked`)는 `syncToggles()`로 state와 동기화한다.
- 모든 금액 단위는 원(KRW). 전체 표기는 `formatMoney()`, 축약 표기(차트 축·입력 hint)는 `formatCompactMoney()`(억/만 단위)를 쓴다.
- 다크/라이트 테마는 `<html data-theme>`로 제어되며 `freedom-timeline-theme` 키에 저장된다(`index.html` head의 인라인 스크립트가 FOUC 없이 초기 적용). 색은 `style.css`의 CSS 변수 토큰(`:root` / `[data-theme="dark"]`)으로 정의되고, Chart.js는 CSS 변수를 직접 못 읽으므로 `renderCharts()`가 `getComputedStyle`로 읽어 적용한다 — 테마 토글 시 `rerenderResults()`로 차트를 다시 그린다.
