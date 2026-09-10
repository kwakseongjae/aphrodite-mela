# Per-component primary policy — 2026-09-09

## Shipped scope

Own/MUI/shadcn buttons have project / adapter baseline / custom primary policy. Baselines are pinned local adapter defaults (own #344e41, MUI #1976d2, adapted shadcn #18181b), not full original DS restoration. Only primary changes; fonts, surfaces, radius and provider-native semantics are not universally overridden. Astryx/SEED and non-button controls are excluded. Switching to an unsupported provider removes the incompatible policy in the same undoable command.

Project JSON retains theme, validates modes/hex/provider support, and rejects unknown fields. Changes invalidate approval fingerprints. SCENE nodes carry policy; componentThemes records resolved accent by instance ID. Export prompt explicitly says to preserve overrides. Existing projects without theme retain prior behavior. Rendering resolves a temporary per-button project view without mutating the parent project.

## Verification

- 81 TypeScript tests pass; tsc and desktop release build 47327 completed.
- Unit tests: roundtrip, project-color independence, source/default resolution, invalid color injection/unsupported provider rejection, approval invalidation, scene policy and resolved accent.
- Real renderer test: custom primary reaches own CSS and escaped official iframe props without parent mutation.
- Native Quit-menu relaunch; existing separate `QA · Catalog shelf` used. Inserted own button, switched to MUI. Project policy green #344e41 → adapter baseline blue #1976d2 verified visually. Custom mode initializes from current resolved blue. Undo restores source, second Undo restores project green.
- Screenshots `artifacts/b2-bilingual/35-component-source-color.png` and `36-component-project-color.png`.
- Original B2 untouched; QA project now retains one MUI button with project color. No design approval given; no active build.

## Not verified / next

No fresh native ZIP/import roundtrip in this chunk (model, scene and real HTML paths tested separately). Native arbitrary color-picker editing and provider-switch undo matrix remain. Full semantic palette, fonts, surface mapping, all component kinds, all hover/focus/disabled states and WCAG compliance remain open. Primary may not visually affect neutral variants; shadcn outline/ghost currently keep ink/paper resting colors. Provide variant-aware capability labels before claiming universal recoloring. MUI uses its own on-color calculation, so arbitrary brand choices require state-level contrast checks.
