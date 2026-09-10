# Aphrodite v0.1.2 — draft release notes

## Download

- Apple Silicon: `Aphrodite_0.1.2_aarch64.dmg`
- Intel: `Aphrodite_0.1.2_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## What's new since v0.1.1

**Figma-style editor chrome**
- Floating dock at the bottom centre: Select (V), Add component (A), Layout frame (F), Reference (R), Get Vibe (G), Preview (P), plus a mode segment (Design 1 · Dev 2 · Agent 3) and the zoom control.
- The workbench heading, workflow strip and the bottom "Start from a brief" bar are gone from the canvas. Moa app recipes and the Pointer lab moved into the command palette.
- Hover outline on canvas blocks in Select mode; nothing floats above the dock at rest. The pointer HUD appears only while moving or resizing (drop target, `W × H px`).

**The Space (open canvas)**
- Every page is a frame on an open canvas: desktop 1440, tablet 834, mobile 390 or a custom width. Pan with the wheel, Space+drag, the Hand tool (H) or the middle button; zoom with ⌘wheel or pinch; ⇧1 fits everything, ⇧2 the current frame, ⌘0 is 100%.
- Drag a frame by its label to move it. New frame (F) creates a page and places it beside the others; Tidy frames lines them up. Frame positions save with the project, the camera per device.
- Reference → 3 directions can spread all three as proposal frames below the source frame; pick one from its label (use / keep as page / discard).
- Left and right panels collapse into floating corner tabs: hover to peek, click to pin. ⌘\ hides or shows both.
- A search field in the top bar opens the command palette (⌘K, /, or click); it searches commands, components and frames. Language is the same dropdown as on Home.
- Agent mode can be scoped to the current frame only.

**Dev mode**
- Read-only Inspect panel with a block selected: identity, tokens as CSS custom properties, rendered markup, content contract, node (parent · children · layout) and DESIGN.md, each with a copy button.
- Page-level handoff with nothing selected: page HTML, SCENE node table, a prompt for a coding agent, tokens.json.

**Agent mode**
- Hand the screen to a computer-use agent with an operator, an intent and a scope (change design system, export/save, delete pages). Approving a direction is never delegable.
- Banner with elapsed time and live receipt count; the inspector becomes an agent console with scope and a newest-first receipt timeline. Take control back at any time; the run is recorded either way.
- Locked actions are refused with a toast while delegated.

**Home and brand**
- Window uses the light appearance, so the title bar stays readable under macOS dark mode.
- Aphrodite Brand Kit (아프로디테 브랜드 리소스): identity, colour, type, voice, cutouts and do/don't on one page. Modal headings stay put while the content scrolls.
- Right-click a project card for its menu; Delete… asks for confirmation in-app. Projects sort by last opened. The Files modal offers Preview and Export per file.
- Filters as chips next to a compact search; EN/KO dropdown; simpler storage button and modal; lucide icons throughout; no focus rings; two captions removed; Paper-theme button height fixed.

**Under the hood**
- Keyboard shortcuts match on `KeyboardEvent.code` so they work under the Korean input source.
- Uncaught errors render a visible fatal-error surface instead of a blank webview.

## Known limits

- Delegation is a contract and a record, not a physical lock on the mouse.
- Calendar has no MUI/SEED adapter; the four Moa app-recipe blocks remain single-option.
