# C1 — Refined catalog & brand integration

## Scope / completed implementation

The catalog now uses a warm paper/ink palette, editorial title hierarchy, category navigation, a scrollable component index with implementation counts, project swatches, and consistent two-column real-renderer cards. Official / adapted / studio provenance and project / source palette are distinct. Inspect, pin and add have separate stable accessible labels. A single available layout gets a larger preview rather than an empty second column. Input fields use their actual readable scale, not the layout thumbnail scale.

Official button controls remain in sandboxed frames; authored heading/description now live in the project page outside the vendor runtime. Heading uses project `--heading`, paper/ink and responsive spacing. Existing MUI/shadcn source/project/custom accent policy is unchanged. This does not implement arbitrary uploaded fonts, every vendor typography token, or universal DS parity. MUI input/card wrappers still use their existing vendor presentation.

## Actual verification

- Native test project: `C1 · Refined catalog review`, a copy of B3. Original B2 and B3 were not edited.
- Native flow: open catalog → pin MUI solid → full-size inspect → Add → Undo → restart. Shelf retained one exact `{kind:button,provider:mui,variant:solid}` choice.
- Actual native ZIP `artifacts/b2-bilingual/theme-handoff-export/c1-refined-catalog-review.zip`, extracted to `artifacts/c1-catalog/export`.
- Compared exported pages and system to B3 `04-verified`: deep-equal, including the existing seven-block page. No design approval applied.
- Native preview: View all → footer; official button click exposes prototype status. Authored heading and description visible.
- In-app browser exported page: heading computed Georgia/Times serif, 36px, rgb(41,45,39); MUI button rgb(34,85,204) with white text. Mobile375 document has no horizontal overflow; lower sections reviewed by actual scroll.
- English browser catalog and Korean native catalog checked. Stable `Browse input` focus remains after re-render.
- Tests: 91 passed including new catalog contract and real-renderer copy/height regression tests. TypeScript and desktop release build pass.

## Self-review corrections

Initial card CSS overrode own control width; scoped override fixed it. Initial modal width lost to legacy CSS; specificity corrected. Independent critic found: non-button iframes cropped by button-only height rule, double-counted explicit button height, and delayed modal focus stealing selection. All corrected; read-only critic recheck found no residual blockers. Small explicit-height components may still scroll authored content under existing layout contract.

## Evidence

- `artifacts/c1-catalog/01-native-catalog.png`: actual Korean desktop catalog.
- `artifacts/c1-catalog/02-native-brand-integration.png`: native lower-page integration.
- `artifacts/c1-catalog/03-export-brand-desktop.png`: screen-only actual exported desktop page.
- `artifacts/c1-catalog/04-export-brand-mobile.png`: screen-only mobile lower page.
- `artifacts/c1-catalog/05-browser-input-catalog.png`: final English input comparison.
- `artifacts/c1-catalog/06-native-outline.png`: actual five-provider outline selection, focus retained.
- `artifacts/c1-catalog/07-native-layout.png`: final expanded single-layout showcase.

Final desktop build81099 completed and relaunched; native left on C1 Layout / Editorial hero catalog. Final changes after the ZIP were catalog-only CSS; exported page rendering is identical. Temporary browser viewport reset. Final independent critic reported no residual blockers in static review. Bundle-size warning remains (~1.62MB main JS uncompressed); this goal does not claim startup performance improvements.

Screenshots are actual UI captures, not generated mockups; no continuous video captured in this chunk. Preview thumbnails are visual only; full-size inspection and canvas are the interaction/review surfaces. Browser at1421 has separate local storage from desktop. No Chrome used.

## Remaining / next goal

1. Extend consistent project typography/surface mapping to official input/card adapters and distinguish compact control placement from a content section explicitly in the model.
2. Add richer official layout adapters only with verified support; currently many layout kinds honestly expose only Aphrodite. Do not present HIG/Toss presets as complete libraries.
3. Catalog search/provider filters and user favorites beyond the existing 12-item assembly shelf; preserve selected category/type/variant across navigation.
4. Repeat controlled reference edits after visual approval. No new efficiency, WCAG-wide or token-savings claim. Existing image placeholders and demo links remain.

Skills used: shadow-git-sandbox for protected pre/post snapshots and independent critic review; vercel-react-best-practices for the React adapter's existing direct component imports.
