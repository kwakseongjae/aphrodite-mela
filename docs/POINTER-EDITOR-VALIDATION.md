# Pointer editor — first vertical slice

Date: 2026-09-09. Scope: editor mechanics, not completed Moa app reconstruction.

## Implemented

- Backward-compatible version-1 `layout.widthPx`, common block height, export through the same renderer.
- Design-mode selection overlay, named move tab, eight resize handles with 24px hit areas.
- Pointer capture, 4px drag threshold, coordinate conversion for canvas scale, transient DOM preview, one command at release.
- Frame/peer drop target feedback; hierarchy validation; free-frame position; Escape, pointercancel and blur cancellation paths.
- Existing Undo/Redo and local persistence connected to commands. Design mode intercepts official iframe interaction; Preview is for live component interaction.
- Non-destructive Pointer lab page creation: nested workspace, Frame A/B and official MUI card. Existing user pages are preserved.

## Actual UI evidence

Surface: Codex in-app browser at `http://127.0.0.1:1421/`, 1280×720 screenshot, canvas zoom 100%. Actions used actual pointer drags and visible buttons, not injected scene state or number-field edits.

1. Initial exploratory run resized 220→280px and moved A→B.
2. Clean recorded sequence started in B at 280×220px. Right handle drag `(940,513)→(900,513)` produced 240×220px.
3. Move tab drag `(710,390)→(384,389)` moved the card to A at `(19,63)`.
4. Undo once returned to B. Undo twice restored width 280. Redo twice returned to A with width 240.
5. Export dialog downloaded a Draft handoff ZIP. No approval was fabricated.
6. ZIP project, SCENE, HTML and React source template preserve parent and dimensions. Prompt targets the active Pointer lab page.

Recheck: `node scripts/verify-pointer-handoff.mjs`.

Evidence in `artifacts/pointer-editor/`: `before.jpg`, `moved.jpg`, `after-redo.jpg`, `actual-ui-handoff.zip`, `pointer-workflow.mp4`.

Video is 70 sampled screenshots from real actions, played at 4 fps in a 24 fps MP4 (17.5 seconds). Gaps between action segments are omitted. It is not continuous real-time native capture and must not be used to infer latency, frame rate, or task completion time.

## Automated / build checks

- 24 tests pass, including four new tests covering zoom math, all eight handle directions and bounds, command round-trip and invalid hierarchy/dimension rejection.
- Web production build passes. Large main-chunk warning remains (~1.49MB uncompressed).
- Tauri release app bundle builds successfully. This turn's interactive verification used the browser frontend, not a freshly launched native bundle.
- Escape/pointercancel paths are implemented but not exercised through a held-pointer cancellation in this UI run. Mathematical zoom coverage is not real-pointer multi-zoom coverage.

## Remaining work, in order

1. Expand gesture verification: cancel/lost capture, no-op, nested scrolling, 70/85/125% zoom, boundary drags; assert a single persistence write per gesture with instrumentation.
2. Editor UX: edge auto-scroll, snap guides, explicit insertion markers, fixed/hug/fill constraints and keyboard alternatives. Currently geometry editing is blocked when canvas CSS width is ≤650px; narrow Preview reflows separately.
3. Moa app recipes: sidebar, toolbar, board/lane/task card and detail panel sharing one task fixture; distinguish editor movement from task-status changes.
4. Assemble the existing high-fidelity reference through Computer Use, compare major regions, then validate exported app behavior and mobile rules.
5. Only then run matched baseline vs Aphrodite trials: time to approved direction and final app, retries, tokens/cost including image generation and Computer Use. No 30–40 minute reduction or token savings has been established by this test.

Safety: existing files preserved with a pre-implementation shadow snapshot; no reset or source commit performed.
