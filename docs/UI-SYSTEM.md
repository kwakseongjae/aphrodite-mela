# 앱 디자인 시스템 (UI-SYSTEM)

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
