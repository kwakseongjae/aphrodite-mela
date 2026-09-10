# Aphrodite: 실제 앱 뷰와 Computer Use 편집 고도화

상태: 부분 구현. 2026-09-09에 P1/P2의 첫 수직 슬라이스(픽셀 폭, 포인터 리사이즈, 프레임 이동, Undo/Redo, export 유지)를 구현했다. 실제 UI 검증과 남은 범위는 `POINTER-EDITOR-VALIDATION.md` 참조. 아래 전체 계획이 완료된 것은 아니다.

후속: 부모/형제 스냅 가이드와 외부 캔버스 자동 스크롤을 추가했다. 실제 조작 결과와 제한은 `EDITOR-ASSISTS-VALIDATION.md` 참조. 중첩 자동 스크롤 및 전체 Moa 앱 조립은 미완료다.

Moa 후속: 21노드 앱 레시피, 1440px Fit 캔버스, 공유 상태의 Preview/export를 구현했다. 실제 카드 이동·Undo와 검색/상태/체크리스트/모바일 리스트를 검증했다. `MOA-APP-VALIDATION.md` 참조. 빈 화면부터의 완전 자동 이미지 재구성과 비용 비교는 아직 미검증이다.

## 1. 이번에 증명할 것

랜딩페이지를 조립하는 도구에서, 실제 제품의 앱 화면을 조립하는 도구로 확장한다. 기준 제품은 기존 프로젝트와 동일한 **모아: 소규모 팀의 주간 업무 앱**이다.

- 주 사용자: 3–10명 규모 제품팀의 개발자 겸 창업자/PM. 코드 생성을 오래 기다리기 전에 정보구조와 작업 흐름을 승인하고 싶다.
- 직접 조작자: 사용자의 의도를 전달받은 Astra 등 Computer Use 에이전트. 사용자는 중간 화면을 보고 수정·승인한다.
- 검증 시나리오: 주간 보드를 열고 작업을 찾고, 상세 패널에서 담당자/상태를 바꾸고, 창을 줄여도 주요 작업을 계속한다.
- 편집기 시나리오: 레퍼런스를 보고 앱 셸을 만들고, 실제 카드와 상세 패널을 배치·리사이즈한 뒤 프롬프트와 재빌드 가능한 코드를 넘긴다.

에이전트의 지각·추론 능력은 활용한다. 그러나 앱이 드래그를 지원하지 않거나 조작 도중 DOM을 교체하면 에이전트 능력으로 해결할 수 없다. **쉬운 타깃, 예측 가능한 좌표, 명확한 완료 피드백, 실패 복구**를 제품 기능으로 제공한다.

## 2. 고품질 레퍼런스의 기준

새 이미지: `artifacts/app-view-reference/moa-workspace-v1.png` (1586×992 pixels, 2026-09-09 생성·검토 완료). 관찰 결과는 같은 폴더 `REVIEW.md`에 기록했다.

이미지는 현재 앱의 스크린샷이 아니라 목표 디자인이다. 생성된 문구·숫자·간격은 검토 전 사실이나 정확한 픽셀 명세로 취급하지 않는다. 원본 프롬프트는 같은 폴더 `PROMPT.txt`에 보존한다.

목표 구성:

| 영역 | 목표 | 재현할 구조 |
| --- | --- | --- |
| 앱 셸 | 고정 사이드바 + 유동 본문 + 상세 패널 | 행 프레임, 고정/채움 크기, 최소 폭 |
| 탐색 | 워크스페이스 선택, 현재 메뉴, 프로젝트 목록 | Sidebar, NavItem, Avatar, Menu |
| 헤더 | 제목, 검색, 날짜, 액션 | Toolbar, SearchField, DateNavigator, Button |
| 보기/필터 | 보드·리스트·캘린더, 담당자·상태 필터 | SegmentedControl, FilterChip, Popover |
| 업무 보드 | 평일 5열, 열마다 2–3개의 실제 카드 | Board, Lane, TaskCard, Badge, Avatar |
| 상세 패널 | 선택한 작업과 동일한 데이터, 편집 필드, 체크리스트 | DetailPanel, Select, Checkbox, Activity, Composer |

초기 데스크톱 명세는 **1440×900 CSS px**, 사이드바 220px, 상세 패널 320px, 나머지 본문으로 정한다. 이미지 해상도와 CSS 좌표는 구분하고 비례 정규화한다. 이것은 이미지에서 정밀 추출했다는 뜻이 아니라 구현 목표다.

좁은 화면 정책: 1024px에서 상세 패널은 overlay, 768px 미만에서 사이드바는 drawer, 보드는 가로 스크롤 또는 사용자 선택 리스트 보기. 업무 보드를 무조건 1열로 쌓는 현재 일반 규칙으로 대체하지 않는다. 첫 이미지는 데스크톱만 규정하므로 모바일은 명시적인 별도 설계 판단이다.

## 3. 계획 수립 시점의 차이 (2026-09-08 기준)

아래는 구현 전 기준선이다. 후속 구현에서 포인터 편집 모듈과 `widthPx`, 공통 높이 적용을 추가했다. fixed/hug/fill 전체 모델과 앱 전용 recipe는 여전히 남아 있다.

- `src/main.ts`: HTML Drag and Drop와 레이어 핸들로 이동/재부모화를 처리한다. 포인터 기반 resize 핸들, 좌표 변환 계층, 드래그 preview transaction은 없다.
- 같은 파일: `commit()`은 기본적으로 편집기 전체를 다시 그린다. 이를 pointermove마다 호출하면 선택/포커스/iframe 상태가 불안정해질 수 있다.
- `src/layout.ts`: 폭은 10–100% 정수, 높이는 100–2000, 좌표는 정수다. fixed/hug/fill, min/max, breakpoint별 layout, 부모 기준 픽셀 폭을 표현하지 못한다. 현재 일반 블록의 height는 공통 프레임 높이와 같은 방식으로 적용되지 않는다.
- `src/library-render.ts`: 공식 컴포넌트마다 JS/CSS를 넣은 sandbox iframe이다. 스타일 격리는 되지만 resize 중 iframe 입력이 개입하고, 페이지 단위 팝오버/상태 공유와 반복 인스턴스 성능에 제약이 있다.
- `src/providers.ts`: 공식 연결은 MUI 버튼·입력·카드와 Astryx/SEED/shadcn 버튼이다. Sidebar/Board/TaskDetail은 아직 라이브러리 이식 완료가 아니다.
- 현재 calendar는 자체 HTML 일정 패턴이다. 실제 작업 카드의 선택/이동/편집 데이터 모델은 별도로 필요하다.

## 4. 핵심 UX 계약

### Astra와 앱의 역할 분담

이미지의 의미 분석과 '어떤 컴포넌트로 만들지' 판단은 이미지를 볼 수 있는 외부 에이전트가 맡는 경로를 우선한다. 현재 앱의 Pixels only 분석을 고도화해야만 다음 단계가 가능한 것은 아니다. 별도의 내부 LLM을 중복 호출하는 기능은 선행 조건에서 제외한다.

에이전트: 이미지 관찰 → 영역/부모/반복 단위/상태 분해 → 사용 가능한 라이브러리와 매칭 → UI 조작 → 화면 재확인. 앱: 실제 컴포넌트 제공 → 안정적인 편집 조작 → 제약 검증 → 저장/Undo → 동일한 결과 export.

레퍼런스는 캔버스와 나란히 고정·확대할 수 있게 하고, 선택 영역/투명도 오버레이는 참고용으로만 사용한다. 이미지 영역마다 candidate component, slot copy, layout constraint, confidence와 unresolved 항목을 에이전트의 작업 계획에 남긴다. 'Task card'가 없으면 자체 recipe를 쓰거나 미지원으로 표시하며 비슷한 marketing card로 조용히 대체하지 않는다.

Component Finder는 이름·용도·provider·지원 상태로 검색되고 실제 크기의 variation preview를 보여준다. AppShell/Board 같은 recipe를 한 번 삽입해 반복 조작을 줄이되, 내부 노드는 계속 편집 가능해야 한다. 'AI가 잘 누르니 클릭 100번도 괜찮다'를 전제로 하지 않는다. 클릭 수와 재관찰 횟수도 이후 비용 평가에 포함한다.

### 편집 모드와 실행 모드를 분리

**Design**에서는 캔버스 위 편집 오버레이가 포인터를 받아 선택·드래그·리사이즈한다. iframe의 버튼을 실수로 실행하지 않는다. **Preview**에서는 오버레이를 제거하고 실제 버튼/입력/작업 카드 동작을 검증한다. 두 모드는 명확한 토글과 상태 표시를 갖는다.

실행 중 카드의 날짜 이동과 편집 중 카드의 레이아웃 이동은 다른 명령이다. `MoveNode`는 화면 구조만 바꾸고, `UpdateTask`는 샘플 제품 데이터를 바꾼다. 에이전트도 모드를 먼저 확인한다.

### 선택과 드래그

1. 클릭하면 노드 경계, 이름, 부모 breadcrumb가 표시된다. 깊게 중첩된 자식은 레이어 트리나 다시 선택 동작으로 접근한다.
2. 핸들은 화면상 최소 24px hit area, 시각적 점은 더 작게 표현한다. 줌과 무관하게 hit area 크기를 유지한다. 이 값은 본 프로젝트 설계값이다.
3. 마우스를 누르고 임계 거리 4 CSS px 이상 이동하면 드래그 시작. 포인터 capture, ghost, 좌표/크기 HUD, 현재 드롭 부모·삽입 순서를 표시한다.
4. free frame에서는 x/y 이동, auto layout에서는 삽입 위치 이동. 레이아웃 모드를 몰래 전환하지 않는다.
5. drop 시 단일 명령으로 확정, Undo 1회로 복구. Escape/pointercancel은 원상 복구. 잘못된 드롭은 저장하지 않고 이유를 표시한다.
6. 모서리 자동 스크롤, 스냅 가이드, drop target highlight는 조작 도중 유지한다. 매 hover마다 흔들리는 툴바·레이아웃 이동은 금지한다.

### 리사이즈

- 선택 사각형의 8개 핸들; E/W는 폭, N/S는 높이, 모서리는 둘 다 변경한다.
- 기본은 부모 로컬 좌표에서의 크기 변경. min/max를 지키고 음수 크기를 만들지 않는다.
- fixed/hug/fill 값을 Inspector와 동일하게 보존한다. fill 상태 핸들 조작은 '고정 폭으로 변경' 피드백 후 명시적으로 fixed로 확정한다.
- Shift 비율 잠금, Alt 중심 기준, 화살표 1px/Shift+화살표 8px 이동은 다음 단계 확장. 처음부터 modifier 키에 성공을 의존하지 않는다.
- 스냅은 부모 경계/형제 경계·중심을 대상으로 화면 기준 6px 이내. 토큰 간격 추천과 강제 스냅은 구분하고 끌 수 있게 한다.
- 드래그/리사이즈 중에는 transient geometry만 갱신하고, pointerup에서 모델·히스토리·저장을 한 번 확정한다.

### Computer Use 친화성

- 지속적인 ID, 사람이 읽을 수 있는 이름: '작업 상세 패널 · 오른쪽 크기 조절', '수요일 열 · 2번째 위치에 놓기'. 내부 ID만 노출하지 않는다.
- 현재 선택/부모/geometry/모드/변경 완료를 가시적 HUD와 접근성 트리에 동일하게 반영한다.
- `data-node-id`, `data-editor-handle`, `data-drop-target`는 진단용. 실제 Computer Use 성공 검증은 마우스·키보드 조작으로 수행한다.
- `aria-live`로 '폭 320px → 400px, 저장됨'을 알리고 실패 이유를 구체화한다. 중복 요청은 no-op 또는 같은 결과로 처리한다.
- 숫자 입력과 '다른 프레임으로 이동' 메뉴도 유지한다. 하지만 **drag/resize 합격 판정에 숫자 입력 우회를 인정하지 않는다.**
- MVP에 별도의 에이전트 전용 숨은 쓰기 API는 필요 없다. 이후 플러그인/MCP를 붙이더라도 동일한 명령/검증 계층을 사용한다.

## 5. 구현 순서와 산출물

작업 크기 S/M/L은 상대적 크기이며 일정 약속이 아니다. 라이브러리 추가보다 편집 안정성을 먼저 확보한다.

| 순서 | 작업 / 예상 크기 | 파일 경계 제안 | 완료 조건 |
| --- | --- | --- | --- |
| P0 | 기준 이미지·텍스트·fixture 동결 / S | reference/, benchmark/ | 이미지와 요구사항 승인, 임의 가구/랜딩페이지 샘플 없음 |
| P1 | 좌표·명령·히스토리 기반 / L | editor/geometry.ts, commands.ts, interaction-state.ts | zoom·scroll·중첩 변환 테스트; drag 1회=Undo 1회; Escape 무변경 |
| P2 | 선택 오버레이·실제 drag/resize / L | editor/overlay.ts, pointer-controller.ts, drop-targets.ts | 8핸들, 재부모화, 스냅, 자동 스크롤; iframe 위에서도 완료 |
| P3 | 앱 뷰용 component recipes / L | recipes/app-shell, task-board, task-detail; fixtures/moa | 5열 보드·상세 패널·필터·선택 상태를 실제 노드와 데이터로 구성 |
| P4 | renderer/export 일치와 성능 / L | render.ts, library-render.ts, export.ts, source-export.ts | canvas/preview/rebuilt export에서 구조·레이아웃·제품 상태 유지 |
| P5 | Astra 시나리오·시각 회귀 / M | tests/interaction, validation/app-view | 포인터 실제 조작 로그·연속 영상·스크린샷·실패표 확보 |

P1→P2가 선행 조건이다. P3 데이터/recipe 설계는 P1과 병행 가능하지만 P2 통과 전 컴포넌트 숫자 확대를 우선하지 않는다. P4까지 안정화한 뒤 P5를 실행한다. 30–40분/토큰 비교 실험은 이 후의 별도 단계다.

### P1 상세

- `clientToCanvas` / `canvasToClient` / `canvasToParent` 역변환을 순수 함수로 분리. 패널 오프셋, CSS zoom/transform, canvas scroll, 부모 padding을 입력으로 받는다. DPR과 CSS px를 중복 곱하지 않는다.
- 장기 scene 모델은 layout `{mode, width:{unit: px|hug|fill,value?}, height, min/max, padding, gap, breakpoints}`와 component props를 분리한다.
- v1 숫자/퍼센트 layout을 읽는 migration을 만든다. 원본 보존·명시 버전·export round-trip 테스트 없이 저장 형식을 교체하지 않는다.
- 명령: Select, InsertNode, MoveNode, ReparentNode, ResizeNode, SetProps, UpdateTask. 명령별 사전조건/검증/이전값/후값/revision을 기록한다.
- 상태: idle → pressed → dragging/resizing → commit/cancel. move 중 전체 `app.innerHTML` 교체와 localStorage 쓰기는 금지한다.
- `bindDragAndDrop()` 반복 등록 경로도 정리한다. 하나의 포인터 세션이 명령 두 개를 만들지 않는 회귀 테스트를 추가한다.

### P3 라이브러리 선택

기준 화면의 첫 구현은 **하나의 기본 스택(MUI + 자체 app recipes)**으로 만든다. shadcn/Astryx/SEED 대체 어댑터는 같은 recipe/props 계약을 충족할 때 추가한다. 한 화면의 모든 요소를 서로 다른 라이브러리로 섞어 픽셀 재현을 어렵게 하지 않는다.

재사용 단위는 픽셀 하나가 아니라 **AppShell, Toolbar, BoardLane, TaskCard, TaskDetail**이다. 레시피를 넣은 후 자식 노드를 독립 선택·수정·재배치할 수 있어야 한다. 보드 전체를 이미지 또는 편집 불가능한 iframe 한 장으로 넣고 성공으로 계산하지 않는다.

Fixture는 객체 배열로 정의: task id/title/project/status/assignee/due/checklist. 이미지 속 '진행 중 8' 같은 예시 집계값은 사실로 복제하지 말고 실제 fixture에서 계산한다. 최소 10개 작업, 3개 담당자, 상태 3종, 긴 제목 1개, 비어 있는 열 1개에 대한 별도 상태를 준비한다.

### P4 iframe 처리

단기: 편집 geometry는 부모 DOM에 두고 iframe 위 오버레이로 hit test한다. CSS 격리는 보존한다. 이벤트 capture만 바꿔 실제 클릭과 편집이 충돌하지 않게 한다.

중기: provider별 lazy runtime과 페이지 단위 host를 검토한다. DOM 직접 mount·ShadowRoot·iframe host는 테마/포털/접근성/성능 spike 후 선택하며, Shadow DOM이 모든 라이브러리에서 작동한다고 가정하지 않는다. sandbox를 무조건 완화하지 않는다. postMessage를 쓰면 source window, session nonce, payload schema를 검증한다.

Export는 고정 CSS/HTML 외에 실행 가능한 recipe source, fixture data, tokens, provider/version, component props, layout constraints를 포함해야 한다. 수정된 scene이 무시되고 예전 HTML template만 재빌드되는 경로는 합격으로 보지 않는다.

## 6. 검증 시나리오와 합격 기준

아래 수치는 **제안된 release gate**이지 현재 달성한 성능이 아니다.

| 시험 | 실제 조작 | 합격 기준 |
| --- | --- | --- |
| 셸 조립 | 사이드바·본문·상세 패널을 캔버스로 drag | 올바른 부모/순서, 빈 루트에 중복 노드 없음 |
| 패널 resize | 상세 패널 왼쪽 핸들 drag, 320→400px | 부모 좌표 기준 목표 ±4px; 본문이 정상 축소 |
| 중첩 이동 | 카드를 수요일 2번째 위치로 drag | 목표 순서/부모 일치; 다른 카드 데이터 불변 |
| 취소·복구 | resize 중 Escape, 이동 후 Undo/Redo | 취소는 프로젝트 fingerprint 불변; 히스토리 정확히 1단계 |
| 좌표 강건성 | zoom 70/100/125%, canvas scroll 전후 | 같은 목표 오차 유지; iframe 경계 횡단에도 pointer 세션 유지 |
| 재현 품질 | 데스크톱 주요 6영역 비교 | 주요 영역 경계 목표 ±8px, 필수 문구/카드/부모 구조 누락 0 |
| 제품 동작 | Preview에서 작업 선택·필터·체크 | 상세와 카드 동일 task id; 필터 결과/체크 상태 일치 |
| 반응형 | 1440/1024/768/390px | 텍스트·버튼 겹침 0; 의도한 보드 스크롤 외 문서 가로 overflow 0 |
| export | ZIP 추출→독립 설치→scene 수정→빌드 | 수정 사항 반영; 노드/props/레이아웃/fixture round-trip 유지 |

반복 시험은 drag/resize 5개 케이스 × 각 5회 = 25회. 첫 시도 성공 23/25 이상을 초기 목표로 하고 실패별 원인·재시도 횟수도 함께 보고한다. 시각 재현 점수와 조작 성공률은 별도 지표다. 25회 결과를 일반적인 모델 성능으로 과장하지 않는다.

성능 목표: 50개 편집 노드에서 pointer-to-paint p95 ≤50ms, UI commit 피드백 p95 ≤200ms. 동일 장비·viewport·라이브러리 조합에서 측정하며 실패하면 P4를 먼저 수행한다. 화면 녹화로 프레임 시간을 추정하지 않고 앱 계측을 사용한다.

실제 Computer Use 시험은 JSON 주입, DOM 좌표 강제 변경, 내부 명령 직접 실행 없이 수행한다. 이런 방법은 단위/통합 테스트로 따로 분리한다. 모델명/버전/설정/도구 접근 방식은 시험 당시 실제 값으로 기록한다. Astra라는 이름만으로 성공을 가정하지 않는다.

영상은 연속 포인터 경로·리사이즈 핸들·실패와 복구를 볼 수 있는 실제 녹화가 원칙이다. 탭 캡처만 가능한 환경이면 저프레임/구간 생략 여부를 표시하고 부드러운 드래그가 검증됐다는 근거로 사용하지 않는다.

## 7. 시간·토큰 검증은 어떻게 연결하는가

사용자의 최종 목표는 예쁜 편집기가 아니라 **잘못된 결과를 늦게 받는 문제 감소**다.

- gate 이전: 명령 지연, 조작 실패, 사용자 수정 횟수, 이미지 대비 누락만 측정한다.
- gate 이후: 동일 브리프/모델/품질 기준의 직접 구현 경로와 image-first 경로를 각각 최소 3회 탐색 비교한다. 실행 순서를 교차하고 샘플이 작음을 명시한다.
- 이미지 생성 비용·대기, 분석, Computer Use 호출/스크린샷 토큰, 사람이 검토한 시간, 재시도, export 이후 코드 수정까지 모두 포함한다.
- 지표: time-to-first-preview와 time-to-approved-direction, 최종 완료 시간, 총 모델 비용/토큰, 사용자 방향 수정 횟수. '로컬 편집 API 0회'를 '전체 비용 0'으로 바꾸지 않는다.
- 사용자의 품질 승인 기준을 먼저 고정한다. 30–40분 절감률은 측정 후에만 제시한다.

## 8. 다음 개발 착수 단위

**P1 + P2의 최소 vertical slice:** 기존 frame 하나와 MUI card 하나를 이용해, `선택 → 오른쪽 핸들 drag resize → 다른 frame으로 drag → Escape/Undo → export 동일성`을 완성한다. 그 다음 고품질 레퍼런스의 AppShell/Board/TaskDetail을 추가한다.

이번 단계의 범위 밖: 이미지 생성 로그인/과금 연동, 임의 사이트 자동 복제, 모든 디자인 시스템 전체 이식, 동시 협업, 벡터 드로잉, 완전한 Figma 대체, 백엔드 제품 기능.

## 설계 참고

- W3C Pointer Events: https://www.w3.org/TR/pointerevents3/ (pointer capture/cancel의 구현 근거)
- W3C Dragging Movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html (드래그 외 대안도 유지)

접근성 대안 제공과 Computer Use 포인터 조작 성공은 상호 보완적이다. 숫자 입력이 가능하다는 사실만으로 실제 drag/resize를 검증했다고 표시하지 않는다.
