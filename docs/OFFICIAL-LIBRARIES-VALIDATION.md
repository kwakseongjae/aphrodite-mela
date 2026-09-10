# Official libraries & layout — 2026-09-08

## Implemented scope

| Implementation | Actual connection | Variations |
| --- | --- | --- |
| MUI 9.4.0 | Official React Button, TextField, Card | Button contained/outlined/text; input outlined/filled/search; card outlined/elevated/list |
| Astryx 0.5.4 | Official React Button + official Neutral theme | primary/secondary/ghost; disabled/loading |
| SEED React 2.4.1 | Official ActionButton + SEED CSS 2.7.0 | brandSolid/brandOutline/ghost; disabled; prototype loading label |
| shadcn | Adapted new-york Button source, Radix Slot, CVA, Tailwind utilities | default/outline/ghost; disabled; prototype loading label |
| Aphrodite | 15 existing patterns + layout frame | 24 pattern variants, 79 variant/state combinations |

shadcn is open source distribution, not a fictitious installed component library. The adapted file and MIT notice are exported. Official library CSS is isolated in sandboxed frames. MUI/shadcn map the project's primary color/radius. Astryx/SEED retain their default themes. HIG remains guidance, not an official web component package.

Frames support nested parents, grid columns, gap, padding, width and free X/Y positions. Layer handles support moving/reparenting; precise numeric controls are available to computer-use agents. Responsive output stacks free-positioned components in reading order. This is not yet Figma-level drag-resize handles, snap guides, constraints or arbitrary vector editing. Parent references survive page cloning; deleted frames preserve children. Cycles, missing parents, excess nesting and unsupported provider combinations reject imports.

## Verification

- 20 unit tests pass: existing behavior, providers, layout validation, nesting, scene round-trip and approval invalidation.
- Vite production build and Tauri macOS release bundle build pass.
- Export fixture includes 6 real library instances, offline HTML, editable React adapter source, exact top-level dependency versions and licenses/SEED attribution notice.
- Exported React source independently npm-installed and rebuilt successfully. Package lock is produced on install; this is not a frozen transitive dependency graph.
- Actual in-app browser shows MUI, Astryx, SEED and shadcn buttons plus MUI input/cards. MUI click produces local feedback.
- Actual user-flow UI: existing image reference → pixel analysis → manually reviewed copy → 3 compositions → new editable page → calendar recipe → MUI preset → frame → MUI/shadcn buttons → parent assignment → loading/default state → 2-column grid → width 90% → preview and click → mobile preview → DRAFT ZIP export.
- The user did not approve the design; the artifact remains DRAFT. Some template copy remains deliberately unpolished. This is agent-driven scenario validation, not research with external users.

## Recording

`artifacts/user-workflow/aphrodite-user-workflow.mp4` contains actual tab screenshots sampled during UI operations, approximately 2 fps, converted to a playable 24 fps MP4 with frame repetition. Tool/thinking gaps between recording segments are omitted. No generated scenes, synthetic cursor animation, audio or live image generation is represented. Existing image draft was reused. Raw frames and timestamps are retained in the same directory. A new composition was actually created and exported through the UI; the downloaded ZIP is `actual-ui-handoff.zip`.

## Findings / remaining work

1. Browser analysis currently extracts pixels, not OCR or semantic components. The agent/user must verify copy and map the image to components. Native Apple Vision OCR is a separate existing path; not revalidated in this recording.
2. Component edits/export do not invoke a generation model. That demonstrates a cheap local iteration path, NOT an end-to-end token/time saving percentage. Need matched-task baseline vs image-first runs, measuring human corrections, model token usage and time-to-approved-direction before claiming the 30–40 minute problem is solved.
3. Library runtime currently adds ~1 MB raw JS/CSS and is embedded per isolated instance. Bundling/compression helps distribution but does not solve multi-instance memory/startup overhead. Split providers, share runtime safely, and measure 50-instance performance next.
4. Official adapter coverage is intentionally a subset, not full library migration. Tables/calendar remain own patterns. Full shadcn registry support, brand-token mapping for Astryx/SEED and production framework export remain further work.
5. Attractive product differentiator: traceable image → component/provider/layout contract → rebuildable code, with a human approval boundary. Cross-library fidelity and measured correction savings matter more than the number of presets.

## Primary references

- https://github.com/facebook/astryx
- https://seed-design.io/react/components/action-button
- https://mui.com/material-ui/getting-started/installation/
- https://ui.shadcn.com/docs
- https://ui.shadcn.com/r/styles/new-york/button.json
- https://developer.apple.com/design/human-interface-guidelines
