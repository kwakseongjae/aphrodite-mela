# Aphrodite v0.2.1 — release notes

The fixes 0.2.0 needed, and the first release an existing Aphrodite installs entirely on its own.

## Download

- Apple Silicon: `Aphrodite_0.2.1_aarch64.dmg`
- Intel: `Aphrodite_0.2.1_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## What's new since v0.2.0

**The bottom of the home sidebar is back on screen**
- Home claimed the whole window, but the connection banner sits above it, so with an agent connected
  the sidebar ran past the bottom edge and the brand-kit link was gone. Home now takes the room that
  is left, the way the editor already did.
- A test holds it: only the app shell may measure itself against the window, never a screen inside
  it. The bug had shipped in the screenshots too, because every capture cropped the banner away.

**"What changed" reads as sentences**
- The update card summarised the notes a line at a time, so a paragraph wrapped at eighty columns
  arrived as fragments and a download list could surface a file name as the news. Paragraphs are
  rejoined and the paperwork is skipped, and the check runs against the notes this release ships.

## Known limits

- An Aphrodite older than v0.1.6 has no updater and must be replaced from the disk image once.
