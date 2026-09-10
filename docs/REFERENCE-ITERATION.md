# Reference → editable directions — 2026-09-08

## Delivered

An actual screenshot can now become an editable draft without a generative-model call:

1. Upload a PNG/JPEG/WebP reference, or load the built-in screenshot sample.
2. Inspect local pixel colors and a proposed media region. On macOS, Apple Vision also returns text, confidence and normalized boxes.
3. Review/edit the proposed heading, body and action label. Cropped media is opt-in. Project tokens remain unchanged.
4. Compare three actual HTML compositions: split, image-left and stacked. These are fixed component variants, not three AI-generated designs.
5. Select one. It becomes a new editable page, preserving existing pages. Undo/Redo applies to the selection.
6. Export component IDs, versions, variants, content slots and analysis provenance in SCENE.json alongside the HTML and existing handoff. The prompt explicitly names the active direction's HTML file.

## Evidence and scope

- Twelve automated model/reference tests pass, including old project compatibility, malformed variants/evidence, OCR normalization and distinct candidate identities.
- The macOS Swift helper read 25 text observations from the bundled 1600×866 sample screenshot. One measured native UI run reported 0.38 seconds for analysis; this is a single local sample, not a benchmark or a sub-minute end-to-end guarantee.
- The sample's two-line heading and supporting copy were mapped correctly. Other small text included OCR errors despite high engine confidence. Review remains essential.
- Native accessibility controls successfully opened analysis, enabled the optional crop, compared directions, selected direction 2 and undid/redid the new page.
- Browser fallback explicitly reported Pixels only / 0 text lines. The extracted palette did not mutate project colors.
- Browser-generated ZIP inspection confirmed SCENE.json and the selected hero variant matched the exported HTML. A visual prototype sharing its renderer is not proof of production implementation parity.
- All three hero variants were rendered at 375px and 1440px browser viewports: no horizontal overflow and no broken images. Split/image-left became one column on mobile; stacked remained one column. An initial hidden-frame async test timed out; the subsequent eager-image, two-step fixture check completed and fixtures were removed.
- Tauri release build and launch pass using script/build_and_run.sh. Codex Run uses that entrypoint; a local Git repository was initialized for app support. No commit or remote publication was made.

## Deliberate boundaries

The pixel heuristic ranks three rectangular texture regions; it does not detect semantic objects or recover arbitrary screenshot layouts. OCR maps only a proposed hero heading/body. Remaining sections are clearly editable placeholders. A photographic reference with no readable text falls back to the project brief. The native helper is macOS-only, receives bounded raster bytes, writes only private temporary files and has a 25-second process timeout. Browser fallback performs no OCR.

No remote image generation, vision-language model, OAuth, video, official third-party component package, full OmD graph adoption, production-site drift evaluator or installed Codex plugin was added. Signing/notarization of this new helper for distribution remains future work.

## Product implication

The immediately demonstrable hook is **one screenshot → three token-consistent, editable directions → code-ready scene contract**. The shareable moment is the side-by-side comparison followed by a real edit, not an animated fake agent cursor. Do not market this as understanding every screenshot or copying a brand's official system.

For strategic interest from design-platform companies, the stronger technical question remains: can selected design decisions survive the coding agent and later edits? This iteration establishes component identity/provenance, but does not yet answer that question. The next useful vertical slice is an OmD adapter for one real component family plus automated comparison of an implemented page against the approved contract. Useful evaluation would measure correction count, time to user-approved direction and post-export token/component drift, with at least three domains rather than only this furniture sample. This is a product hypothesis, not evidence that Figma will acquire or partner with the project.

## Screenshots

Actual native app captures (not design mockups):

- `artifacts/reference-flow/01-native-analysis.jpg`
- `artifacts/reference-flow/02-native-comparison.jpg`
- `artifacts/reference-flow/03-native-editable-direction.jpg`

Technical references: [Apple Vision text recognition](https://developer.apple.com/documentation/vision/vnrecognizetextrequest), [Tauri bundled resources](https://v2.tauri.app/develop/resources/). Market context and its source links remain in PRODUCT-STRATEGY.md.
