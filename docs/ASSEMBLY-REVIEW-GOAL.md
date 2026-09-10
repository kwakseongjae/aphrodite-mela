# Autonomous assembly-review chunk — 2026-09-09

## Working agreement

User requested goal-sized work (roughly four-hour chunks), not a handoff after each minor feature. Continue implementation, self-review and regression until a meaningful review gate is reached. Only ask for direction, authority or visual feedback when genuinely required. Do not infer human approval from automated tests. Preserve B2 accepted fixtures.

## Review gate

1. Inspect an exact DS implementation at full width before insertion. Closing is non-mutating; adding retains the pinned parent. Check a Layout item and an official implementation.
2. A 12-item shelf remains accessible with bounded live preview renderers. Paging must not lose or mis-index choices; project switching, restart, removal and canvas Undo/Redo must not resurrect or leak shelf items.
3. Native color comparison and full-page preview render official components, not empty iframes. Draft remains unapplied until explicit apply; apply is reversible and is not approval.
4. Assemble through real native Computer Use; export a draft and verify the resulting project/scene/HTML independently. Retain screenshots of important checkpoints.
5. TypeScript checks, automated regressions and desktop build pass. Record unverified limits, not blanket WCAG or efficiency claims.

## Self-review findings during this chunk

- Large Layout recognition was impossible from a 94px shelf crop: added a scrollable fixed-width inspection surface (375/768/960/1440px), with explicit insertion destination and exact implementation action. Empty frames are labeled as containers, not fabricated vendor layouts.
- Up to 12 official shelf iframes would be recreated on editor renders: introduced four-item pages with stable absolute indices. This bounds shelf rendering, not the whole canvas or modal. Runtime/memory savings are not yet measured.
- Pinning closed the catalog after every choice: changed to keep comparison open, disable already-pinned choices and provide an explicit shelf exit/count.
- **Native blocking defect observed and fixed:** color comparison was blank for MUI fixtures even though canvas buttons rendered. Screenshot `artifacts/b2-bilingual/42-native-theme-before-fix.png`. First attempt to externalize nested scripts still failed in native WebKit and was discarded. Final native preview mounts the generated main/styles inside a disposable Shadow DOM. Official iframes keep their existing sandbox/local runtime; no ancestor CSP weakening or same-origin iframe permission. Scoped prototype behavior runs in that disposable DOM. Offline exports keep existing standalone behavior. Native color comparison and full-page preview subsequently rendered correctly.
- Shelf drag lacked explicit Escape/lost-capture cleanup: added cancellation cleanup; release outside canvas remains non-mutating.

## Evidence status

Review gate reached; not human design approval. Final automated suite: **86 passed**, TypeScript passed. The discarded external-script approach's test was removed with that implementation; no claim of an automated WebKit test.

Final desktop build72219 completed after removing the unused runtime file from the discarded attempt. Build64514's identical application code was relaunched and tested; cleanup rebuild has no behavioral change. Self-review of shadow diff found no remaining blocker for this scoped gate. Safety snapshot: `9d6071a44ab9cc4d5ca8749a83f040ef791ed5dd` (before this final documentation update). No user branch commits or restores performed.

### Actual native Computer Use sequence

1. QA copy starts with three MUI buttons: project green, adapter-baseline blue, custom gold. Open full-size shadcn inspection, return without changing canvas.
2. Reproduced blank native theme comparison; after final fix, compared green vs proposed #2255cc. Only project-mapped button changes. Apply makes project #2255cc; Undo restores #344e41 and three nodes. Screenshot43.
3. Pinned own/MUI/Astryx/SEED solid and five outline choices without closing catalog. Added own frame/default and hero/split: exactly 12 unique choices. Existing shadcn solid pin is disabled, not duplicated. Pages contain at most four actual preview cards; each has exact provider/kind/variant labels. Pure paging tests cover all absolute indices and clamping after removal.
4. Inspected own hero at 960px; Back retains hero/split catalog choice. Screenshot44. From shelf, inspected and added a frame; pinned it as insertion destination. Opened hero inspection, switched to375px, confirmed destination remains `Page root / Your layout frame`; added hero as child. Screenshot45.
5. Switched shelf page1; actual pointer drag from thumbnail (89,528) to hero area (650,430) adds shadcn solid as sibling inside pinned frame: five→six nodes. Undo returns five. Removed shadcn from shelf (12→11). Redo restores sixth canvas node **without resurrecting shelf choice**. Screenshot46.
6. Native draft ZIP Save completed. One native pipe response interrupted after Save, but file existed and reconnected AX explicitly reported handoff exported. No duplicate save/retry mutation. Parsed exported project: six nodes, eleven shelf choices, frame has exactly shadcn button + hero children, original three MUI theme policies and #344e41 preserved. SCENE has same six instance identities and parent mapping.
7. Independent in-app browser opened actual exported HTML. shadcn computed bg rgb(52,78,65), fg white. Installed exported React dependencies (`--ignore-scripts`) and built exported source; rebuilt HTML has same visible content and shadcn computed colors. This is a local rebuild, not a clean-machine install certification. Screenshot47.
8. Quit native app via menu, relaunch final tested code. QA original remains shelf0 and nodes3. QA copy restores shelf11 and nodes6, saved-to-disk status. Native full-page preview displays all MUI/shadcn/own nodes; scrolling reaches nested hero. Screenshot48.

### Artifacts

- `artifacts/b2-bilingual/theme-handoff-export/assembly-review-goal.zip`
- `artifacts/b2-bilingual/assembly-review-export/` (actual ZIP contents and rebuilt React source)
- Screenshots42–48 in `artifacts/b2-bilingual/`.
- In-app browser deliverable: http://127.0.0.1:1444/react-source/dist/index.html (local server must remain running).

## Remaining / next goal

This fixture validates mechanics, not visual fidelity to the approved B2 reference. B2 projects were not edited and no approval action was invoked.

Next substantial chunk: matched reference-to-build experiment. Use a copied approved B2 project and a fresh direct-build baseline with identical reference/content. Record first-review elapsed time, agent action/retry counts, number of requested corrections and export fidelity. Token cost remains unknown unless actual Codex usage evidence is available; ask the user for mental-load scores only at a consolidated visual review gate. Include below-fold screenshots and a scroll walkthrough; defer GSAP/motion generation unless required by that reference. Do not claim full WCAG, all vendor variants, native memory/latency savings or signed beta readiness from this chunk.

Proposed next gate (targets, not measured results): one fixed reference and matched brief; three scripted iterations (primary palette, component/provider substitution, below-fold section) with no full-page reset; zero project/export structural mismatches; before/after screen-only captures for each iteration. Report absolute elapsed time and corrections first. A single paired run is exploratory, not proof of broad savings. Human review asks only whether the direction is faithful and whether correction burden is acceptable, with a brief 1–5 burden rating. Broader five-reference runs follow after this consolidated gate.

Additional regressions to extend: all vendor hover/focus/disabled states; full-capacity refusal via native UI (unit-covered); Escape-during-drag and window loss (cleanup implemented, not a real interrupted-gesture recording); comprehensive Shadow DOM Moa interaction parity; disk-failure presentation. Shelf pagination bounds preview count, but the entire catalog/canvas still mounts other renderers and no process-memory benchmark was taken.
