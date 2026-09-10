# Aphrodite v0.1.3 — draft release notes (onboarding)

## Download

- Apple Silicon: `Aphrodite_0.1.3_aarch64.dmg`
- Intel: `Aphrodite_0.1.3_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## What's new since v0.1.2

**From download to first project**
- The DMG opens on a paper background with a single instruction: drag Aphrodite into Applications.
- First launch shows a welcome sheet: pick English or Korean, then start with a sample project (a small lighting brand with a desktop and a mobile frame) or a blank one. "Not now" keeps Home as it is.
- The first time the editor opens, a five-step tour points at the dock, the search field, a frame label, the inspector and the Agent mode switch. Esc skips it; "Show the editor tour again" lives in the command palette.
- Onboarding state is per device (`aphrodite-onboarding-v1`) and mirrored on `#app[data-onboarding]` for agents.

## Known limits

- The tour anchors to live elements; if a panel is collapsed the card centres on screen instead.
