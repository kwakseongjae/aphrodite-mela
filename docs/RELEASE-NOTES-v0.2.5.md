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
- What changes: an agent's press of Approve direction or Approve now is refused, whichever way it
  arrives, and the agent is told that approving is your decision. A board that changes after you approve it becomes a draft at that moment, and stays
  a draft even if the content comes back exactly as it was, whoever brought it back. Approve it
  again when you are happy with it. Your own ⌘Z still steps back to the board you approved, with
  its approval. An agent's undo or redo brings the content back but not the approval, and its reply
  says so.
- What to check: open the boards you worked on with an agent connected and look at the Approved or
  Draft mark once more. If a board says Approved and you do not remember approving it as it is now,
  review it and approve it again yourself.

## Known limits

- This update does not go back over approvals made before it. It cannot tell which of them an agent
  made, so they keep the mark they have; that is why the check above is worth the minute.
- An Aphrodite older than v0.1.6 has no updater and must be replaced from the disk image once.

## Download

- Apple Silicon: `Aphrodite_0.2.5_aarch64.dmg`
- Intel: `Aphrodite_0.2.5_x64.dmg`
- Signed with Developer ID and notarized. macOS 13 or later.
