# Foundation validation — 2026-09-09

## Automated

- `npm test`: 36 passing, including 5 new DS/Get Vibe tests.
- `npm run build`: success. Main JS ~1.54 MB uncompressed; chunk-size warning remains.
- `npm run desktop:build`: success, Tauri release `.app`. Packaged native launch/accessibility/signing/notarization/install-from-download were not tested this turn.
- Source integrity: both bundled DESIGN.md files hash-verified; modified bytes rejected. Product primary chosen rather than marketing primary. Original document survives project parse.
- Get Vibe: read-only planning, field-level custom copy protection, untouched pattern defaults, explicit unsupported/missing slots, stale atomic rejection, replacement opt-in, safe roundtrip, generated asset and receipt validation.

## Actual Computer Use

In-app browser 1280×720, http://127.0.0.1:1421. Server was initially unavailable and restarted with Vite; this is not a packaged-app test. No model-state injection was used to assemble the page.

1. Opened Choose design system; inspected local bridge and brand kit.
2. Applied Toss source through UI; inspector showed #3182F6 and #191F28. Used Undo to restore original MUI system, preserving existing pages' styling.
3. Created `Get Vibe · Lighting QA` as a new page alongside the original five pages.
4. Added Navigation, Editorial hero, Collection grid and Footer through UI buttons.
5. Get Vibe preview showed 12 changed text fields; applied through UI.
6. After adding a generated independent Hero asset, a second Get Vibe preview preserved all filled text, proposed one image field and reported one unfilled Collection image slot.
7. Applied photo; Undo produced zero Hero images, Redo restored one. Opened live Preview and visually inspected the result.
8. Exported draft handoff from UI without approving the design. Downloaded `모아-image-first (7).zip`, copied into `artifacts/ds-vibe-brand/actual-handoff.zip`.
9. Inspected actual ZIP: 33 files, active page `page-6.html`, four blocks, generated image (2,430,476 bytes), relative `assets/lighting-hero.png` path, GENERATED-ASSETS.md, VIBE.json and latest receipt with `modelCalled:false` and `imageSource:bundled-generated`.

The model call happened during development asset creation, not on the Get Vibe button. Generation model identity was not exposed. This is a component/copy/asset foundation test, not pixel-fidelity reconstruction, actual pointer-drag benchmark, total token measurement, or proven time savings. The page retains MUI tokens to avoid changing existing project pages. Source bridge applied then undone means this particular final ZIP uses MUI, not imported SOURCE-DESIGN.md; raw OmD source retention is covered by unit tests.

## Friction discovered and addressed

- Auto fill was a single furniture dataset: replaced entrypoint with four domain packs and preview/apply.
- One filled flag could overwrite custom copy: new logic decides per field, and marks copied blocks filled.
- Collection renderer silently injected unrelated stock photos: removed. Shared image repeats across items until per-item asset slots exist.
- Source provenance was only a sentence: introduced hash-checked full source retention with mapped/unmapped field listing.
- UI hot reload clears modal and in-memory undo stack: observed during development. Frozen-build benchmarking is required; do not count these interactions as stable timing evidence.

## Artifacts

- `artifacts/ds-vibe-brand/source-bridge.jpg`
- `artifacts/ds-vibe-brand/brand-kit.jpg`
- `artifacts/ds-vibe-brand/vibe-preview.jpg`
- `artifacts/ds-vibe-brand/lighting-preview.jpg`
- `artifacts/ds-vibe-brand/actual-handoff.zip`
- `public/assets/lighting-hero.png` and `artifacts/ds-vibe-brand/lighting-asset-prompt.txt`

Remaining work and operator decisions: DESIGN-FOUNDATION-PLAN.md; issues/OMD-APHRODITE-INTEGRATION.md. Original user pages were retained; a new QA page is active. No external issue, commit, deployment or adoption approval was created.
