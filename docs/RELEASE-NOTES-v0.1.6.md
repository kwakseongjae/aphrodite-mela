# Aphrodite v0.1.6 — release notes

An interim build. It carries real work, but its job is to prove the release pipeline end to end —
above all that **an installed Aphrodite can update itself**, which cannot be tested against anything
but a real signed release. v0.2.0 is the version that gets announced.

## Download

- Apple Silicon: `Aphrodite_0.1.6_aarch64.dmg`
- Intel: `Aphrodite_0.1.6_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## What's new since v0.1.5

**Updates that install themselves**
- The update card leads with **Install and restart**: it fetches the new version, checks its
  signature, puts it in place and reopens Aphrodite on it. The disk image is still one button away.
- v0.1.5 shipped without an updater, so this one is installed by hand. From here it is automatic.

**An agent can drive the workbench through MCP**
- The MCP server (`mcp/aphrodite-mcp`, no dependencies) is now written down where people look:
  README, the Korean README, QUICKSTART and the landing page. Eleven tools; one `claude mcp add`
  or `codex mcp add`.
- Reading always works; writing needs Connected mode, which only a person turns on. The agent can
  ask, and the request appears on screen with its name on it.
- Connected mode says how long it has left — "for 12 hours · 11 h left" — on the switch and in the
  banner, because it outlives the launch that granted it and that should not be a surprise.

**Fifty-eight ways to lay out a section**
- Navigation, hero, features, products, testimonial, call to action and footer now offer eight or
  nine compositions each, up from twenty-three in total. Changing one never touches what you wrote.
- A layout name we retire is migrated when the project opens, so nothing saved stops opening.

**Fixes found by using it**
- The channel panel printed a live bearer token in plain text. It now shows the recipe that reads
  the token at run time, so a screenshot or a stream carries nothing out of the room.
- `GET /agent/state` reported the editor's tab where an agent looked for permission — both are
  called `design`. The state now answers with `connection` and `writes`.
- A refusal told people to look under Help for a switch that moved to the home top row.

## Known limits

- Writing through the channel is remembered for twelve hours after the person allows it, including
  across relaunches. The switch ends it sooner.
