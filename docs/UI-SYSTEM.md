# 앱 디자인 시스템 (UI-SYSTEM)

앱 자체의 모양(색, 글자, 간격, 모서리, 그림자, 조작 높이)과 부품을 한 곳에서 정하는 방법. 0.3-F2에서 들였고, 0.3-L3에서 색을 오너가 고른 방향 A(종이 · 잉크 · 금색, 11/23)로 바꾸고 화면을 옮길 때 쓸 부품을 더했다. 옛 화면은 아직 이 시스템을 쓰지 않는다(L4에서 화면마다 옮긴다). 근거 시안: 단계와 첫 부품은 `lab/review-board/proposals/0.3-F/`(`tokens.css`, `base.css`, `06-system.html`), 색과 새 부품은 `lab/review-board/proposals/0.3-D2/app/`(`tokens-a.css`, `preview.css`, `preview-*.html`, `contrast.md`).

캔버스 위의 디자인(사용자의 페이지)은 이 시스템의 대상이 아니다. 그것은 `src/design/`과 `page.css`가 맡는다.

## 원천 하나, 생성물, 시험

| 파일 | 하는 일 |
|---|---|
| `src/ui/tokens.ts` | **원천.** 원값(밝은 판 `n-*` · 어두운 판 `d-*` 중립 12단계씩, 보드 바닥, 잉크, 파랑, 금색, 의미색. 녹색은 성공 `ok-*`에만), 단계(글자 6 · 굵기 3 · 간격 7 · 모서리 · 조작 높이 · 아이콘 · 움직임), 밝은 판 · 어두운 판의 역할, 대비를 볼 글자 · 바탕 짝 |
| `scripts/build-ui-tokens.mjs` | 원천을 `src/ui/tokens.css`와 이 문서의 토큰 표로 옮긴다: `node scripts/build-ui-tokens.mjs` |
| `src/ui/tokens.css` | **생성물.** 손으로 고치지 않는다. 모든 이름은 `--ui-` 접두사. `:root`(밝은 판), `[data-theme="dark"]`, Mac이 어두운 모드일 때(`prefers-color-scheme`, `data-theme="light"`가 아니면) |
| `src/ui/components.css` | 부품. 클래스는 모두 `ui-` 접두사, 값은 토큰만 |
| `public/fonts/PretendardVariable.woff2`, `GeistMonoVariable.woff2` | 앱의 글꼴(본문 Pretendard, 고정폭 Geist Mono). 앱에 들어 있고 네트워크에서 받지 않는다(둘 다 OFL: `LICENSE.txt`, `GeistMono-OFL.txt`. 받은 곳과 판은 `SOURCES.txt`) |
| `ui-gallery.html` + `src/ui/gallery.css` | 견본 페이지(개발용). `npm run dev` 뒤 `/ui-gallery.html`, `#light` · `#dark`로 판을 고른다. 앱 묶음에는 들어가지 않는다 |

`index.html`이 `tokens.css` → `components.css` 순서로 불러온다. 앱 코드는 `tokens.ts`를 import하지 않는다.

우회를 거절하는 시험:

- `tests/ui-tokens.test.ts`: 생성물과 이 문서의 표가 원천과 같다. 모든 이름이 `--ui-`로 시작한다. `tokens.css`는 사용자 정의 속성만 둔다(`color-scheme`을 `:root`에 두면 Mac이 어두운 모드일 때 기존 화면의 스크롤 막대와 입력 칸이 바뀐다. 그래서 `.ui-root`가 토큰으로 정한다).
- `tests/ui-components.test.ts`: `src/ui` 아래 모든 깊이의 `.css`(맨 위 `tokens.css` 제외)를 읽는다.
  - **원값 0개.** 단위가 붙은 수는 모두 원값이다. 예외는 `%` · `fr`(몫)과 `100vh` · `100vw` · `100dvh`(화면 전체)뿐. 이름 색(`red`, `gray` …), 크기 낱말(`small`, `thin` …), 색 함수(`rgb()` …), `color-mix()` · `light-dark()` 안의 날색, 대문자 단위(`2PX`)도 잡는다. 단위 없는 수(0, 굵기, `calc()`의 배수)와 `transparent` · `currentColor` · `inherit` · `none`은 된다.
  - **범위.** 선택자가 꾸미는 대상(마지막 덩어리)이 `.ui-` 클래스를 갖거나 `.ui-` 조상 안에 있어야 한다. `:has()` · `:not()` · `:is()` 안의 `.ui-`나 `~` · `+` 왼쪽의 `.ui-`는 세지 않는다(`body:has(.ui-modal)`, `.ui-modal ~ #app` 금지).
  - **포커스 고리.** 포커스를 받는 부품마다 시트가 주는 모든 상태(켜짐 · 선택 · 눌림 · 호버, 하나씩과 한꺼번에)에서 이기는 `box-shadow`에 `--ui-focus`가 남고, 강제 색 모드를 위한 투명 `outline`이 있다.
  - 비활성 부품은 호버 · 눌림에 바뀌지 않는다. `<select disabled>`를 담은 `ui-select`는 비활성으로 보인다. 움직임 줄이기에서는 전환이 모두 멈춘다.
  - 한글 `keep-all`. 글꼴은 앱 안의 파일이고 이름이 `Pretendard Variable`, `Geist Mono Variable`(디자인이 쓰는 `Pretendard`, `Geist Mono`와 겹치지 않게). 고정폭 뒤에는 한글을 위해 Pretendard가 선다. 녹색 또는 녹색 기운의 값(OKLCH 색조 115–180)은 `ok-*` 말고는 없다(`tests/ui-tokens.test.ts`). 견본은 빌드 입력이 아니다.
- `tests/ui-contrast.test.ts`: 부품이 **실제로 그리는** 조합을 시트에서 뽑는다(상태마다 이기는 글자색과 그 뒤의 바탕, 테두리와 그 바깥, 채움과 그 뒤). 목록에 없거나 그려지는 방식보다 낮은 기준으로 적힌 조합이 있으면 실패한다. 글자 4.5, 그래픽 3, 메타 3(아래).
- `tests/ui-ratchet.test.ts`: 옛 CSS의 색 수 · 글자 크기 수는 늘 수 없고, 같은 수에서 하나를 새것으로 바꿔도 실패한다(아래 래칫).

읽는 장치는 `tests/support/css.ts` 하나다: 시트의 규칙, 선택자가 닿는 요소, 이기는 선언. 시트가 그리는 상태마다 작은 문서를 만들어 묻는다. 읽지 못하는 선택자를 만나면 실패한다.

## 새 화면을 만들 때

1. **토큰만 쓴다.** 색과 크기는 `var(--ui-…)`. 원값을 쓰고 싶으면 먼저 `tokens.ts`에 역할을 더하고(이름이 뜻을 말하게), 대비 짝을 적는다.
2. **색에는 뜻이 있다.** 잉크(`accent`) = 주 동작 하나, 파랑(`select`) = 사람의 선택과 포커스, 금색(`agent`) = 에이전트가 하는 일(수 같은 작은 표식은 `mark`), 의미색(`ok` · `warn` · `danger`) = 상태. 녹색은 성공(`ok`)에만. 장식으로 쓰지 않는다. 한 화면에 잉크 주 버튼은 하나.
3. **부품부터 찾는다.** 아래 목록에 있으면 그 클래스를 쓰고, 없으면 `components.css`에 `ui-` 부품으로 더한 뒤 견본에 상태를 모두 올린다(기본 · 호버 · 눌림 · 비활성 · 포커스).
4. **글자는 6단계(11 · 12 · 13 · 15 · 20 · 28), 굵기 3개, 기본 13.** `text-3`은 자리 표시 · 비활성 · 되풀이하는 메타에만. 읽고 행동해야 하는 글은 `text-2` 이상.
5. **누르는 것은 28 이상, 키보드로 닿고 고리가 보인다.** 판은 `data-theme`로만 바꾸고, 화면 루트에 `ui-root`를 둔다(글꼴, `keep-all`, `color-scheme`).

## 부품

상태는 실제 `:hover` · `:active` · `:disabled` · `:focus-visible`에 반응하고, 견본에서 멈춰 보이도록 `.is-hover` · `.is-pressed` · `.is-disabled` · `.is-focus`도 받는다. 켜짐 · 현재 · 선택은 `.is-on`과 ARIA(`aria-pressed`, `aria-selected`, `aria-current`) 둘 다 받는다.

| 부품 | 클래스 | 변형 · 크기 |
|---|---|---|
| 화면 루트 | `ui-root` | 글꼴, 13/20, `keep-all`, `color-scheme` |
| 아이콘 | `ui-icon` | `ui-icon-xs` 12 · `ui-icon-sm` 14 · 기본 16 · `ui-icon-lg` 20 |
| 글자 | `ui-text-11` … `ui-text-28`, `ui-mono`, `ui-caps` | |
| 버튼 | `ui-btn` + `ui-btn-primary` · `-secondary` · `-quiet` · `-danger` | 28 기본 · `ui-btn-md` 32 · `ui-btn-lg` 40, `ui-btn-block`, `ui-btn-small-text` |
| 아이콘 버튼 | `ui-icon-btn` | `ui-icon-btn-md`, `.is-on` |
| 단축키 | `ui-kbd` | |
| 입력 | `ui-label`, `ui-input`, `ui-help` | `ui-input-sm`, `.is-error` · `aria-invalid`, `.is-error`인 `ui-help` |
| 글 상자 | `ui-textarea` | |
| 선택 | `ui-select` > `select` + `ui-icon` | `ui-select-sm`, `ui-select-quiet` |
| 스위치 | `ui-switch` > `input.ui-switch-input[role=switch]` + `ui-switch-track` | |
| 세그먼트 | `ui-seg` > `ui-seg-item` | `ui-seg-md`, `ui-seg-block` |
| 탭 | `ui-tabs` > `ui-tab` (+ `ui-tab-count`) | |
| 칩 | `ui-chip` | `ui-chip-sm`, `ui-chip-dashed`, `.is-on` |
| 상태 알약 · 점 · 아바타 | `ui-pill`, `ui-dot`, `ui-avatar` | `-ok` · `-warn` · `-danger` · `-agent` · `-select` · `-accent` |
| 띠 | `ui-banner` > `ui-icon` + `ui-banner-body`(`ui-banner-title`, `ui-banner-text`) | `ui-banner-ok` · `-warn` · `-danger` · `-agent` |
| 알림 | `ui-toast` | |
| 모달 | `ui-scrim` > `ui-modal` > `ui-modal-body`(`ui-modal-title`, `ui-modal-text`) + `ui-modal-foot` | `ui-modal-lg` |
| 패널 머리 | `ui-panel-head` > `ui-panel-title` + `ui-icon-btn` | |
| 목록 줄 | `ui-row` (+ `ui-row-meta`) | `.is-on` 현재, `.is-selected` 사람의 선택, `.is-agent` 에이전트 |
| 카드 | `ui-card` | |
| 연결 카드 | `ui-connect` > `ui-connect-head`(`ui-connect-mark`, `ui-connect-name`), `ui-connect-desc`, `ui-connect-found`, `ui-connect-actions` | `.is-connected` |
| 요청 입력창 | `ui-composer` > `ui-composer-input`(textarea) + `ui-composer-foot`(`ui-attach`, `ui-composer-push`, `ui-working`, `ui-send`) | `ui-composer-lg`, `ui-composer-compact` |
| 도구 막대 | `ui-toolbar` > `ui-icon-btn` + `ui-toolbar-sep` (+ 배율은 `ui-btn ui-btn-quiet`) | `ui-toolbar-float` 보드 아래 가운데에 떠 있는 것 |

0.3-L3에서 더한 부품(L4가 옛 화면을 옮길 때 쓴다. 출발점은 `0.3-D2/app/preview.css`):

| 부품 | 클래스 | 변형 · 상태 |
|---|---|---|
| 옆 패널 | `ui-side` > `ui-side-head`(`ui-side-title` > `ui-side-name` + `ui-side-sub`, 접기는 `ui-icon-btn`) + `ui-side-body` + `ui-side-foot` | `ui-side-end` 오른쪽 패널 |
| 목록 머리 | `ui-list-head` > `ui-list-title` + `ui-list-count`(금색 수) + `ui-icon-btn` | |
| 검색 줄 | `ui-search` > `ui-icon` + `ui-search-text` + `ui-kbd` | 팔레트를 여는 단추. 호버 · 눌림 · 포커스 · 비활성 |
| 목록 줄 더하기 | `ui-row` + `ui-row-thumb`(왼쪽 그림) · `ui-row-name` · `ui-row-meta ui-mono`(종류) | `ui-row-md` 32, `.is-dragging` 끌고 있는 줄, 놓일 자리 `ui-drop-line` |
| 보드 바닥 | `ui-floor` | 점 무늬(`canvas-dot`, `canvas-dot-size`, `canvas-dot-gap`) |
| 틀 | `ui-frame` > `ui-frame-head`(`ui-icon`, `ui-frame-name`, `ui-frame-size`, `ui-pill-agent`, 눈 `ui-icon-btn`) + `ui-frame-sheet`(`bg-page`) | `.is-selected` 이름이 파랑, `.is-agent` 금색 테두리. 색은 `.ui-floor` 아래에서만 정한다 |
| 선택 테두리 | `ui-selection` > `ui-handle` × 4 | `ui-handle-nw` · `-ne` · `-sw` · `-se` |
| 도움말 단추 | `ui-fab` | 둥근 32, 떠 있음 |
| 메뉴 | `ui-menu` > `ui-menu-item`(+ `ui-menu-key`) + `ui-menu-sep` | `.is-danger`, 호버 · 눌림 · 포커스 · 비활성 |
| 위 줄(띠) | `ui-strip` > `ui-dot` · `ui-strip-strong` · `ui-strip-changes` · `ui-strip-push` · `ui-btn` | `ui-strip-agent` 에이전트 모드, `-warn` 경고, `-danger` 폴더 없음 |
| 알림 더하기 | `ui-toast` (+ `ui-icon`, 되돌리기는 안의 `ui-btn`) | `ui-toast-error` |
| 모달 머리 | `ui-modal-head` > `ui-modal-heading`(`ui-modal-kicker` 작은 표지, `ui-modal-title` 20, `ui-modal-text`) + 닫기 `ui-icon-btn` | `ui-modal-md` 560, 발 `ui-modal-foot-plain` + `ui-modal-foot-note`, 본문 `ui-modal-stack` |
| 확인 창(위험) | `ui-modal` + `ui-modal-foot`의 `ui-btn-danger` | |
| 선택지 카드 | `label.ui-option` > `input.ui-option-input[type=radio]` + `ui-option-radio` + `ui-option-icon` + (`ui-option-name` > `ui-option-ext`, `ui-option-why`) + `ui-option-sub` | `.is-on` 또는 `:checked`, 호버 · 포커스 · 비활성 |
| 체크 줄 | `label.ui-check` > `input.ui-check-input` + `ui-check-box` > `ui-icon`(check) + `ui-check-label` + `ui-check-help` | `ui-check-boxed` 가라앉은 상자, 호버 · 켜짐 · 포커스 · 비활성 |
| 작업공간 고르기 | `ui-ws` > `ui-avatar ui-avatar-accent` + `ui-ws-name` + `ui-icon` | 호버 · 눌림 · 포커스 · 비활성 |
| 사이드바 항목 | `ui-row` + `ui-row-meta`(수, 고정폭 숫자) | |
| 보드 카드 | `ui-board-card` > `ui-board-card-thumb`(단추, `ui-pill`) + `ui-board-card-actions`(즐겨찾기 · 더 보기 `ui-icon-btn`) + `ui-board-card-head`(`-name`, `-counts`) + `ui-board-card-by`(`ui-avatar`, `-when`, `-changed`) | 호버 · 포커스에 더 보기가 보인다, `.is-pinned` |
| 격자 · 목록 전환 | `ui-seg` + 아이콘 `ui-seg-item` | |
| 빈 상태 | `ui-empty` > `ui-empty-art` 또는 `ui-icon`, `ui-empty-title`, `ui-empty-text`, `ui-empty-actions` | |
| 페이지만 보기의 위 줄 | `ui-pagebar` > 뒤로 `ui-icon-btn` + `ui-pagebar-from` + `ui-pagebar-slash` + `ui-pagebar-title` + `ui-pagebar-size` + `ui-pagebar-push` + 단추 | |
| 색 칸 · 범위 | `ui-swatch`(`label.ui-input` 안, 바탕은 그 색), `ui-range` | 범위는 비활성 |

## 알려진 한계 (오너가 정할 것)

- **`text-3`은 가장 흐린 단계라 메타에만 쓴다.** 방향 A에서는 패널 · 사이드바 · 가라앉은 바탕 · 호버 위에서 4.5를 넘지만(밝은 판 5.77 · 5.43 · 4.93 · 4.93), `bg-active` 위에서는 4.28 / 4.17이다. 자리 표시와 되풀이하는 메타(`ui-row-meta`, `ui-tab-count`, `ui-kbd`, `ui-caps`, `ui-side-sub`, 틀 크기, 메뉴 단축키, 파일 확장자, 보드 카드의 때, 페이지 막대의 경로 구분과 크기), 비활성 부품, 아이콘만 `text-3`을 쓰고, 시험이 그 규칙들을 목록으로 고정한다. 고르지 않은 탭 글자, 검색 줄의 글, 옆 패널 발의 안내처럼 사람이 읽고 누르는 글은 `text-2`.
- **불 켜진 줄의 메타는 `text-2`.** `text-3`은 현재 · 눌린 줄(`bg-active`)에서 4.5에 못 미치므로, 줄과 메뉴 항목은 불이 켜지면 메타 · 단축키를 `text-2`로 올린다(`bg-active` 위 5.14 / 6.23, 글자 기준으로 고정). 0.3-F에서 이어받은 "지금 줄" 꼬리표의 미달은 이렇게 없어졌고, `text-3`/`bg-active`는 대비 목록에 없어서 그리면 시험이 실패한다.
- **입력 오류 테두리는 새 역할 `danger-line`.** 밝은 판은 그대로(`danger-600`, 5.68), 어두운 판은 `danger-300`(2.83 → 6.19). `danger`는 흰 글자를 얹는 위험 버튼의 바탕이라 바꾸지 않았다.

### 기준에 못 미치는 조합 (`tokens.ts`의 `short`, 하나)

| 조합 | 밝은 판 | 어두운 판 | 쓰는 곳 | 상태 |
|---|---:|---:|---|---|
| `line-strong` on `bg-panel` | **1.70** | **1.78** | 입력 칸 · 글 상자 · 선택 상자 · 요청 입력창 테두리, 꺼진 스위치 막대, 칩 · 보조 버튼 · 연결 카드 테두리 | 보드에서 여쭌다. 3:1로 올리면 시안보다 테두리가 진해진다 |

그래픽이고, 글자에는 예외가 없다. 시험은 이 조합을 지금 그리는 규칙을 목록으로 고정해서, 새 부품이 같은 조합을 그리면 실패한다. 그래서 0.3-L3의 새 부품은 이 조합을 쓰지 않는다: 선택지 카드의 테두리는 `line`(장식), 동그라미 · 체크 상자 테두리는 새 역할 `edge-control`(5.77 / 3.49). 0.3-F의 어두운 판 녹색 채움 예외 둘(`accent` 2.46, `accent-hover` 1.98)은 강조가 잉크가 되면서 없어졌다(16.05 / 14.36, 11.58 / 16.51).

### 아직 검사하지 못하는 것

- **대비:** `color-mix()`로 만든 색(알림 안 버튼의 호버), `filter`(위험 버튼의 호버 · 눌림), `box-shadow`로 그린 것(고리, 에이전트 점의 테두리), 스위치 손잡이와 막대 사이, 반투명 `scrim`. 뒤에 아무 바탕도 없는 부품은 `bg-panel` 위에서만 읽는다(`bg-app` · `bg-raised` · `bg-sunken` 위에 놓인 경우는 그 바탕을 시트가 말할 때만). 견본 시트(`gallery.css`)는 앱에 실리지 않아 읽지 않는다.
- **읽는 장치:** `@media` 안의 규칙은 조건이 하나씩 참일 때를 따로 읽는다(둘 이상이 함께 참인 경우는 보지 않는다). `@media` · `@supports` · `@container` · `@font-face` · `@keyframes` 밖의 at-rule(`@layer`, `@import`)과 중첩 규칙은 읽지 못해 실패한다. `:has()`는 쓴 그대로 비교한다. 형제의 순서는 보지 않는다. 부품 안의 자식은 한 단계만 붙여 본다. 이름이 부품을 닮았지만 한 덩어리에 같이 쓰이지 않는 변형(`ui-btn-primary` 등)과 `ui-icon-btn`은 `tests/support/css.ts`에 이름으로 적혀 있다. 새 변형이 그렇게 생기면 거기에 더한다.
- **판:** 토큰은 `data-theme`와 Mac의 어두운 모드를 따른다. 앱은 `index.html`의 `<html data-theme="light">`로 밝은 판에 고정되어 있고(`tests/app-theme.test.ts`가 지킨다), 실행 중에 바꾸는 코드는 없다. 그래서 Mac이 어두운 모드여도 앱의 `--ui-` 역할은 밝은 판이고, 어두운 판은 견본(`#dark`)에서만 보인다. 앱의 Paper / Midnight 설정은 홈에만 닿고 `data-theme`를 바꾸지 않는다(L4에서 잇는다).
- **옛 시트가 부품에 닿는 것:** `style.css`의 전역 규칙(`button:hover`의 `filter`, `button:disabled`의 `opacity`, `:root`의 12px)이 새 부품에 닿는다. 견본 페이지는 그 시트를 불러오지 않아 보이지 않는다(F3).
- **래칫:** `.css` 파일만 센다. `.ts` 안에 쓴 CSS와 `style=""`, `font: var(…)`, `url(data:…)` 안의 색은 세지 않는다.

## 래칫: 옛 CSS는 늘지 못한다

`src/` 아래 `.css` 중 `src/ui`, `src/generated`, `src/vendor`를 뺀 파일마다 서로 다른 색 수(16진, `rgb()` 등 색 함수, 이름 색)와 서로 다른 글자 크기 수(`font-size`, `font`의 크기)를 2026-11-18 값으로 고정했다. 늘면 실패하고, 줄면 같은 변경에서 고정값을 낮추라고 실패한다. 수 옆에 정렬한 색 · 크기 집합의 짧은 해시(`set`)도 고정해서, 하나를 빼고 새것을 넣어 수가 같아도 실패한다. 새 `.css` 파일을 `src/ui` 밖에 만들면 실패한다(`src/ui` 아래는 어느 깊이든 부품 시험이 맡는다).

| 파일 | 색 | 글자 크기 |
|---|---:|---:|
| `style.css` | 341 | 32 |
| `design/component-explorer.css` | 92 | 15 |
| `workspace/home.css` | 82 | 29 |
| `design/studio.css` | 29 | 11 |
| `reference.css` | 22 | 7 |
| `agent/agent.css` | 10 | 2 |
| `editor/pointer-editor.css` | 9 | 3 |
| `workspace/vault.css` | 3 | 3 |

`page.css` · `patterns.css` · `moa.css`는 셈에 넣지 않는다. 캔버스 위 디자인과 내보낸 페이지를 그리는 CSS(`render.ts`가 셋을 읽는다)라 앱 화면을 옮겨도 줄지 않고, 사용자의 디자인이 어떤 모양일 수 있는지는 이 시스템이 고정할 일이 아니다(오너 결정 2026-11-18). 셋 중 하나가 내보낸 페이지에서 빠지면 시험이 실패해 다시 셈에 넣게 한다.

## 토큰

<!-- tokens:start -->
### 역할 (판마다 다름)

| 토큰 | 밝은 판 | 어두운 판 |
|---|---|---|
| `--ui-color-scheme` | `light` | `dark` |
| `--ui-bg-app` | `{n-50}` #F7F5EF | `{d-50}` #1B1A16 |
| `--ui-bg-panel` | `{n-0}` #FDFCF8 | `{d-100}` #201F1A |
| `--ui-bg-raised` | `{n-0}` #FDFCF8 | `{d-200}` #25241E |
| `--ui-bg-sunken` | `{n-100}` #EEEAE0 | `{d-0}` #131210 |
| `--ui-bg-page` | `{white}` #FFFFFF | `{white}` #FFFFFF |
| `--ui-bg-canvas` | `{floor-light}` #EFEBE1 | `{floor-dark}` #22211C |
| `--ui-canvas-dot` | `rgb(33 31 25 / 0.16)` | `rgb(243 239 227 / 0.14)` |
| `--ui-bg-hover` | `{n-100}` #EEEAE0 | `{d-300}` #2B2A23 |
| `--ui-bg-active` | `{n-200}` #DFDBD0 | `{d-400}` #36342C |
| `--ui-bg-inverse` | `{n-900}` #211F19 | `{d-950}` #F3EFE3 |
| `--ui-line` | `{n-200}` #DFDBD0 | `{d-400}` #36342C |
| `--ui-line-strong` | `{n-300}` #C9C4B6 | `{d-500}` #4A473D |
| `--ui-edge-control` | `{n-500}` #67645A | `{d-600}` #77736A |
| `--ui-text-1` | `{n-900}` #211F19 | `{d-950}` #F3EFE3 |
| `--ui-text-2` | `{n-600}` #5B584E | `{d-800}` #BDB7A6 |
| `--ui-text-3` | `{n-500}` #67645A | `{d-700}` #9B9584 |
| `--ui-text-inverse` | `{n-50}` #F7F5EF | `{d-50}` #1B1A16 |
| `--ui-accent` | `{n-900}` #211F19 | `{d-950}` #F3EFE3 |
| `--ui-accent-hover` | `{ink-hover-light}` #3A372E | `{white}` #FFFFFF |
| `--ui-accent-pressed` | `{ink-hover-light}` #3A372E | `{white}` #FFFFFF |
| `--ui-accent-soft` | `{ink-soft-light}` #E6E0D1 | `{ink-soft-dark}` #2F2D26 |
| `--ui-accent-text` | `{n-900}` #211F19 | `{d-950}` #F3EFE3 |
| `--ui-on-accent` | `{n-50}` #F7F5EF | `{d-50}` #1B1A16 |
| `--ui-select` | `{blue-500}` #1A6FE1 | `{blue-500}` #1A6FE1 |
| `--ui-select-soft` | `{blue-soft-light}` #E6F1FF | `{blue-soft-dark}` #1C314E |
| `--ui-select-text` | `{blue-600}` #155AB8 | `{blue-300}` #7DADF3 |
| `--ui-on-select` | `{white}` #FFFFFF | `{white}` #FFFFFF |
| `--ui-agent` | `{gold-500}` #A37A22 | `{gold-400}` #D8B55A |
| `--ui-agent-soft` | `{gold-soft-light}` #F6ECD3 | `{gold-soft-dark}` #3A3018 |
| `--ui-agent-text` | `{gold-600}` #82601A | `{gold-300}` #DCBD6A |
| `--ui-on-agent` | `{n-950}` #15140F | `{n-950}` #15140F |
| `--ui-mark` | `{gold-600}` #82601A | `{gold-300}` #DCBD6A |
| `--ui-ok-text` | `{ok-600}` #2F7A4A | `{ok-300}` #7CC395 |
| `--ui-ok-soft` | `{ok-soft-light}` #E4F2E8 | `{ok-soft-dark}` #1B3422 |
| `--ui-warn-text` | `{warn-600}` #955E11 | `{warn-300}` #E8B45E |
| `--ui-warn-soft` | `{warn-soft-light}` #FBEFD8 | `{warn-soft-dark}` #402C12 |
| `--ui-danger` | `{danger-600}` #BA362E | `{danger-600}` #BA362E |
| `--ui-danger-soft` | `{danger-soft-light}` #FCEBE8 | `{danger-soft-dark}` #4A2321 |
| `--ui-danger-text` | `{danger-600}` #BA362E | `{danger-300}` #F07F77 |
| `--ui-danger-line` | `{danger-600}` #BA362E | `{danger-300}` #F07F77 |
| `--ui-on-danger` | `{white}` #FFFFFF | `{white}` #FFFFFF |
| `--ui-focus` | `{blue-500}` #1A6FE1 | `{blue-500}` #1A6FE1 |
| `--ui-knob` | `{n-0}` #FDFCF8 | `{n-0}` #FDFCF8 |
| `--ui-scrim` | `rgb(33 31 25 / 0.28)` | `rgb(0 0 0 / 0.56)` |
| `--ui-shadow-panel` | `0 1px 2px rgb(33 31 25 / 0.06), 0 4px 12px rgb(33 31 25 / 0.06)` | `0 0 0 1px rgb(255 255 255 / 0.05), 0 4px 16px rgb(0 0 0 / 0.4)` |
| `--ui-shadow-window` | `0 2px 6px rgb(33 31 25 / 0.08), 0 20px 48px rgb(33 31 25 / 0.16)` | `0 0 0 1px rgb(255 255 255 / 0.07), 0 24px 56px rgb(0 0 0 / 0.55)` |
| `--ui-shadow-frame` | `0 0 0 1px rgb(33 31 25 / 0.06), 0 2px 8px rgb(33 31 25 / 0.07)` | `0 0 0 1px rgb(255 255 255 / 0.07), 0 2px 12px rgb(0 0 0 / 0.45)` |
| `--ui-shadow-press` | `inset 0 1px 4px rgb(0 0 0 / 0.18)` | `inset 0 1px 4px rgb(0 0 0 / 0.3)` |
| `--ui-shadow-knob` | `0 1px 2px rgb(0 0 0 / 0.2)` | `0 1px 2px rgb(0 0 0 / 0.4)` |
| `--ui-shadow-seg` | `0 0 0 1px {line}, 0 1px 2px rgb(0 0 0 / 0.06)` | `0 0 0 1px {line-strong}, 0 1px 2px rgb(0 0 0 / 0.3)` |
| `--ui-swatch-edge` | `rgb(0 0 0 / 0.12)` | `rgb(255 255 255 / 0.14)` |

### 원값과 단계 (두 판 공통)

| 토큰 | 값 |
|---|---|
| `--ui-n-0` | `#FDFCF8` |
| `--ui-n-50` | `#F7F5EF` |
| `--ui-n-100` | `#EEEAE0` |
| `--ui-n-200` | `#DFDBD0` |
| `--ui-n-300` | `#C9C4B6` |
| `--ui-n-400` | `#A29D8F` |
| `--ui-n-500` | `#67645A` |
| `--ui-n-600` | `#5B584E` |
| `--ui-n-700` | `#46433A` |
| `--ui-n-800` | `#302E27` |
| `--ui-n-900` | `#211F19` |
| `--ui-n-950` | `#15140F` |
| `--ui-d-0` | `#131210` |
| `--ui-d-50` | `#1B1A16` |
| `--ui-d-100` | `#201F1A` |
| `--ui-d-200` | `#25241E` |
| `--ui-d-300` | `#2B2A23` |
| `--ui-d-400` | `#36342C` |
| `--ui-d-500` | `#4A473D` |
| `--ui-d-600` | `#77736A` |
| `--ui-d-700` | `#9B9584` |
| `--ui-d-800` | `#BDB7A6` |
| `--ui-d-900` | `#DCD7C9` |
| `--ui-d-950` | `#F3EFE3` |
| `--ui-floor-light` | `#EFEBE1` |
| `--ui-floor-dark` | `#22211C` |
| `--ui-ink-hover-light` | `#3A372E` |
| `--ui-ink-soft-light` | `#E6E0D1` |
| `--ui-ink-soft-dark` | `#2F2D26` |
| `--ui-blue-600` | `#155AB8` |
| `--ui-blue-500` | `#1A6FE1` |
| `--ui-blue-300` | `#7DADF3` |
| `--ui-blue-soft-light` | `#E6F1FF` |
| `--ui-blue-soft-dark` | `#1C314E` |
| `--ui-gold-600` | `#82601A` |
| `--ui-gold-500` | `#A37A22` |
| `--ui-gold-400` | `#D8B55A` |
| `--ui-gold-300` | `#DCBD6A` |
| `--ui-gold-soft-light` | `#F6ECD3` |
| `--ui-gold-soft-dark` | `#3A3018` |
| `--ui-ok-600` | `#2F7A4A` |
| `--ui-ok-300` | `#7CC395` |
| `--ui-ok-soft-light` | `#E4F2E8` |
| `--ui-ok-soft-dark` | `#1B3422` |
| `--ui-warn-600` | `#955E11` |
| `--ui-warn-300` | `#E8B45E` |
| `--ui-warn-soft-light` | `#FBEFD8` |
| `--ui-warn-soft-dark` | `#402C12` |
| `--ui-danger-600` | `#BA362E` |
| `--ui-danger-300` | `#F07F77` |
| `--ui-danger-soft-light` | `#FCEBE8` |
| `--ui-danger-soft-dark` | `#4A2321` |
| `--ui-white` | `#FFFFFF` |
| `--ui-font-sans` | `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif` |
| `--ui-font-mono` | `"Geist Mono Variable", "Pretendard Variable", ui-monospace, "SF Mono", Menlo, monospace` |
| `--ui-text-11` | `11px` |
| `--ui-lh-11` | `16px` |
| `--ui-text-12` | `12px` |
| `--ui-lh-12` | `16px` |
| `--ui-text-13` | `13px` |
| `--ui-lh-13` | `20px` |
| `--ui-text-15` | `15px` |
| `--ui-lh-15` | `22px` |
| `--ui-text-20` | `20px` |
| `--ui-lh-20` | `28px` |
| `--ui-text-28` | `28px` |
| `--ui-lh-28` | `36px` |
| `--ui-w-regular` | `400` |
| `--ui-w-medium` | `500` |
| `--ui-w-semibold` | `600` |
| `--ui-track-20` | `-0.012em` |
| `--ui-track-28` | `-0.022em` |
| `--ui-track-caps` | `0.04em` |
| `--ui-space-1` | `4px` |
| `--ui-space-2` | `8px` |
| `--ui-space-3` | `12px` |
| `--ui-space-4` | `16px` |
| `--ui-space-5` | `24px` |
| `--ui-space-6` | `32px` |
| `--ui-space-7` | `48px` |
| `--ui-radius-1` | `4px` |
| `--ui-radius-2` | `8px` |
| `--ui-radius-3` | `12px` |
| `--ui-radius-pill` | `999px` |
| `--ui-hairline` | `1px` |
| `--ui-ring` | `2px` |
| `--ui-control-sm` | `28px` |
| `--ui-control-md` | `32px` |
| `--ui-control-lg` | `40px` |
| `--ui-icon-12` | `12px` |
| `--ui-icon-14` | `14px` |
| `--ui-icon-16` | `16px` |
| `--ui-icon-20` | `20px` |
| `--ui-icon-stroke` | `1.75` |
| `--ui-switch-w` | `32px` |
| `--ui-switch-h` | `18px` |
| `--ui-switch-knob` | `14px` |
| `--ui-dot` | `8px` |
| `--ui-dot-sm` | `6px` |
| `--ui-avatar` | `20px` |
| `--ui-composer-min-h` | `112px` |
| `--ui-composer-sm-min-h` | `64px` |
| `--ui-composer-lg-min-h` | `152px` |
| `--ui-modal-w` | `420px` |
| `--ui-modal-w-md` | `560px` |
| `--ui-modal-w-lg` | `600px` |
| `--ui-strip-h` | `36px` |
| `--ui-thumb-w` | `28px` |
| `--ui-thumb-h` | `20px` |
| `--ui-handle` | `7px` |
| `--ui-canvas-dot-size` | `0.8px` |
| `--ui-canvas-dot-gap` | `16px` |
| `--ui-disabled-opacity` | `0.4` |
| `--ui-danger-hover` | `brightness(0.92)` |
| `--ui-danger-press` | `brightness(0.84)` |
| `--ui-ease` | `cubic-bezier(.2, 0, 0, 1)` |
| `--ui-dur-fast` | `120ms` |
| `--ui-dur` | `200ms` |
<!-- tokens:end -->
