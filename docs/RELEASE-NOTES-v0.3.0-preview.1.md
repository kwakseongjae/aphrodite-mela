# Aphrodite 0.3.0-preview.1

## What’s new

Ask Claude Code or Codex to put an HTML page, pictures or video on a board. Each design change records who made it and why. The app includes its MCP server, so your client can connect without installing Node.

Send the board as one file with the `aph` extension, or export a page as one HTML file. The workbench has light and dark themes. Aphrodite Preview installs beside Aphrodite and opens its own library. Use a board file to carry work between installations that support it.

## Download

[PLACEHOLDER — preview download page link]

## Connect

Drag Aphrodite Preview to Applications, open it, then run the line for your client.

**Claude Code**

```sh
claude mcp add --transport stdio --scope user aphrodite -- '/Applications/Aphrodite Preview.app/Contents/MacOS/aphrodite-mcp'
```

**Codex**

```sh
codex mcp add aphrodite -- '/Applications/Aphrodite Preview.app/Contents/MacOS/aphrodite-mcp'
```

Both installations use the name `aphrodite` in the client. If Claude Code already has that user entry, run `claude mcp remove --scope user aphrodite` before adding Preview. Restart the client, open a board in Preview and ask the agent to connect. The edit request shows the name the client supplied. Choose Allow there when you want it to edit.

## Still to come

Editing inside an HTML page by hand, chat inside the app, sharing by link and the new workspace are still in development.

## Known limits

- A Mac whose WebKit cannot enforce the page’s network restrictions shows a placeholder and declines a render. On older WebKit, a page’s own dark-mode rules can follow the window. Exported HTML can follow the recipient’s theme.
- Each board-media file can use up to 500 MiB. There is no total media cap or cleanup button. Unused media stays on disk. An interrupted session can leave pending indicators, files or lock files behind.
- On a slow disk, leaving can time out after ten seconds. Let the save finish and try again. If the app fails to reopen after an update, open it from Applications.
- A change sent without `base_revision` skips the stale-revision check. Near the history limit, a cleared approval can lack a visible record. The app cannot distinguish a click from OS-level automation from a person’s click.
- Reordering a hidden starter page keeps it hidden. It counts toward the 30-page limit. For a section handoff ZIP, start with the file named in its README. The root `index.html` can be the blank starter. A link inside Preview can open a hidden page separately. If the last section page disappears while Archive loads a poster, its analysis window can still open.
