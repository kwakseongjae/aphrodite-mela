# Aphrodite v0.1.4 — release notes

## Download

- Apple Silicon: `Aphrodite_0.1.4_aarch64.dmg`
- Intel: `Aphrodite_0.1.4_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## Fixes since v0.1.3

- **Editing a component's text no longer crashes the editor.** Changing the title or body in the inspector tried to update a status badge that left the canvas in v0.1.2 and stopped rendering with "null is not an object". Please update if you downloaded v0.1.3.
- Every dropdown in the app (frame size, composition, implementation, typeface, radius, forms in dialogs) now uses the same custom menu as the language switch instead of the system control. Keyboard works: Enter or Space opens, arrows move, Enter picks, Esc closes.
- The status line and `#app[data-viewport]` follow the active frame's size preset; the mobile preset reads 390px.
