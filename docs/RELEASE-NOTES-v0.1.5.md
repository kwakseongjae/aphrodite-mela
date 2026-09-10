# Aphrodite v0.1.5 — release notes

## Download

- Apple Silicon: `Aphrodite_0.1.5_aarch64.dmg`
- Intel: `Aphrodite_0.1.5_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## What's new since v0.1.4

**Agent mode is the agent's**
- Starting Agent mode now hands the whole window to the agent: a golden shield (the apple's colour) breathes around the edges, a one-line banner names the operator, elapsed time, receipts, scope and the channel, and people are locked out — clicks, keys, wheel, paste all stop. The banner's **End Agent mode** button and **⌘⇧A** are the only human controls.
- The agent drives through a channel instead of the mouse: a loopback HTTP endpoint in the desktop app (`agent-endpoint.json` with port and token in Application Support) with `state / command / act / click / edit / type / key / end`, or `window.aphroditeAgent.run()` in a browser build. Every command is receipted; scope and the approval lock still apply. See `docs/AGENT-CHANNEL.md`.
- The agent console shows ready-made curl lines for the channel.

**Export**
- Uploaded images now travel with the export: they are written to `assets/uploads/` (named by content hash), the HTML references them instead of embedding base64, and `UPLOADS.md` lists where each is used. The project file keeps the originals so it re-imports unchanged.

**Search**
- ⌘K / `/` search is ranked and forgiving: spaces and separators do not matter (`디자인시스템`, `getvibe`), prefixes come first, fuzzy matches follow for three or more characters, and related commands from the same group appear under a "Related" divider. Typing is debounced so long lists do not flicker.
- Commands carry synonyms (design system, vibe, reference, zoom, panels, frames, agent, dev).

## Known limits

- A computer-use agent that only moves the physical mouse is locked out like a person; it must use the channel (shell) or ask the human to end Agent mode.
