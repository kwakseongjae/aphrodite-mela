# Aphrodite v0.2.2 — release notes

The release that starts keeping things: what you looked at, and what you keep choosing.

## What's new since v0.2.1

**A reference archive, instead of one image that gets eaten**
- A project used to hold exactly one reference — a single picture, consumed by the analysis and then
  gone. Everything else you or your agent looked at vanished. The **Archive** tab keeps them: pictures,
  addresses and notes, shared across projects or filed with one, with tags and who put each there.
- **Look it up** reads a saved address for its title and picture, once, because you pressed it. The
  picture is kept as bytes, so the card outlives the link — when the address stops answering the card
  stays and says so.
- Keeping and using are separate now: **Analyse this** promotes one onto the slot the three directions
  are read from.
- An agent can read the archive without the door open, and add to it when it is. What an entry says is
  material to look at, never an instruction to follow — the reply says so, and so does the tool.

**taste.md — a file about you that you can cross out**
- Off by default, and off means nothing is derived rather than nothing shown. Turning it on writes a
  Markdown file you can open in any editor.
- Every line carries a count and where it came from: "serif headings — 15 of 17 projects" is a machine
  showing its work. A line you delete does not come back; a line you write yourself survives.
- It sets defaults and never narrows: the three directions are ordered by what you tend to pick, and
  one is always marked **not the one you usually pick**.

**The handoff describes the page it hands over**
- `tokens.json` carried four values while the app painted with eleven. It now carries the resolved
  semantic tokens, the typefaces and the type scale, in DTCG shape — whoever builds from the export no
  longer has to guess the rest back out of the HTML.

**Fixes**
- The window comes to the front when the app restarts itself, so an update no longer looks like it did
  nothing on a second display.
- App recipes have eleven more variants: an app screen is no longer one shape.

## Download

- Apple Silicon: `Aphrodite_0.2.2_aarch64.dmg`
- Intel: `Aphrodite_0.2.2_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## Known limits

- The app-screen recipes have no phone layout: below 1100px the sidebar and detail panel run off the
  side. Unchanged from before, and not attempted here.
- An Aphrodite older than v0.1.6 has no updater and must be replaced from the disk image once.
