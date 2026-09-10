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

**Part C — shadcn vendoring** (next): input, textarea, card, badge, table, skeleton, alert, breadcrumb, pagination (no Radix dependencies needed).

Expected after A+B+C: 35 kinds; for controls and data kinds 3–5 implementations × 3–4 variants = **9–20 options each**; layout sections (hero, features, products…) stay own-only and get variants instead (later).

## 3. Agent readiness — code-side findings

What exists: stable `data-action` hooks (83 distinct), 42 `aria-label`s, `role=status` toasts, `[role=dialog][aria-modal]` modals with focus trap and Escape, `.draft-badge`, `[data-block-id]`/`[data-kind]` identity on the canvas, keyboard: `/` search, Enter select, Cmd/Ctrl-Z/Shift-Z, Alt+arrows reorder, Tab wrap in modals. The assembly brief is a good "context snapshot" but lives behind the Agent console.

Gaps an agent hits (to be confirmed by the probe):
- **No in-app discoverability surface.** The set of available kinds/providers/variants/states and the current selection/insertion state are only visible by opening modals one at a time. Proposal: a "Context" panel or `?`/command palette (`Cmd-K`) that lists actions with their labels and shortcuts, and a compact machine-readable state readout (page, selection, system, approval, counts) that is always on screen and also exposed as `data-*` attributes on `#app`.
- **Naming drift** between docs and UI (Auto fill vs Get Vibe; "Choose design system" vs the Look & feel card; "Add Navigation" buttons are icon + tooltip in the shelf).
- **Feedback after actions** is a 4.2 s toast; long errors vanish. Proposal: keep the last 5 receipts in the status bar, and make `role=status` text persist until the next action.
- **Options are not enumerable from the canvas**: the inspector shows variant/state selects only after selecting a block; the catalog shows one variant at a time via a dropdown. Proposal: variant chips in the catalog card and an "all variants" strip in Full preview.
- **Shortcuts are undocumented in-app.**

## 4. Blind probe report

_(appended when the probe agent finishes)_
