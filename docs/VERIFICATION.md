# Prototype verification — 2026-09-08

The initial checks below are retained as historical evidence. The follow-up reference/OCR/three-direction implementation has 12 passing automated tests and native/browser checks documented in [REFERENCE-ITERATION.md](REFERENCE-ITERATION.md).

## Build and model checks

- `npm test`: 7 tests passed. Project serialization, approval invalidation, page-switch stability, rejection of unsafe image/CSS/identifier inputs, local image allowlist, conservative DESIGN.md import, deterministic brief composition.
- `npm run build`: TypeScript check and Vite production build passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `npm run desktop:build`: macOS release bundle produced successfully. Local build, not a notarized distribution.

## Browser interaction checks

- Desktop to mobile: the canvas became 375px and the hero changed to one column.
- Add CTA: block count changed from 5 to 6; Move up placed it before the footer; two Undo operations restored the original order and count.
- Export dialog approval: changed Draft to Approved. Choosing Karrot changed primary to #ff6f0f and returned the project to Draft.
- Brief form: created a second page without removing the first, with a furniture-store composition.
- Auto fill: placeholder hero copy became Form & Field copy and local interior image appeared.
- ZIP download: produced `artifacts/form-field.zip` with two HTML pages, DESIGN.md, PROMPT.md, tokens, editable project JSON and three images.
- Archive inspection: all local image references resolved, HTML IDs were unique, all internal anchor destinations existed and editor controls were absent from exported HTML.
- Opening the extracted HTML through a `file://` URL rendered all four image occurrences successfully. Desktop and 375px mobile had no horizontal overflow; mobile hero and product grid were single-column.
- Drag-and-drop event path: a synthetic browser DragEvent with the registered transfer type inserted a Testimonial before the first block (5 → 6). Physical drag automation did not provide a successful insertion result: browser input timed out and native coordinate gestures left state unchanged. This does **not** constitute full pointer-gesture verification. Add and move buttons are verified alternatives. Native file-drop interception is disabled to leave HTML DnD available.

## Native macOS checks

- Started the release `.app` at `tauri://localhost` with local assets visible.
- Accessibility tree exposed named controls, edit fields, page components, modal controls and native color wells.
- Edited the hero with native keyboard input and observed the changed heading on the canvas.
- Verified Undo and Redo after preventing duplicate no-op change events from creating history entries.
- Native ZIP export opened the macOS Save panel, accepted a chosen artifacts folder and saved `artifacts/native-handoff.zip`. UI displayed successful export; `unzip -t` reported no errors.
- Restarted the finalized release app successfully. The sample heading was restored for handoff.

## Not asserted by this verification

No model/agent authentication, generative-image integration, video analysis, full OmD conformance, production ecommerce, Windows/Linux runtime test, 200% accessibility certification, human visual approval or full physical-drag success is claimed. The editor's compact desktop controls and user-chosen token contrast still merit a dedicated accessibility pass before product release.
