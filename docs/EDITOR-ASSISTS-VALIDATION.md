# Snap and edge scrolling — 2026-09-09

## Implemented

- Six viewport-CSS-pixel snapping to parent and sibling edges/centers. Move snapping applies in free frames; resize snaps the active edge. Pink guides show the selected alignment. Alt during pointer movement disables snapping.
- Outer canvas auto-scroll in a 40px edge zone, capped at 420px/second and time-based rather than frame-count based. Outside the scroll viewport it stops.
- Resize deltas account for outer scrolling. Free-frame drops use current parent geometry and snapped ghost position.
- Commit preserves the outer scroll position after the existing editor rerender; cancellation clears guides and transient styles. One command is still submitted on release.

## Evidence

Actual Computer Use in an in-app browser desktop tab (1280×720), on the existing Pointer lab page:

1. Dragged east handle from (575,513) to (619,513). Width changed 240→287. DOM readback: card right=624px, parent right=624px. The raw pointer stopped 5px short of the parent edge; snapping aligned the edge.
2. Dragged move tab from (389,390) to (705,570). Card moved A→B; outer scrollTop changed 0→4 during the short gesture and stayed 4 after commit. The initial run exposed a rerender resetting scrollTop; fixed and retested.
3. Undo in the initial run restored parent A and width 287.

Screenshot: `artifacts/editor-assists/verified-autoscroll.jpg`. Raw sampled gesture frames are in the same directory. These are real frontend pointer actions, not injected state. The brief drag establishes scrolling occurs; it does not establish prolonged scrolling stability or a performance benchmark.

26 unit tests pass; web production and Tauri release app bundle builds pass. Large bundle warning remains. Test coverage includes nearest guide, threshold, empty candidates, zoom-distance conversion and edge velocity; it is not a full browser test matrix. `artifacts/editor-assists/result.jpg` shows the moved card after a separate explicit scroll to reveal it.

## Limits / next

- Only the outer canvas scroll container is assisted; nested frame auto-scroll, insertion markers and snapping hysteresis remain.
- Alt/cancel during held drag and long edge dwell still need interactive verification. No claim of native interactive verification.
- Current visible narrow in-app panel reflows the canvas and blocks geometry editing below 651px canvas width. This validation used a separate hidden desktop-sized in-app tab; it does not demonstrate editing at the narrow panel size.
- Next product milestone is the Moa app recipe (sidebar, toolbar, board/lane/task card, shared detail panel), then reference reconstruction and exported-app validation. Time/token savings remain unmeasured.
