# Component expansion — first implementation

## Scope and references

The library now has 15 kinds (7 existing sections + 8 product patterns). The new patterns expose 24 named variations and 79 supported variation/state combinations. They share project tokens, preserve editable data on project import, and export options in SCENE.json and conventions in PATTERNS.json.

These are Aphrodite-owned HTML/CSS patterns, not official ports, certified equivalents or installed vendor libraries. No upstream implementation, fonts, icons or logos were copied. References were inspected on 2026-09-08 UTC:

- [Astryx](https://github.com/facebook/astryx): consistent composition conventions, agent/human shared component references, token-driven customization. Its React dependency is not introduced into this vanilla TS app.
- [SEED Action Button](https://seed-design.io/react/components/action-button): explicit variant/size vocabulary. Existing Karrot token preset remains separately labeled as inspired, not an official SEED implementation.
- [Apple HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): clear action labels and visible in-progress feedback. HIG is guidance, not a web component library or permission to copy Apple assets.
- [MUI component inventory](https://mui.com/material-ui/all-components/) and [Tabs](https://mui.com/material-ui/react-tabs/): input/navigation/data/feedback categories and keyboard-conscious view switching. Our view switcher is a native radio group with associated panels, not an ARIA tablist or MUI Tab implementation.

## Implemented variations

| Component | Variations | States |
|---|---|---|
| Action button | solid / outline / ghost | default / disabled / loading |
| Input field | outlined / filled / search | default / disabled / error |
| View switcher | underline / segmented | default / disabled |
| Content cards | outlined / elevated / list | default / empty / loading / error |
| Metric cards | plain / outlined / tinted | default / loading / empty |
| Task table | comfortable / compact / striped | default / empty / loading / error |
| Planning board | week / agenda / board | default / empty / loading / error |
| Status message | info / success / warning / error | default / loading / empty |

Every new pattern has density control. Cards/metrics have 1–4 column control. Text is edited in the existing inspector; helper text explains row formats. Structured rows are bounded to 50 rendered entries. The calendar accepts 월/화/수/목/금 for weekday placement; board groups by status and agenda shows all rows. This is an illustrative planning view, not a date engine.

Hero media can now be a real calendar composition instead of a raster placeholder. Its items and label are editable; the child component identity appears in SCENE.json. Set the Hero eyebrow field to remove the legacy English decorative footnote/caption. An empty explicit eyebrow also removes them.

## Interaction / export contract

- Table search and status filter work together in canvas, sandboxed preview and exported HTML; no-results feedback is visible.
- View switching uses native radio keyboard behavior; text inputs accept values; action button shows a local message.
- No backend calls, persistence of preview interactions, real scheduling, drag-to-reschedule, or automatic data fetching are implied. The scene stores authored state, not transient search text.
- Export HTML includes a small bounded inline behavior function; network connections and form submission remain blocked by CSP. Preview allows scripts but no same-origin privileges. All authored text is escaped; imports reject unsupported variants/options.
- Original version-1 projects remain valid. No destructive schema migration.
- Only referenced stock imagery is bundled; unused furniture assets are omitted. A reference image can still make editable project JSON large.

## Verification

Run `npm test`, `npm run build`, and `node scripts/check-pattern-export.mjs`. The export check creates artifacts/pattern-expansion/verification.html and verification.zip for browser testing. It checks independent script initialization, Korean language, no unused stock photos, child identity and editable round trip. In-app UI checks cover hero media conversion, table filtering, no-results, error/default state and preview behavior.

## Deliberately not finished

This is not arbitrary Figma-like nested freeform layout. It is section composition plus reusable product patterns and one explicit nested Hero/calendar recipe. Nested row-level selection, independent item drag/drop, an extensible layout tree, breakpoint-specific constraints, and true vendor-backed adapters remain future work. Full reference-image fidelity, human satisfaction, speed/token reductions and HIG/MUI/SEED accessibility certification have not been demonstrated.
