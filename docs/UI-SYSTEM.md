# 앱 디자인 시스템 (UI-SYSTEM)

앱 자체의 모양(색, 글자, 간격, 모서리, 그림자, 조작 높이)과 부품을 한 곳에서 정하는 방법. 0.3-F2에서 들였고, 기존 화면에는 아직 입히지 않았다(F3 ~ F5에서 화면마다 옮긴다). 근거 시안: `lab/review-board/proposals/0.3-F/`(`tokens.css`, `base.css`, `06-system.html`).

캔버스 위의 디자인(사용자의 페이지)은 이 시스템의 대상이 아니다. 그것은 `src/design/`과 `page.css`가 맡는다.

## 원천 하나, 생성물, 시험

| 파일 | 하는 일 |
|---|---|
| `src/ui/tokens.ts` | **원천.** 원값(중립 12단계, 녹색 · 파랑 · 금색 · 의미색), 단계(글자 6 · 굵기 3 · 간격 7 · 모서리 · 조작 높이 · 아이콘 · 움직임), 밝은 판 · 어두운 판의 역할, 대비를 볼 글자 · 바탕 짝 |
| `scripts/build-ui-tokens.mjs` | 원천을 `src/ui/tokens.css`와 이 문서의 토큰 표로 옮긴다: `node scripts/build-ui-tokens.mjs` |
| `src/ui/tokens.css` | **생성물.** 손으로 고치지 않는다. 모든 이름은 `--ui-` 접두사. `:root`(밝은 판), `[data-theme="dark"]`, Mac이 어두운 모드일 때(`prefers-color-scheme`, `data-theme="light"`가 아니면) |
| `src/ui/components.css` | 부품. 클래스는 모두 `ui-` 접두사, 값은 토큰만 |
| `public/fonts/PretendardVariable.woff2` | 앱의 글꼴. 앱에 들어 있고 네트워크에서 받지 않는다(OFL, `public/fonts/LICENSE.txt`) |
| `ui-gallery.html` + `src/ui/gallery.css` | 견본 페이지(개발용). `npm run dev` 뒤 `/ui-gallery.html`, `#light` · `#dark`로 판을 고른다. 앱 묶음에는 들어가지 않는다 |

`index.html`이 `tokens.css` → `components.css` 순서로 불러온다. 앱 코드는 `tokens.ts`를 import하지 않는다.

우회를 거절하는 시험:

- `tests/ui-tokens.test.ts`: 생성물과 이 문서의 표가 원천과 같다. 모든 이름이 `--ui-`로 시작한다. `tokens.css`는 사용자 정의 속성만 둔다(`color-scheme`을 `:root`에 두면 Mac이 어두운 모드일 때 기존 화면의 스크롤 막대와 입력 칸이 바뀐다. 그래서 `.ui-root`가 토큰으로 정한다).
- `tests/ui-components.test.ts`: `src/ui/*.css`(tokens.css 제외)에 원값(색, px) 0개. 모든 선택자가 `.ui-` 클래스에 묶여 있다(맨 `button`, `*`, 홀로 쓴 `.is-on` 금지). 키보드 포커스 고리. 한글 `keep-all`. 글꼴은 앱 안의 파일이고 이름이 `Pretendard Variable`(디자인이 쓰는 `Pretendard`와 겹치지 않게). 견본은 빌드 입력이 아니다.
- `tests/ui-contrast.test.ts`: 원천에서 두 판의 대비를 계산한다. 글자 4.5, 큰 글 · 그래픽 3. 부품이 글자색으로 쓰는 역할은 모두 짝 목록에 있어야 한다.
- `tests/ui-ratchet.test.ts`: 옛 CSS의 색 수 · 글자 크기 수는 늘 수 없다(아래 래칫).

## 새 화면을 만들 때

1. **토큰만 쓴다.** 색과 크기는 `var(--ui-…)`. 원값을 쓰고 싶으면 먼저 `tokens.ts`에 역할을 더하고(이름이 뜻을 말하게), 대비 짝을 적는다.
2. **색에는 뜻이 있다.** 녹색(`accent`) = 주 동작 하나, 파랑(`select`) = 사람의 선택과 포커스, 금색(`agent`) = 에이전트가 하는 일, 의미색(`ok` · `warn` · `danger`) = 상태. 장식으로 쓰지 않는다. 한 화면에 녹색 주 버튼은 하나.
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
| 도구 막대 | `ui-toolbar` > `ui-icon-btn` + `ui-toolbar-sep` | |

## 알려진 한계 (오너가 정할 것)

- **`text-3`(밝은 판 3.52:1)는 글자 기준 4.5에 못 미친다.** 승인된 시안대로 두고, 자리 표시 · 비활성 · 되풀이하는 메타(`ui-row-meta`, `ui-tab-count`, `ui-kbd`, `ui-caps`)에만 쓰는 조건으로 3:1을 적용했다. 시안에서 `text-3`이던 고르지 않은 탭 글자는 사람이 읽고 누르는 글이라 `text-2`로 올렸다.
- **어두운 판의 녹색 채움은 패널 바탕과 2.46:1**(켜진 스위치 막대, 연결 카드 테두리). 시안은 흰 글자 6.52:1을 지키려고 두 판에 같은 녹색을 쓴다. 손잡이 위치와 "연결됨" 알약이 상태를 함께 알린다. `tokens.ts`의 `short`에 사유와 함께 고정되어 있고, 고쳐지면 시험이 그 표시를 지우라고 알린다.
- 입력 칸 테두리(`line-strong`)와 꺼진 스위치 막대는 바탕과 3:1이 안 된다. 짝 목록에 넣지 않았다.
- Mac이 어두운 모드면 `--ui-` 역할은 어두운 판이 되지만 옛 화면은 밝은 판 그대로다. 옛 화면 안에 부품을 섞어 쓰면 판이 어긋나므로, 화면을 옮길 때는 그 화면 루트 전체를 옮긴다.
- 래칫은 `.css` 파일만 센다. `.ts` 안에 쓴 CSS와 `style=""`는 세지 않는다.

## 래칫: 옛 CSS는 늘지 못한다

`src/` 아래 `.css` 중 `src/ui`, `src/generated`, `src/vendor`를 뺀 파일마다 서로 다른 색 수(16진, `rgb()` 등 색 함수, 이름 색)와 서로 다른 글자 크기 수(`font-size`, `font`의 크기)를 2026-11-18 값으로 고정했다. 늘면 실패하고, 줄면 같은 변경에서 고정값을 낮추라고 실패한다. 새 `.css` 파일을 `src/ui` 밖에 만들면 실패한다.

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
| `--ui-bg-app` | `{n-50}` #F8FAF8 | `{n-950}` #131614 |
| `--ui-bg-panel` | `{n-0}` #FDFEFD | `{n-900}` #1E211F |
| `--ui-bg-raised` | `{n-0}` #FDFEFD | `{n-800}` #323532 |
| `--ui-bg-sunken` | `{n-100}` #F1F3F1 | `{n-950}` #131614 |
| `--ui-bg-canvas` | `{n-100}` #F1F3F1 | `{n-950}` #131614 |
| `--ui-canvas-dot` | `{n-300}` #D1D5D1 | `{n-800}` #323532 |
| `--ui-bg-hover` | `{n-100}` #F1F3F1 | `{n-800}` #323532 |
| `--ui-bg-active` | `{n-200}` #E4E7E4 | `{n-700}` #4A4E4B |
| `--ui-bg-inverse` | `{n-900}` #1E211F | `{n-50}` #F8FAF8 |
| `--ui-line` | `{n-200}` #E4E7E4 | `{n-800}` #323532 |
| `--ui-line-strong` | `{n-300}` #D1D5D1 | `{n-700}` #4A4E4B |
| `--ui-text-1` | `{n-900}` #1E211F | `{n-50}` #F8FAF8 |
| `--ui-text-2` | `{n-600}` #666A66 | `{n-400}` #A9AEAA |
| `--ui-text-3` | `{n-500}` #848985 | `{n-500}` #848985 |
| `--ui-text-inverse` | `{n-50}` #F8FAF8 | `{n-900}` #1E211F |
| `--ui-accent` | `{green-500}` #356748 | `{green-500}` #356748 |
| `--ui-accent-hover` | `{green-600}` #2A583C | `{green-600}` #2A583C |
| `--ui-accent-pressed` | `{green-600}` #2A583C | `{green-600}` #2A583C |
| `--ui-accent-soft` | `{green-soft-light}` #E6F4EA | `{green-soft-dark}` #1D3124 |
| `--ui-accent-text` | `{green-500}` #356748 | `{green-300}` #7FBB93 |
| `--ui-on-accent` | `{n-0}` #FDFEFD | `{n-0}` #FDFEFD |
| `--ui-select` | `{blue-500}` #1A6FE1 | `{blue-500}` #1A6FE1 |
| `--ui-select-soft` | `{blue-soft-light}` #E6F1FF | `{blue-soft-dark}` #1C314E |
| `--ui-on-select` | `{white}` #FFFFFF | `{white}` #FFFFFF |
| `--ui-agent` | `{gold-500}` #B48A32 | `{gold-500}` #B48A32 |
| `--ui-agent-soft` | `{gold-soft-light}` #FBEFD6 | `{gold-soft-dark}` #382C15 |
| `--ui-agent-text` | `{gold-600}` #8A6419 | `{gold-300}` #D0A348 |
| `--ui-on-agent` | `{n-950}` #131614 | `{n-950}` #131614 |
| `--ui-ok-text` | `{ok-600}` #267543 | `{ok-300}` #72C78B |
| `--ui-ok-soft` | `{ok-soft-light}` #E2F6E6 | `{ok-soft-dark}` #1B3422 |
| `--ui-warn-text` | `{warn-600}` #955E11 | `{warn-300}` #E8B45E |
| `--ui-warn-soft` | `{warn-soft-light}` #FFF0D4 | `{warn-soft-dark}` #402C12 |
| `--ui-danger` | `{danger-600}` #BA362E | `{danger-600}` #BA362E |
| `--ui-danger-soft` | `{danger-soft-light}` #FFEAE8 | `{danger-soft-dark}` #4A2321 |
| `--ui-danger-text` | `{danger-600}` #BA362E | `{danger-300}` #F07F77 |
| `--ui-danger-line` | `{danger-600}` #BA362E | `{danger-300}` #F07F77 |
| `--ui-on-danger` | `{white}` #FFFFFF | `{white}` #FFFFFF |
| `--ui-focus` | `{blue-500}` #1A6FE1 | `{blue-500}` #1A6FE1 |
| `--ui-knob` | `{n-0}` #FDFEFD | `{n-0}` #FDFEFD |
| `--ui-scrim` | `rgb(19 22 20 / 0.32)` | `rgb(0 0 0 / 0.5)` |
| `--ui-shadow-panel` | `0 1px 2px rgb(19 22 20 / 0.06), 0 4px 12px rgb(19 22 20 / 0.06)` | `0 0 0 1px rgb(255 255 255 / 0.04), 0 4px 16px rgb(0 0 0 / 0.36)` |
| `--ui-shadow-window` | `0 2px 6px rgb(19 22 20 / 0.08), 0 16px 40px rgb(19 22 20 / 0.14)` | `0 0 0 1px rgb(255 255 255 / 0.06), 0 20px 48px rgb(0 0 0 / 0.5)` |
| `--ui-shadow-press` | `inset 0 1px 4px rgb(0 0 0 / 0.18)` | `inset 0 1px 4px rgb(0 0 0 / 0.3)` |
| `--ui-shadow-knob` | `0 1px 2px rgb(0 0 0 / 0.2)` | `0 1px 2px rgb(0 0 0 / 0.4)` |
| `--ui-shadow-seg` | `0 0 0 1px {line}, 0 1px 2px rgb(0 0 0 / 0.06)` | `0 0 0 1px {line-strong}, 0 1px 2px rgb(0 0 0 / 0.3)` |
| `--ui-swatch-edge` | `rgb(0 0 0 / 0.12)` | `rgb(255 255 255 / 0.14)` |

### 원값과 단계 (두 판 공통)

| 토큰 | 값 |
|---|---|
| `--ui-n-0` | `#FDFEFD` |
| `--ui-n-50` | `#F8FAF8` |
| `--ui-n-100` | `#F1F3F1` |
| `--ui-n-200` | `#E4E7E4` |
| `--ui-n-300` | `#D1D5D1` |
| `--ui-n-400` | `#A9AEAA` |
| `--ui-n-500` | `#848985` |
| `--ui-n-600` | `#666A66` |
| `--ui-n-700` | `#4A4E4B` |
| `--ui-n-800` | `#323532` |
| `--ui-n-900` | `#1E211F` |
| `--ui-n-950` | `#131614` |
| `--ui-green-600` | `#2A583C` |
| `--ui-green-500` | `#356748` |
| `--ui-green-300` | `#7FBB93` |
| `--ui-green-soft-light` | `#E6F4EA` |
| `--ui-green-soft-dark` | `#1D3124` |
| `--ui-blue-500` | `#1A6FE1` |
| `--ui-blue-soft-light` | `#E6F1FF` |
| `--ui-blue-soft-dark` | `#1C314E` |
| `--ui-gold-600` | `#8A6419` |
| `--ui-gold-500` | `#B48A32` |
| `--ui-gold-300` | `#D0A348` |
| `--ui-gold-soft-light` | `#FBEFD6` |
| `--ui-gold-soft-dark` | `#382C15` |
| `--ui-ok-600` | `#267543` |
| `--ui-ok-300` | `#72C78B` |
| `--ui-ok-soft-light` | `#E2F6E6` |
| `--ui-ok-soft-dark` | `#1B3422` |
| `--ui-warn-600` | `#955E11` |
| `--ui-warn-300` | `#E8B45E` |
| `--ui-warn-soft-light` | `#FFF0D4` |
| `--ui-warn-soft-dark` | `#402C12` |
| `--ui-danger-600` | `#BA362E` |
| `--ui-danger-300` | `#F07F77` |
| `--ui-danger-soft-light` | `#FFEAE8` |
| `--ui-danger-soft-dark` | `#4A2321` |
| `--ui-white` | `#FFFFFF` |
| `--ui-font-sans` | `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif` |
| `--ui-font-mono` | `ui-monospace, "SF Mono", Menlo, monospace` |
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
| `--ui-modal-w-lg` | `600px` |
| `--ui-disabled-opacity` | `0.4` |
| `--ui-danger-hover` | `brightness(0.92)` |
| `--ui-danger-press` | `brightness(0.84)` |
| `--ui-ease` | `cubic-bezier(.2, 0, 0, 1)` |
| `--ui-dur-fast` | `120ms` |
| `--ui-dur` | `200ms` |
<!-- tokens:end -->
