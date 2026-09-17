# Aphrodite v0.2.3 — release notes

The release that reads its own work back: a design contract that reaches every screen, a channel an
agent can finish a job on, and eight defects found by looking at what had just shipped.

## What's new since v0.2.2

**The app screen obeys the design contract, like everything else**
- The sample app screen carried sixty-seven hard-coded colours and read a single token, so changing
  the design system left it untouched — a blue-and-grey board inside whatever brand you had chosen.
  On a dark system its heading and figures went dark-on-dark and could not be read at all.
- It paints from the contract now: four layers derived in the contract's own terms, and status
  colours taken from danger, success and warning rather than a second opinion. A test keeps it there
  — the recipe may name no colour of its own.
- Its four recipes gained eleven more variants, so an app screen is no longer one shape, and the
  board scrolls sideways with snap points on a phone instead of squeezing five lanes into 390px.

**An agent can change the design system and finish the handoff**
- `aphrodite_set_design_system` repaints the project from a built-in, a DESIGN.md or loose tokens, as
  one change with one undo. `aphrodite_export_contract` answers with PROMPT.md, DESIGN.md,
  tokens.json and the SCENE manifest as text — an agent cannot open a zip — and says plainly when the
  composition has not been approved.
- Four slash commands for the things a person asks for by name: `/shape`, `/handoff`, `/restyle`,
  `/critique`. Each names the tools to use and where to stop; none of them can approve a direction.
- The archive gained `unkeep`, so an agent can take back something it filed by mistake.

**The handoff describes the page it hands over**
- `tokens.json` named `Inter` while the page was painted with Arial, Pretendard and Noto Sans KR, so
  the contract threw away every Korean fallback on the way out. It carries the stack the renderer
  actually uses.

**Faster to open**
- The official-library preview — React and four vendor stylesheets — was parsed on every launch and
  was three quarters of the bundle, for something a project whose blocks are all `own` never opens.
  It is fetched when a page needs it: 2,454 kB down to 652.
- A reference picture is fitted to a 1600px long edge on the way in. A nine-megabyte photograph
  becomes 276 kB, about thirty times less across the bridge.

**Fixes**
- The window comes to the front when the app restarts itself, so an update no longer looks like it
  did nothing on a second display.
- A line you crossed out of taste.md stays crossed out, even when its count changes.
- Taste from one component no longer reorders another's directions, and an agent's edit is no longer
  filed as your correction.
- The archive shows the project you have open, not the one before it.
- `moacard · cover` is `banner`: a task card has no picture, and a name is a contract.

## Download

- Apple Silicon: `Aphrodite_0.2.3_aarch64.dmg`
- Intel: `Aphrodite_0.2.3_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.

## Known limits

- The app-screen recipes hide their sidebar below 650px. That is deliberate, not a defect.
- The Intel build has never been run by anyone; it is built and signed but unopened.
- An Aphrodite older than v0.1.6 has no updater and must be replaced from the disk image once.
