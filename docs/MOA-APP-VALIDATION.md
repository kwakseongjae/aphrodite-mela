# Moa app-view implementation and verification

Date: 2026-09-09. Existing reference: `artifacts/app-view-reference/moa-workspace-v1.png`. No additional generated reference was needed for this slice.

## What shipped

- A non-destructive **Moa app** action adds a new page with 21 editable nodes: shell, sidebar, main frame, toolbar, board frame, five lane frames, ten task cards, detail panel.
- Four own component kinds (`moasidebar`, `moatoolbar`, `moacard`, `moadetail`) and four app frame recipes. These are Aphrodite-owned HTML/CSS, not official MUI imports. Existing official adapters remain available separately.
- Desktop editor uses a 1440 CSS-pixel canvas with actual zoom and **Fit app**. Frame recipe can be reset to `default` to release recipe-imposed layout rules.
- Preview/export share a bounded local runtime: card selection, status/owner editing, per-card checklist state, search, status filtering and board/list switching. Counts derive from cards, not image labels.
- Export includes scene identities, parent links, frame variants, editable project, prompt and standalone interactive HTML. Existing projects with vendor adapters also contain their source templates.

## Actual user-flow checks

All actions below used in-app browser UI. No project state was injected to simulate successful actions.

1. Clicked **Moa app**; old Home, Editorial balance and Pointer lab pages remained.
2. At **45% actual zoom**, selected the first task and dragged its move handle `(451,486) → (535,490)`: parent changed **월 7 → 화 8**. Undo restored **월 7**.
3. Downloaded Draft ZIP through Export; did not fabricate user approval.
4. `scripts/verify-moa-handoff.mjs` verified the actual ZIP: 21 node identities, ten cards, scene hierarchy, shared runtime and explicit prompt limitations. Extracted HTML is unchanged from the ZIP.
5. Opened exported HTML at desktop 1280×720. Selected onboarding task was initially 완료. Changed to 진행 중: totals **4/3/3 → 5/3/2**, and the card label changed with the detail select.
6. Changed owner 민경→지연; card avatar updated. Checked 핵심 화면 정리: **1/3→2/3**. Selected another card, then returned; onboarding checklist stayed **2/3**.
7. Search 온보딩 yielded **1/10**; unmatched search yielded **0/10**. Status 검토 대기 yielded **3/10**. Clearing controls restored all ten cards. Global counts deliberately remain full-dataset counts while filtering.
8. Board/list toggles changed layout. At **375px mobile Preview**, closed the detail overlay and switched to a readable full-width list.
9. Final ZIP was exported after stable task display IDs and accent token refinements. A fresh browser session on that final HTML reverified status totals and status filtering.

## Evidence

- `artifacts/moa-app/final-desktop.jpg`: final exported HTML after actual status update.
- `artifacts/moa-app/mobile-list.jpg`: 375px Preview inside the editor modal.
- `artifacts/moa-app/actual-ui-handoff.zip`: final UI download, original four pages retained.
- `artifacts/moa-app/index.html`: active Moa page extracted verbatim for easy opening.
- `artifacts/moa-app/workflow-keyframes.mp4`: 22 sampled real interaction frames played at 1 fps (22 seconds, encoded at 24 fps). This is a keyframe walkthrough, not continuous real-time recording, and cannot establish task duration or performance. Captured before the final display-ID/accent refinement; behavior is the same.

## Reference comparison

Present: three-region app shell, search/header, view controls, three summary metrics, five weekday lanes with ten real cards, selected-card emphasis and connected detail/checklist. This is no longer a marketing landing-page approximation.

Differences: current sidebar/detail widths are 190/280px versus the earlier plan's 220/320px; typography, spacing and avatars are approximations, not pixel-matched assets. The reference's illustrative 8/3/12 totals were replaced by the consistent ten-card fixture. Calendar view, create-task action, dates, comments and functional sidebar routes are not implemented. Sidebar entries are deliberately non-interactive labels. Mobile hides the sidebar rather than implementing a drawer.

## Validation and remaining limits

- **28 unit tests pass**; web production build and Tauri release bundle build succeed. Large main JS chunk warning remains (~1.52MB uncompressed). Interactive tests used the browser frontend, not a newly launched native app.
- Preview edits are ephemeral and do not update editor project data or export. Persistent changes are made through the editor inspector; the export prompt explicitly states this boundary.
- Primary accent is mapped for selected cards, checkboxes and active controls. Recipe neutrals, semantic tag colors, typography and spacing are still recipe-owned, not a full arbitrary-brand token projection.
- App frame recipes impose grid/spacing rules; no fixed/hug/fill constraint engine yet. Arbitrary frame rearrangement can invalidate the app recipe's positional shell assumptions. No claim of a general-purpose Figma replacement.
- Recipe insertion plus real card manipulation is verified. Full autonomous image analysis → component selection → all-node Computer Use assembly from a blank page is **not** demonstrated here.
- No end-to-end 30–40 minute or token-cost improvement has been measured. Next useful benchmark: two distinct app references, identical briefs/model settings, direct-generation baseline versus image-review/assembly path, recording retries and full cost.

Safety: pre/post shadow snapshots preserve the existing workspace; no source commit/reset and no replacement of old user pages.
