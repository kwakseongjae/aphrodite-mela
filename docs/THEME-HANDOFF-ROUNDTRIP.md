# Theme handoff roundtrip — 2026-09-09

## Purpose

Verify real desktop → ZIP → standalone HTML → editable React rebuild → native project import, not only JSON unit tests. This is a functional fixture, not a polished landing-page direction or efficiency benchmark.

## Changes shipped

- Component-specific shadcn CSS moved outside replaceable vendor CSS markers: rebuilding vendor CSS no longer removes the readable resting outline/ghost fix.
- MUI primary contrastText receives onAccent from shared black/white contrast selection. Existing export props without it retain MUI fallback. This does not certify hover/disabled state contrast.
- Custom color has a six-digit HEX text input suitable for agent control, validates before commit and restores the current value on invalid input.
- Inspector explains which area primary affects: solid fill, MUI text/border, own outline border, neutral shadcn outline/ghost and own ghost. No universal recoloring claim.

## Real evidence

Release build 88157 completed and relaunched with native Quit menu. 82 TypeScript tests pass, including actual ZIP policy/scene checks, neutral-variant mapping and CSS replacement regression assertion.

Native QA · Catalog shelf now has three MUI solid buttons:

| Label | Policy | Actual background | Actual text | Computed pair ratio |
| --- | --- | --- | --- | --- |
| Project · Green | project | #344e41 | #ffffff | 9.08265 |
| Baseline · Blue | source | #1976d2 | #ffffff | 4.60189 |
| Custom · Gold | custom | #d7b449 | #000000 | 10.51412 |

HEX #d7b449 entered through native UI, not app-state injection. Native save produced artifacts/b2-bilingual/theme-handoff-roundtrip.zip; extracted under theme-handoff-export/. Project primary remained #344e41. SCENE and project contain all three policies.

In-app browser inspected index.html and react-source/dist/index.html. Button computed styles exactly match the table before/after rebuild. Ran npm install --ignore-scripts --no-audit --no-fund and npm run build in exported react-source (232 packages installed). Initial attempt before installing failed on expected missing node_modules asset; the documented install/build path then succeeded. This is local rebuild verification, not a clean-machine distribution certification.

Native Open project imported extracted project.aphrodite.json. Duplicate ID was safely cloned into QA · Catalog shelf copy. Re-saved as theme-handoff-export/roundtrip-imported.aphrodite.json. Compared original/import: project IDs differ, system deeply equal, every non-identity block field deeply equal, policies project/source/custom #d7b449 retained. Imported custom control also visually/AX verified. Original B2 untouched; two QA projects retained for evidence.

Screenshots in artifacts/b2-bilingual: 37 full export, 38 export detail, 39 native imported custom policy, 40 rebuilt screen detail. Browser deliverable points to port 1443 /react-source/dist/index.html; server session 57060. No active build.

## Boundaries and next chunk

No new broad hover/focus/disabled or mobile state audit; no native malformed HEX interaction test; shadcn scoped CSS preservation is regression-tested but this native three-button rebuild fixture uses MUI. No time/token savings claim. Primary-only scope remains.

Next implement project-owned shelf persistence and real thumbnail previews. Acceptance: pin across DS → project switch does not leak shelf choices → restart retains each project's shelf → preview identifies provider/variant/theme effect → drag and click insert exact choice → Undo affects canvas only. Preserve old project imports without shelf data. Follow with broader state/theme matrices, then font/surface mapping. User-facing updates must explain purpose, concrete changes, evidence and remaining work, not only a test count.
