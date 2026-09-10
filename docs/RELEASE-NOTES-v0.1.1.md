# Aphrodite v0.1.1 — draft release notes

_Draft. Finalised when the tag is cut; items marked (pending) are merged only if the corresponding branch lands._

## Download

- Apple Silicon: `Aphrodite_0.1.1_aarch64.dmg`
- Intel: `Aphrodite_0.1.1_x64.dmg` (new — first Intel build)
- Both signed with Developer ID and notarized; open without warnings. macOS 13 or later.

## What's new since v0.1.0

**Find your way around**
- Command palette: ⌘K or ? lists every action on the page (add components, design, review, file) with shortcuts. Approve direction is intentionally not listed.
- Live status line at the bottom: page · components · selection · design system · draft/approved · viewport · saved.
- Tooltips on the agent assembly bar buttons.

**Catalog: 20 → 35 kinds, ~50 → 341 options**
- 15 new project-owned kinds: select, checkbox, switch, textarea, badge, avatar, breadcrumb, pagination, progress, skeleton, accordion, chips, slider, stepper, toggle.
- Official design-system adapters: MUI 22 kinds, Astryx 22, SEED 16, shadcn 10 (input, textarea, card, badge, table, skeleton, alert, breadcrumb, pagination vendored under MIT).
- Variations for layout sections: navigation, features, collection grid, testimonial, CTA, footer.
- Variant chips on every catalog card and "implementations · options" counts in the index.
- (pending) Readable own-pattern previews, aligned cards, Astryx calendar adapter, grouped index.

**Get Vibe and theme drafts**
- When nothing would change, Get Vibe now says why (authored copy is protected), names the components the pack has no sample for, and offers "Preview again, replacing existing content".
- Colour & font drafts show a current-vs-proposed token strip and explain when the page has no component that uses the primary colour.

**Home**
- Fixed sidebar with a scrolling project column, grid/list toggle, per-card more-menu, star fill/pop, duplicate and archive feedback, counts for all/favourites/archived.

**Editor**
- Window minimum 900×620; below 1100px the inspector stacks and can be collapsed.
- Disk-save failures show a banner with "Save a backup file" and "Reload from disk".
- First run follows the OS language (Korean or English).
- (pending) Korean localisation of the editor chrome and modals.

**Under the hood**
- OCR helper runs as a signed Tauri sidecar (hardened runtime); DMG notarized and stapled by CI.
- Vault snapshots pruned to the last five.
- lucide icons imported individually (largest chunk 1.62 → 1.30 MB).

## Known limits

- Calendar has no MUI/SEED adapter (date-picker packages judged too heavy).
- The four Moa app-recipe blocks remain single-option by design.
- Get Vibe on an empty page still needs a "start from a brief" nudge (planned).
