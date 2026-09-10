# Agent assembly verification — 2026-09-09

## Actual UI run

Run ID: `32a80f8b-6d5e-4ad8-b2a4-7979b31a3ed3`.
Browser frontend at 127.0.0.1:1421, desktop 1280×720. The operator used UI only for composition. Downloaded artifacts were checked with read-only assertions afterwards.

1. Started a run through the console with an explicit test intent and an honest unmeasured model label.
2. Created empty **Assembly 5**, preserving all four old pages.
3. Added a frame and renamed it 작업 영역. Initial naming rerender caused a Computer Use stale-input error although the change persisted; this was fixed later and reverified.
4. Pinned the frame. Added two Task cards via visible library buttons. Both parent IDs matched the pinned frame, although each newly created card became selected.
5. Dragged the second card's east handle `(937,415)→(701,415)`. Persisted width **378px**, height **208px**. Receipt #8 was `pointer:resize`.
6. Undo (#9) restored the pre-resize revision; Redo (#10) restored the resized revision.
7. Opened Preview (#11), requested human review (#12). UI remained **Draft** and approval control stayed available. Review event explicitly recorded `approved:false`; project revision matched the pre-review revision.
8. Ended the run (#13), downloaded the actual JSON and assembly brief. Assertions verified 13 events, same parent for both inserted cards, 378px resized width and no revision change from requesting review. `usage:null` and `recording:null` remained intact.
9. After the naming fix, used Layers to select the frame and set its name to `작업 영역 · Agent lab`. Input retained the value without an error; move handle and label updated. This post-run repair verification is intentionally outside the ended log.

## Evidence

- `artifacts/agent-assembly/actual-run.json` — actual downloaded run log, not a fabricated fixture.
- `artifacts/agent-assembly/ASSEMBLY-BRIEF.md` — actual UI download with selection/insertion context.
- `artifacts/agent-assembly/review-console.jpg` — 12 receipts, review-requested state.
- `artifacts/agent-assembly/workspace.jpg` — pinned parent and Draft state.
- `artifacts/agent-assembly/final-workspace.jpg` — naming fix verification after ending the run.

31 unit tests pass. Production frontend and Tauri release builds pass (native interactive launch not tested). Large main chunk warning remains. The tests cover run serialization, bounded logging and explicit truncation, absence of copy/image content in change receipts, unknown usage, context paths and approval instructions, in addition to prior tests.

## Limits

This is a small blank-page assembly mechanics test, not full image reconstruction. No continuous video, external model trace, held-pointer cancellation replay, storage-quota failure injection or cross-project resume UI test was performed this turn. Browser control used the previously chosen in-app browser, not the blocked Chrome harness path.

Local run records are opt-in and stored per run ID plus a latest pointer. Events cap at 500; omissions are counted. Storage failures show a warning and the in-memory log remains downloadable. Other-project mutations are not recorded into the run. Reload/HMR adds a resume marker to active runs; pinned insertion resets to root visibly. These records do not measure model tokens or distinguish human review wait from agent execution time.

Request review does not enforce human identity; it only prevents that checkpoint from silently granting approval. The external operator must still wait for explicit human approval before using Approve direction.
