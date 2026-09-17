# Aphrodite v0.2.4 — release notes

A release about being able to believe the tests. A moved folder now says so instead of looking like
a first launch, a project can change workspace without one being deleted, and five checks that were
quietly measuring nothing have been made to measure something.

## What's new since v0.2.3

**A moved data folder says so, instead of welcoming you as a stranger**
- Moving the folder Aphrodite saves into never lost anything — put it back and everything returns —
  but the app could not tell that from a new install. A missing file and a first launch look
  identical to the code that reads them, so someone with eighteen projects met the welcome screen.
- Worse, the app then wrote an empty library straight over the situation, so by the time you saw the
  welcome the evidence that anything had been there was gone.
- It now leaves a note somewhere the data folder is not, and reads it on the way in. An empty store
  plus a memory of filling it is a notice naming the folder it looked in and how many projects were
  in it — and while that notice is up, nothing is written to disk. Looking again answers either way.
  Starting fresh asks first, and says that the old folder is not deleted.

**A project can move to another workspace without deleting one**
- Moving projects between workspaces existed, but the only way to reach it was to confirm the
  deletion of a workspace. So a project's workspace was decided when it was made, and changing it
  meant destroying the container around it.
- A project's ··· menu now lists every workspace except the one it is already in.

**The macOS version we promise is a version we test**
- `minimumSystemVersion` has said 13.0 all along while CI ran on macOS 14 and 15 — the oldest system
  we tell people to expect was the one nothing ever ran on. Checks now also run on macOS 13, which is
  additionally the only Intel runner available, so the architecture shipped every release but never
  executed is exercised too.

**Five checks that were measuring nothing**
- Gates reused a fixed browser profile that nothing ever cleared, so each run inherited the last
  one's data. A check could pass because a previous run created the state it wanted.
- Gates served whatever bundle happened to be built last rather than the code in the tree — a green
  check for code that no longer exists, and a red one for code that does.
- Each gate run stranded its preview server; seven were found alive at once.
- Two workspace checks picked the "other" workspace by excluding an attribute the app has never
  rendered, so they excluded nothing and often tested the wrong one.
- The disk path — the one the desktop app actually uses — had no coverage at all. Every gate drove a
  browser, which exercises the other branch entirely, and nothing asserted which branch was live.
  `npm run verify:disk` now checks the real thing, and refuses to run against a browser rather than
  quietly reporting localStorage as disk coverage.

**Smaller things**
- The MCP server reports its real version. It had said 0.1.5 for nine releases.
- A leftover `agent-endpoint.json` — the app does not delete it on exit — can now be recognised as
  stale instead of costing a timeout, or worse, reaching whatever inherited that port.
- `taste.md` and the reference archive are properly listed as read-only tools.

## Download

Apple Silicon and Intel builds are attached below, signed, notarized and stapled. The app updates
itself from here on.
