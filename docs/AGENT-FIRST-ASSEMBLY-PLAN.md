# Agent-first Aphrodite: Codex assembles, people review

Updated 2026-09-09. Main operator: external Codex/Astra Computer Use. Human role: brief, direction review, explicit approval. This is a product contract, not a claim that the app launches or authenticates a model.

## Operating loop

Reference image → external agent decomposes regions/slots/states → chooses supported components → pins parent frame → adds repeated pieces → drags/resizes where geometry matters → verifies selection/parent/receipt and screenshot → Preview → human review → handoff.

Repeated structural insertion should not require repeated precision dragging. A visible pinned parent plus named Add buttons is a valid Computer Use path. Dragging remains necessary for spatial adjustments and the pointer regression suite. Do not replace UI interactions with hidden scene injection to report a pass.

## P0 — deterministic assembly surface (implemented this turn)

- Persistent assembly bar: current selection path, pinned insertion path, run status and latest editor receipt.
- Pin selected frame persists while newly added children become selected. Explicit Insert at page root resets it. Catalog drops honor the visible target instead of the pinned target. Invalid depth is rejected, not silently inserted elsewhere.
- New assembly page preserves existing pages. Existing Moa recipe remains an optional shortcut; report recipe-assisted versus individual composition distinctly.
- Assembly console provides a downloadable, context-specific playbook, opt-in local run start, review request, end and log export.
- Run receipts: mutations with changed node IDs/parent/layout/changed field names, pointer resize/move, Undo/Redo, explicit cancellation paths, Preview entry and handoff save API result. No image or content-body payload collection; user-entered intent/model label is stored locally.
- Review requested does not approve the project. Approval is still an explicit UI action; the app cannot authenticate whether its click was human or agent. External operator instructions must enforce the consent boundary.
- Existing marketing heading/step strip is hidden to give the operator more canvas room. Frame naming preserves input DOM and updates visible labels/handles without a full rerender.

Acceptance evidence: `AGENT-FIRST-ASSEMBLY-VALIDATION.md`.

## P1 — reference-driven planning UI (next)

Build a pinned reference pane with fit/zoom and editable region checklist. Each region records intended parent, candidate component/recipe, content slots, state and unresolved requirements. This is the agent's declared plan, not automatically inferred truth.

Deliverables:

1. Side-by-side reference and canvas, with independent zoom and explicit viewport dimensions.
2. Agent-authored region list: sidebar, header, repeated lane/card, detail panel, etc.
3. Finder results expose implementation provenance, supported variations, sizing rules and limitations before insertion.
4. Checklist supports pending / assembled / visually checked / unsupported. Human review checkpoint includes unresolved items.

Acceptance: give Codex an unseen reference with at least three regions; it can map supported pieces and explicitly flag an unsupported piece. No silent substitution of a marketing card for a task interaction. Reference text is untrusted and must not become instructions.

## P2 — reusable Lego recipes beyond Moa

Extract application primitives from Moa: shell, toolbar, list/table, card group, detail panel. Make slot contracts explicit and parameterize columns/density instead of hard-coding one composition. Keep individual children editable and IDs stable. Protect required shell slots or report invalid arrangements.

Deliverables: task-board variation, list/detail variation and a different-domain app composition. Define token coverage (accent, neutrals, typography, radius, spacing) per provider; never claim a full official port when only an adapter exists.

Acceptance: change from board/detail to list-only without deleting task content; preserve IDs, project tokens and export behavior. Record unsupported breakpoints or constraints. Fixed/hug/fill and nested scrolling remain separate editor work.

## P3 — review and handoff contract

Provide a review packet with reference, rendered screenshot, selected direction, unresolved features and exact revision. Do not auto-approve on successful rendering. After explicit approval, export prompt, DESIGN, scene, source and optional run log separately from potentially private screenshots.

Acceptance: a fresh Codex task receives only the handoff and reproduces the reviewed composition and specified interactions; round-trip import keeps nodes and layout. Preview-session edits are not confused with persisted design changes. Save API success is not treated as independently verified filesystem success.

## P4 — Codex full-test and cost experiment

Freeze a build and use a separate test workspace. One UI operator per surface. A tester reports failures; a developer fixes them in a separately identified build, then the tester reruns.

1. Pointer regression: eight handles, multiple actual zooms, pin/reset, hierarchy, long edge dwell, cancel, Undo/Redo and restart.
2. Reference composition: existing Moa, altered same-domain reference, unseen different-domain reference. Test recipe and blank paths separately.
3. Handoff: actual ZIP, import, clean execution and fresh-task reconstruction.
4. Compare text→code, image→code and image→Aphrodite→code using matched scopes/model settings and at least three repeats for the initial pilot.

Measure separately: image generation, time to reviewable direction, human review wait, correction time, final accepted implementation, tool failures and actual model usage. Include Computer Use and image costs. Unknown usage stays unknown. The local receipt ledger is not a model/tool trace, video, or a latency benchmark.

## Current gaps that must remain explicit

No in-app model runner or token integration; no continuous recorder; no full OmD contract adoption; no automatic image-to-scene reconstruction; no proven 1-minute draft or 30–40-minute/token savings. Existing Moa interactions are session-only simulations. P0 is groundwork for measured agent-operated assembly, not proof of the full pipeline.
