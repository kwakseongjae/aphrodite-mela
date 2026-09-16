# Aphrodite v0.2.0 — release notes

> Draft, written 2026-09-16 before the tag. If the release ships as 0.1.6, rename this file and the download names; nothing else changes.

## Download

- Apple Silicon: `Aphrodite_0.2.0_aarch64.dmg`
- Intel: `Aphrodite_0.2.0_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## What's new since v0.1.5

**An agent can drive the workbench — through MCP, with the person holding the door**
- Aphrodite ships an MCP server with no dependencies (`mcp/aphrodite-mcp`). Claude Code picks it up from the repository's `.mcp.json`; anywhere else, `claude mcp add --transport stdio aphrodite -- node …/mcp/aphrodite-mcp/index.mjs`, and Codex with `codex mcp add`. Eleven tools: read the guide and the design contract, list components and tokens, look at the picture library and add to it, render the page as an image, ask for a connection, apply a batch of edits, and reach the app's own interface when nothing else says it.
- The permission rule lives in the app, not the client. Reading always works. Writing needs **Connected mode**, which only a person can turn on — the switch in the home top row. An agent that is refused can *ask*: a one-line request with its name appears on screen and the person allows or declines with one click. A standing request is one at a time; a decline holds for five minutes.
- Connected mode keeps the person at the screen. A banner counts the agent's changes and ⌘Z takes any of them back. If the person starts typing, the agent's write lease is recalled and it is told to wait.
- `apply` lands a batch of edits as **one change**: all or nothing, one undo, one receipt.
- `render` draws the current page with the app's own WebKit, off screen, at the width you ask for — nothing moves on the person's screen.
- The channel is on from launch (`agent-endpoint.json`, mode 600). `GET /agent/guide` needs no permission and tells an agent how any of this works and what state the app is in now.

**The design contract says more, in design words**
- The contract carries fourteen facts instead of five: semantic colours (surface, line, muted, danger, success, warning), the type scale, real font stacks, and anything a brand's DESIGN.md said that we had no slot for is carried through rather than dropped.
- A design system can be read in the structured graph form a tool writes, and the import says what landed and what it could not place.
- Design systems have Korean type. Every fallback stack renders Korean.

**Fifty-eight ways to lay out a section**
- Navigation, hero, features, products, testimonial, call to action and footer each offer eight or nine compositions (23 → 58). Changing the variant never touches what you wrote. Every one was checked at 1440 and 390 before it was offered; a picker can no longer list the same name twice.
- A layout name we retire is migrated on load, so a project saved under the old name still opens.

**Home and workspaces**
- Workspaces: a local book of workspaces with avatars; projects belong to one; the switcher sits in the sidebar, which collapses.
- Filtering, sorting and searching the project list no longer redraws the page — images stay put, nothing flickers. Card menus open at the cursor. Toasts stack in one corner.
- Agent connection is a real switch in the home top row; help hangs off the `?` and lists only what works.

**Editor**
- Figma-style chrome: no top bar, a grouped bottom dock, floating actions, a resizable inspector. Peek no longer shifts the layout. Marquee selection; clicking the empty canvas deselects.

**Pictures and type**
- Fifty bundled sample photographs with a categorised picker.
- A local image library on this Mac — a project scope and a shared scope, with deletion — that the person or their agent fills. Exports carry uploads in `assets/uploads/` with `UPLOADS.md`.
- A catalogue of freely licensed font families with one-click local install.

**Updates**
- When a newer version exists, a small card in the bottom-left corner says so. Click it to download the DMG for your Mac; the file is checked before it is offered. "Skip this version" is remembered.

## Known limits

- Writing through the channel is remembered for twelve hours after the person allows it, including across relaunches. Turn the switch off to end it sooner.
- The update card downloads; it does not install in place. Drag the new Aphrodite to Applications as before.
- A computer-use agent that only moves the physical mouse is still locked out during Agent mode; it should use the channel or MCP.
