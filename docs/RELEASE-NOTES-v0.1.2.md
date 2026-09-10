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

**Dev mode**
- Read-only Inspect panel with a block selected: identity, tokens as CSS custom properties, rendered markup, content contract, node (parent · children · layout) and DESIGN.md, each with a copy button.
- Page-level handoff with nothing selected: page HTML, SCENE node table, a prompt for a coding agent, tokens.json.

**Agent mode**
- Hand the screen to a computer-use agent with an operator, an intent and a scope (change design system, export/save, delete pages). Approving a direction is never delegable.
- Banner with elapsed time and live receipt count; the inspector becomes an agent console with scope and a newest-first receipt timeline. Take control back at any time; the run is recorded either way.
- Locked actions are refused with a toast while delegated.

**Home**
- Filters as chips next to a compact search; EN/KO dropdown; simpler storage button and modal; lucide icons throughout; no focus rings; two captions removed; Paper-theme button height fixed.

**Under the hood**
- Keyboard shortcuts match on `KeyboardEvent.code` so they work under the Korean input source.
- Uncaught errors render a visible fatal-error surface instead of a blank webview.

## Known limits

- Delegation is a contract and a record, not a physical lock on the mouse.
- Calendar has no MUI/SEED adapter; the four Moa app-recipe blocks remain single-option.
