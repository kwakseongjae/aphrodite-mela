# Aphrodite v0.2.0 — release notes

The release that makes an agent a first-class way to use Aphrodite, and the last one you install by
hand.

## Download

- Apple Silicon: `Aphrodite_0.2.0_aarch64.dmg`
- Intel: `Aphrodite_0.2.0_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## What's new since v0.1.5

**An agent can drive the workbench — through MCP, with you holding the door**
- Aphrodite ships an MCP server with no dependencies. Claude Code picks it up from the repository's
  `.mcp.json`; anywhere else, one `claude mcp add` or `codex mcp add`. Eleven tools: read the state
  and the design contract, list components, tokens and pictures, render the page as an image, read
  the guide, ask for a connection, apply a batch of edits, and reach the interface directly.
- **The permission rule lives in the app, not the client.** Reading always works. Changing the
  design needs Connected mode, which only a person turns on — the switch in the home top row. An
  agent that is refused can *ask*: a one-line request with its name on it appears on screen, and
  you allow or decline with one click. It cannot open its own door, and approving a direction stays
  a decision no tool can make.
- Connected mode says how long it has left — "for 12 hours · 11 h left" — on the switch and in the
  banner, because it outlives the launch that granted it and that should not be a surprise.
- A batch of edits lands as **one change**: all or nothing, one undo, one receipt.
- `update` carries words, layout and pictures together, so restyling or re-illustrating a component
  never means deleting and re-adding it. `page` makes and names pages; whatever follows in the same
  batch lands inside the new one.
- The picture library an agent sees is the one you see — the fifty photographs the app ships with,
  alongside anything in your local folder.
- `render` draws the current page off screen with the app's own WebKit, at the width asked for, with
  its pictures in it. Nothing moves on your screen.

**Updates install themselves**
- **Install and restart** fetches the new version, checks its signature, puts it in place and
  reopens Aphrodite on it. The disk image stays one button away for anyone who prefers it.
- What changed is answered in the card — the first lines of the release notes fold out where you
  are, rather than sending you to a browser.
- The check reads a static file rather than an API with an hourly quota, so a shared address — an
  office, a cafe — cannot leave everyone in the building unable to hear about a new version.
- **This is the last release you install by hand.** v0.1.5 shipped without an updater, so v0.2.0
  comes from the disk image once, and every version after it arrives on its own.

**Fifty-eight ways to lay out a section**
- Navigation, hero, features, products, testimonial, call to action and footer each offer eight or
  nine compositions, up from twenty-three in total. Changing one never touches what you wrote, and
  every one was checked at 1440 and 390 before it was offered.
- A layout name we retire is migrated when a project opens, so nothing you saved stops opening.

**The design contract says more, in design words**
- Fourteen carried facts instead of five: semantic colours, the type scale, real font stacks, and
  anything a brand's DESIGN.md said that we had no slot for is carried through rather than dropped.
- Design systems have Korean type, and every fallback stack can actually render Korean.

**Home, workspaces and the editor**
- Workspaces: a local book with avatars; projects belong to one; the sidebar collapses.
- Filtering, sorting and searching no longer redraw the page — images stay put, nothing flickers.
  Card menus open at the cursor, toasts stack in one corner.
- Figma-style editor chrome: no top bar, a grouped bottom dock, floating actions, a resizable
  inspector, marquee selection.

**Pictures and type**
- Fifty bundled photographs with a categorised picker, and a local image library on this Mac — a
  project scope and a shared scope — that you or your agent fills. Exports carry uploads in
  `assets/uploads/` with `UPLOADS.md`.
- A catalogue of freely licensed font families with one-click local install.

## Fixed

- **The window would not close.** With an edit still being written to disk, ⌘W and the red button
  both ended in a permission error and the only way out was force-quitting.
- The agent console printed a live bearer token in plain text, so a demo, a stream or a screenshot
  carried a working credential out of the room.
- `GET /agent/state` reported the editor's tab where an agent looked for permission — both are
  called `design`. It answers with `connection` and `writes` now.
- A render came back with broken pictures, because it is served from the loopback bridge and the
  bridge does not answer for app assets.
- A refusal told people to look under Help for a switch that had moved to the home top row.

## Known limits

- Writing through the channel is remembered for twelve hours after you allow it, including across
  relaunches. The switch ends it sooner.
- Approving a direction is yours alone; no tool can do it, and export waits for it.
