# Aphrodite v0.2.5 — release notes

A fix for a promise the app did not keep: approving a direction is yours alone, and an agent could
do it for you.

## What's new since v0.2.4

**Through the app's agent connection, an agent can no longer approve a direction or bring an approval back**
- What was wrong: once you had let an agent edit, it could approve a board itself. Asking the app to
  run the approve action, or clicking the real Approve direction button, marked the board approved
  exactly as your own click does. It could also bring an approval back: after a change turned an
  approved board into a draft, an agent that put the content back the way it was, or ran undo or
  redo, left the board matching what you had approved, and it read as approved again.
- Who this affects: anyone who has allowed an agent to edit, in Connected mode or by handing the
  screen over in Agent mode. One change below, a changed board staying a draft, applies to everyone.
- What changes: a press of Approve direction or Approve now that comes through the app's agent
  connection is refused, and the agent is told that approving is your decision.
- A change to what an approval covers (the project's name and brief, its pages with their components
  and words, the design system, the reference and the content language) turns an approved board into
  a draft at that moment. It stays a draft even if the content comes back exactly as it was, whoever
  brought it back. Approve it again when you are happy with it.
- Undo and redo: a step that leaves the board as you approved it keeps the approval. If an agent's
  undo or redo would bring back an approval the board did not have, the content comes back as a
  draft, and only then does its reply say so. For example, you approve a board as A and then change
  it to B. Your own ⌘Z back to A shows A approved again. An agent's redo from A to B leaves A's
  approval alone, so your next ⌘Z back to A is approved too. But when an agent's undo takes B back to
  A, A comes back as a draft. Undo history starts empty each time a board is opened.
- Approve now approves the board the export window showed you. If the board, the page it shows or
  its approval differs now from what the window shows, the window says so, and the first press of
  Approve now shows you the board as it is instead of approving. Switch back and they match again.

**If you work with an agent**
- On Home no board is open, so an agent's request that needs one, reading or changing the board or
  an action of the editor, is answered "no board is open". An agent you have not let edit may be
  told that first instead. Open the project first, then ask the agent; once you have let it edit, it
  can also open one itself from Home. The actions on a project card or a workspace, such as deleting
  or renaming a project, are refused to an agent while a board is open. A project's Files still
  open from its card on Home; asking for the open board's Files there is told that no board is open.
- A reference picture from the archive, a picture for a collection, or a design system being
  imported (a DESIGN.md, a graph or a bundled reference) that is still arriving when you switch
  boards is not put on the board you switched to. It is cancelled, and the app says so.

**What to check**
- Open the boards you worked on with an agent connected and look at the Approved or Draft mark once
  more. If a board says Approved and you do not remember approving it as it is now, review it and
  approve it again yourself.

## Known limits

- This update does not go back over approvals made before it. It cannot tell which of them an agent
  made, so they keep the mark they have; that is why the check above is worth the minute.
- A tool that works the screen itself, such as computer use or an accessibility tool, presses buttons
  the way your hand does. The app cannot tell those presses from yours.
- A project file saved from a board's Files and imported again can open as a draft, as it could
  before this update. Approve it again.
- When you import a design-system graph, some of the colours carried with the project may not be
  kept; the message after the import says how many.
- An Aphrodite older than v0.1.6 has no updater and must be replaced from the disk image once.

## Download

Apple Silicon and Intel builds are attached below, signed, notarized and stapled. The app updates
itself from here on.
