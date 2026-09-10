# Agent readiness, feature reality check, catalog plan — 2026-09-10

Owner questions: (1) does an external computer-use agent (Astra/Codex) have what it needs to understand context, discover available features/options and start work fast? (2) do the catalog, Get Vibe and bulk palette features actually work? (3) when does the catalog reach 10–20 options per component, and how?

Sources: code audit (this file's author), a blind computer-use probe by a fresh agent that only read `docs/COMPUTER-USE.md` (report appended below when finished), and two Grok 4.6 workers expanding the catalog in parallel.

## 1. What is real today (code-verified)

| Feature | Status | Where | Notes |
| --- | --- | --- | --- |
| Design system presets (bulk palette/font/radius for every page) | **Works** | `systemModal()` → `choose-system` commits `project.system` for all pages | 8 presets in `src/model.ts` `systems`: Atelier, Karrot inspired, Toss inspired, Mono, MUI, shadcn, SEED, Astryx. Undoable, clears approval. |
| Per-token palette edit (Primary / Background / Foreground, typeface, radius) | **Works** | inspector "Look & feel" `input[type=color][data-token]` | Applies to every page immediately. No named-palette save/load, no light/dark pair, no secondary/semantic colours. |
| "Compare color & font drafts" (theme proposal) | **Works** | `themeReview()` → `themeProposal()` / `applyThemeProposal()` | Accent + heading font only; renders a screen-only draft; apply is fingerprint-guarded; not approval. |
| Per-component primary policy (project / source / custom) | **Works, buttons only** | `component-theme.ts` `supportsComponentTheme` | Extend to other kinds once adapters land. |
| Get Vibe (auto-fill) | **Works** | `autofillModal()` → `planVibe()` preview → `apply-vibe` | 4 local packs (lighting, commerce, workspace, travel), EN/KO, protects authored copy unless "replace", one bundled hero photo, reports unsupported blocks and missing image slots. No model call. Naming drift: docs say "Auto fill", UI says "Get Vibe". |
| Import DESIGN.md colours | **Works** | `import-md` | Exact labelled primary/background/foreground only; Karrot/Toss reference snapshots are hash-verified (`bridge.ts`). |
| Component catalog ("Compare across design systems") | **Works, thin** | `explorerModal()` / `catalog-view.ts` | 20 kinds, but official implementations only for button (5: own/MUI/Astryx/SEED/shadcn), input (own/MUI), cards (own/MUI). Every other kind has exactly one implementation. Variants: 2–4 per kind. |
| Reference → OCR → 3 directions | Works on macOS (Apple Vision sidecar) | `reference.ts`, `reference.rs` | Browser build is pixels-only. |
| Agent assembly console + brief | Works | `agentModal()`, `agent/context.ts` `assemblyBrief()` | Brief lists kinds, provider support, current selection/insertion target, run receipts. Only reachable inside the modal. |

### Catalog inventory before this work

| Kind | Implementations | Variants | Options (impl × variants) |
| --- | --- | --- | --- |
| button | 5 | 3 | 15 |
| input | 2 | 3 | 6 |
| cards | 2 | 3 | 6 |
| tabs, stats, table, calendar | 1 | 2–3 | 2–3 |
| notice | 1 | 4 | 4 |
| hero | 1 | 4 | 4 |
| navigation, features, products, testimonial, cta, footer, frame | 1 | 1–5 | 1–5 |
| moa* app recipes (4) | 1 | 1 | 1 |

So the owner's read is right: outside `button` the catalog is effectively single-option.

## 2. Catalog expansion plan (in progress)

Libraries already installed and licensed: MUI 9 (MIT), Astryx 0.5.4 (Apache-2.0), SEED 2.4.1 (Apache-2.0, NOTICE shipped), shadcn source (MIT, vendored per file). Their component surfaces are large (MUI 30+, Astryx 90+, SEED 570 exports). The gap was adapter work, not availability.

**Part A — 15 new project-owned kinds** (Grok worker, branch `grok/own-patterns`): select, checkbox, switch, textarea, badge, avatar, breadcrumb, pagination, progress, skeleton, accordion, chips, slider, stepper, toggle. Each ≥3 variants, ≥2 states, accessible static HTML + CSS, Korean search aliases, catalog groups, tests. Existing kinds get a 4th variant (button soft, input underlined, tabs pills/vertical, cards media, stats compact, table bordered).

**Part B — official adapters** (Grok worker, branch `grok/official-adapters`): renderer registry in `src/vendor/runtime.tsx`, `src/vendor/coverage.ts` as the single source of truth for `providers.kinds`, targets MUI ≥ 20 kinds, Astryx ≥ 16, SEED ≥ 10, per-kind iframe heights, coverage test.

**Part C — shadcn vendoring — merged 14:08**: input, textarea, card, badge, table, skeleton, alert, breadcrumb, pagination vendored under `src/vendor/shadcn` (MIT headers, no Radix beyond react-slot); shadcn coverage 1 → 10 kinds. **Final today: 35 kinds, 341 options** — button/input/notice 20, tabs/cards/table 16, textarea/badge/skeleton 15, most controls 12, stepper 9; layout sections 3–5 (own variants); calendar 3; Moa recipes 1. Runtime bundle 1.34 MB. 117 tests.

**Merged 2026-09-10 13:55 (A + B):** 35 kinds, **298 options** (implementations × variations). Per kind: button 5×4=20; input, tabs, notice 4×4=16; cards, stats, table 3×4=12; select, checkbox, switch, textarea, badge, avatar, progress, skeleton, accordion, chips, slider, toggle 4×3=12; breadcrumb, pagination, stepper 3×3=9; calendar 1×3 (date-picker packages judged too heavy); layout sections (hero 4, frame 5, products 2, others 1) stay own-only for now. Runtime bundle for official components grew 690 kB → 1.32 MB (shared across iframes on native). 114 tests pass. Part C (shadcn: input, textarea, card, badge, table, skeleton, alert, breadcrumb, pagination) is running on `grok/shadcn-vendor` and will raise the 3× kinds to 4× and button-adjacent kinds toward 16–20.

**Layout kinds done 13:57:** navigation 3, features 3 (cards, numbered), products 4 (list, masonry), testimonial 3 (card, wall), CTA 3 (banner, split), footer 3 (columns, minimal) → **310 options**; only the four Moa app-recipe blocks remain single-option by design. Also fixed: palette ↑↓/Enter never reached the list in the native app (the generic modal key guard returned early) — verified after the fix. Next for breadth: shadcn Part C, then SEED/Astryx table+cards mapping and a second pass on variant fidelity per library.

## 3. Agent readiness — code-side findings

What exists: stable `data-action` hooks (83 distinct), 42 `aria-label`s, `role=status` toasts, `[role=dialog][aria-modal]` modals with focus trap and Escape, `.draft-badge`, `[data-block-id]`/`[data-kind]` identity on the canvas, keyboard: `/` search, Enter select, Cmd/Ctrl-Z/Shift-Z, Alt+arrows reorder, Tab wrap in modals. The assembly brief is a good "context snapshot" but lives behind the Agent console.

Gaps an agent hits (to be confirmed by the probe):
- **No in-app discoverability surface.** The set of available kinds/providers/variants/states and the current selection/insertion state are only visible by opening modals one at a time. Proposal: a "Context" panel or `?`/command palette (`Cmd-K`) that lists actions with their labels and shortcuts, and a compact machine-readable state readout (page, selection, system, approval, counts) that is always on screen and also exposed as `data-*` attributes on `#app`.
- **Naming drift** between docs and UI (Auto fill vs Get Vibe; "Choose design system" vs the Look & feel card; "Add Navigation" buttons are icon + tooltip in the shelf).
- **Feedback after actions** is a 4.2 s toast; long errors vanish. Proposal: keep the last 5 receipts in the status bar, and make `role=status` text persist until the next action.
- **Options are not enumerable from the canvas**: the inspector shows variant/state selects only after selecting a block; the catalog shows one variant at a time via a dropdown. Proposal: variant chips in the catalog card and an "all variants" strip in Full preview.
- **Shortcuts are undocumented in-app.**

## 4. Blind probe — what actually happened (2026-09-10 13:2x–13:4x, native app, orchestrator-driven)

A separate fresh subagent was asked to probe the app from screenshots only; it produced no output in ~18 minutes (a macOS "Claude Code: 승인 대기" notification appeared during the run, so it was probably held at a permission prompt) and was stopped. The probe below was driven from the main session with `cliclick` + `screencapture`, deliberately using only what is visible on screen. Screenshots: `lab/probe/p01…p21` (scratchpad).

| Step | Result | Evidence / note |
| --- | --- | --- |
| Discover actions | **Works after today's change**: ⌘K opens the palette; groups Navigate/Design/Review/Edit/File/Add; ↑↓ + Enter run items | p02. Before today there was no such surface. |
| Read state | **Works**: status line `페이지 Home / 2 컴포넌트 / 선택 없음 / Atelier / 초안 / 데스크톱 / 저장됨` updates after every action (turned to 저장 안 됨 → 저장됨 around a save) | p13, p14. Contrast was too low; raised. |
| Get Vibe on an authored page | **Works, but read as broken**: preview reported `0개 필드 변경 · 미지원 컴포넌트 1개` with no explanation. With "작성된 콘텐츠도 교체" on: 3 field changes, apply OK, toast, Undo restored everything | p11, p12, p13, p14. Fixed today: empty plans now explain why, name unsupported kinds and offer a one-click "replace and preview again". |
| Catalog | **Works**: 20 kinds, real renderers for button ×5 (own/MUI/Astryx/SEED/shadcn); every other kind shows `01`; one variant at a time via a dropdown | p15. Breadth is the problem, not the mechanism — see §2. |
| Theme draft (색상·폰트 초안 비교) | **Works but invisible on this page**: "파란색 초안" changed the proposal to #2255cc, yet both previews looked identical because the page had no accent-bearing component; the colour input rendered as a blank white well | p18, p19. Fixed today: current-vs-proposed token strip with hex values, explicit notice when no component uses the primary colour, colour-well styling. |
| Palette via design-system presets | Works (not re-tested today; verified in code and earlier sessions) | `choose-system` |
| Feedback | Toasts stack: the persistent "Design mode · 핸들로 크기 조절…" hint occupies the toast slot and overlaps action toasts | p13. Todo: separate hint bar from action toasts; keep last receipts in the status bar. |
| Approve | Correctly absent from the palette; stays a deliberate click | — |

Native keyboard finding — resolved 14:20: the "arrows/Enter never reach the palette" symptom came from a **second `aphrodite-mela` instance** that the shadcn worker had built and launched from its worktree (pre-merge code) — System Events targeted that stale window, so key events, catalog counts and screenshots were inconsistent. After killing it, ⌘K → ↓×6 → Enter opens the catalog in the native app (p58–p60) and the index shows the merged counts (Action button 05·20, Text area 05·15). Kept as hardening: palette/Escape/⌘K now match on IME-independent `KeyboardEvent.code`, the active item is tracked explicitly (`is-active`/`aria-selected`), Enter on a typed query runs the first match, and a keyup fallback exists. Lesson recorded: `pgrep -x aphrodite-mela` before any native check.

Harness caveats for any computer-use agent on this app: a Korean input source turns `cliclick t:` ASCII into Hangul jamo (type via the palette's Korean labels or switch the IME); `cliclick kp:esc` did not reach the webview while `osascript … key code 53` did; the window must be frontmost before every click.

### Ratings (1–5)
- Onboarding clarity 3 — the home is clear; the editor shows many controls at once and the assembly bar dominates the first view.
- Control naming 3 — mostly good; "Get Vibe" vs "Auto fill" drift fixed in docs; Assembly console / Pin selected frame / Insert at page root need a hover explanation.
- State visibility 4 (was 2) — status line + data-* attributes now cover page/selection/system/approval/viewport/save.
- Feedback after actions 3 — toasts are informative but short and can overlap.
- Catalog breadth as observed 2 — five buttons, everything else single.
- Palette/theme editing 3 — presets and per-token colours work; drafts are hard to judge without accent-bearing components (notice added).

## 5. Clean-install first run with the released v0.1.0 DMG (2026-09-10 15:35)

Method: quit the dev build, moved `~/Library/Application Support/studio.aphrodite.mela` and `~/Library/WebKit/studio.aphrodite.mela` aside, copied `Aphrodite.app` out of the notarized DMG with a Safari quarantine attribute, launched it, then restored both stores and relaunched the dev build. Screenshots `scratchpad/fresh/f01–f09`.

| Step | Result |
| --- | --- |
| Gatekeeper | Opened without any dialog (`spctl` accepted, notarized). |
| First home | Korean (OS locale), empty state with the apple-hand illustration, "첫 프로젝트 만들기" CTA, sidebar counts 0/0/0. Good. |
| Legacy migration caveat | On a Mac that previously ran the *browser* build, WKWebView localStorage still held the legacy single-project key, so the "fresh" app showed one migrated project ("모아 Image First"). Harmless for real new users (no WebKit store), but the migration path should be documented. |
| New project | Modal is still English ("Room for something new." / "Project name" / "Create project" / default name "Untitled project") — in scope of the running localisation worker. |
| First editor view | Empty page with a clear "Start with a component from the library" drop zone. The AGENT ASSEMBLY bar ("Ready", Assembly console / Pin selected frame / Insert at page root) is the first thing a human sees — it should collapse until an assembly run exists. Status bar still says "Local-first workspace / No generation credits used" in this release (the live status line shipped after v0.1.0). |
| Get Vibe on the empty page | Dead end: "0개 필드 변경 · 미지원 컴포넌트 0개". Get Vibe only fills existing blocks. On an empty page it must offer the next step instead ("브리프로 시작" to assemble a draft, "레퍼런스로 3안", or "카탈로그에서 추가"). To implement after the localisation merge (same file). |
| Data restore | User data and WebKit store restored intact (8 projects visible again). |

Next-release checklist derived from this run: collapse the assembly bar by default; Get Vibe empty-page guidance; Korean new-project modal (worker); consider a starter template choice in the new-project modal (blank / brief / sample landing) so the first canvas is never empty.

## 6. Intel build smoke test (2026-09-10 15:42)

`npx tauri build --target x86_64-apple-darwin --bundles app` on the Apple Silicon Mac produced an x86_64 app and an x86_64 OCR sidecar (`scripts/build-vision.mjs` honours `TAURI_ENV_TARGET_TRIPLE`). Under Rosetta 2: the sidecar returned 25 OCR lines on the demo reference, and the app launched, read the shared workspace and rendered the home with all eight projects (`scratchpad/fresh/x64-home.png`). macOS 26 shows its "Intel-based app support is ending" advisory on launch — expected, not a defect. The release workflow now builds both targets in a matrix; the landing page shows an Intel link whenever an `*_x64.dmg` asset exists on the latest release.
