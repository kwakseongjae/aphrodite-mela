# Preview first — user direction, 2026-09-09

The product is a design decision workbench, not an opaque final-code generator. After initial image inspiration, the agent should show actual rendered editable screens without editor chrome, gather direction, then hand the confirmed revision to code implementation. User's Jarvis analogy describes staged commitment, not authorization to invent runtime estimates or execute paid/background jobs.

## State sequence

Reference → editable composition → isolated proposal → large screen/whole-page review → apply draft (Undo) → explicit direction approval → code handoff. Proposed and applied are distinct; neither automatically approves. Changes after a preview must invalidate stale application; code generation estimates must be based on actual scope rather than a scripted “four hours.”

## Implemented this chunk

- Paper Muse bright surface now owns dark heading/body/eyebrow colors instead of inheriting sculpture dark-theme text. Foreground/background ratios checked against 4.5:1 for ordinary text; not whole-app WCAG certification.
- Shared on-color calculation chooses black/white by measured contrast. Applied to standalone own components and the shadcn CSS variable path; MUI contrast/theme behavior and native-provider themes still require broader state audits.
- Color/font draft comparison uses a deep clone and source fingerprint/project binding. Primary-color picker, blue/green proposals, serif/sans heading choice, current/proposed previews, large scrollable preview, isolated draft ZIP, explicit apply through history. No implicit generation or approval.
- Draft ZIP bundles assets rather than saving broken HTML with unresolved asset URLs. User can review active page from ZIP independent of editor; existing project is not changed by export.

## Remaining implementation priorities (not claimed shipped)

1. Catalog categories Layout / Navigation / Input / Data, provider filters and large single-component review. A “Layout” category must not invent official company layout adapters. Current explorer lists only actual support.
2. Drag a chosen implementation/variation from a persistent catalog shelf to canvas. Modal previews alone cannot be dragged across an inert editor; build a nonmodal shelf and typed drop payload, with click fallback and keyboard path. Test exact provider/variant retention and Undo.
3. Per-component theme policy: source-default / project-inherit / explicit override, including font roles and semantic on-colors. Preserve source provenance and label customized official parts. Current Astryx/SEED retain native themes; Toss has reference colors, not an official button adapter. Do not hide this with CSS recoloring guesses.
4. Multi-palette candidate sets: primary + supporting surfaces/ink/states; compare desktop/mobile under the same layout. Current implementation changes primary and heading family only, not a generated full semantic palette.
5. Screen-only screenshot/video handoff with revision ID, locale, viewport and motion position. A screenshot proves a state, not animation or full-page accessibility. Preserve original references separately.
6. Broader accessibility audit: composited text (opacity/images), focus, errors/disabled, borders/icons, contrast after theme overrides; export findings by node/state. Token-pair contrast alone is insufficient.

## Test boundary

Unit tests cover isolation, stale apply, invalid colors, no auto-approval and selected contrast pairs. Native and standalone render evidence must be recorded independently. Do not claim complete DnD/theming/WCAG coverage from these unit tests.

Standard reference: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html — 4.5:1 ordinary text, 3:1 qualifying large text; avoid rounded threshold acceptance. This implementation uses the stricter ordinary-text threshold for repaired brand-copy pairs.
