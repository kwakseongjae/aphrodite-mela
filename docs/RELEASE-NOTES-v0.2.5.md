# Aphrodite v0.2.5 — release notes

A fix for a promise the app did not keep: approving a direction is yours alone, and an agent could
do it for you.

## What's new since v0.2.4

**An agent can no longer approve a direction, or bring back an approval you had moved past**
- What was wrong: once you had let an agent edit, it could approve a board itself. Asking the app to
  run the approve action, or clicking the real Approve direction button, marked the board approved
  exactly as your own click does. It could also bring an approval back: after a change turned an
  approved board into a draft, an agent that put the content back the way it was, or ran undo or
  redo, left the board matching what you had approved, and it read as approved again.
- Who this affects: anyone who has allowed an agent to edit — Connected mode, or handing the screen
  over in Agent mode — at least once. If you never connected an agent, nothing here changes for you.
- What changes: while an agent's command is running, the approve buttons do nothing and the agent is
  told that approving is your decision. When an agent's command ends with the board approved and it
  was a draft when the command started, the approval is cleared, the board stays a draft, and the
  agent's reply says so. The agent's edits, undos and redos themselves still go through. Your own
  button and your own ⌘Z work as before, including stepping back to a board you approved.
- What to check: open the boards you worked on with an agent connected and look at the Approved or
  Draft mark once more. If a board says Approved and you do not remember approving it as it is now,
  review it and approve it again yourself.

## Known limits

- This update does not go back over approvals made before it. It cannot tell which of them an agent
  made, so they keep the mark they have; that is why the check above is worth the minute.
- While an agent's command is running your own press of Approve direction is ignored too. That is
  usually a fraction of a second, but longer when the agent is waiting on a save dialog it opened.
  Press it again once the agent is done.
- An Aphrodite older than v0.1.6 has no updater and must be replaced from the disk image once.

## Download

- Apple Silicon: `Aphrodite_0.2.5_aarch64.dmg`
- Intel: `Aphrodite_0.2.5_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.
