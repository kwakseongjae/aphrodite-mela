# Connect an agent to Aphrodite

The Mac app includes a small MCP server named `aphrodite-mcp`. A client launches it over standard input and output. With Aphrodite in Applications, its command is `/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp`. The connection engine uses the running app’s actual path. In development it uses the sidecar beside the development executable.

The server runs without Node. It reads Aphrodite’s local endpoint file on each call and passes the request to the running app. With the app closed, the guide still explains how to work with Aphrodite. Open the app to read or change a board. Permission to edit and approval of a direction belong to the person in Aphrodite. Registering the server grants neither.

## Where the entry goes

These are the user-level locations on macOS. The documentation was checked on November 26, 2026. The engine is available to the desktop application. Its settings screen is a separate change.

| Client | Configuration | What the engine supplies |
| --- | --- | --- |
| Claude Code | `~/.claude.json`, user scope | A command to copy. Claude Code maintains this file and documents the CLI for user registration. [MCP scopes](https://code.claude.com/docs/en/mcp#user-scope) · [Settings files](https://code.claude.com/docs/en/settings) |
| Codex | `~/.codex/config.toml` (or `config.toml` under `CODEX_HOME` within your home) | A TOML table named `mcp_servers.aphrodite` with a `command` string. Codex documents direct editing. [Codex MCP configuration](https://developers.openai.com/codex/mcp/) |
| Cursor | `~/.cursor/mcp.json` | A JSON property named `mcpServers.aphrodite` with `type` set to `stdio` and the executable as `command`. Cursor documents creating the global file. [Cursor MCP configuration](https://cursor.com/docs/mcp) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | A JSON property named `mcpServers.aphrodite` with the executable as `command`. The local-server guide documents this file. Fully quit and reopen Claude Desktop after editing it. [Local server setup](https://modelcontextprotocol.io/docs/develop/connect-local-servers) · [Manual file creation](https://py.sdk.modelcontextprotocol.io/get-started/real-host/) |

For Claude Code, the person can run this command for the usual installation path. Aphrodite itself never runs `claude` or `codex`, opens a provider credential store, or signs in to either service.

```sh
claude mcp add --transport stdio --scope user aphrodite -- '/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp'
```

## What changes on disk

A preview shows the file, the exact text to insert or replace, and the backup path. Applying it checks the fingerprint again. An existing foreign entry requires a separate replacement confirmation. Before changing an existing file, the engine saves its original bytes beside it as `<filename>.aphrodite-<timestamp>.bak`. It writes the edited text through a temporary file in the same directory and preserves the original mode. A new configuration starts private. Configurations containing literal provider credentials in recognized key fields are left untouched.

A macOS extended attribute on the edited file records which entry Aphrodite wrote and which backup contains the original bytes. If another editor drops that attribute or changes the entry, Aphrodite treats the entry as someone else’s. When the app is running from a disk image or macOS App Translocation, move it to Applications and reopen it before connecting.

## Undo by hand

For Codex, remove the `[mcp_servers.aphrodite]` table and its fields. For Cursor or Claude Desktop, remove the `aphrodite` property inside `mcpServers` and adjust its adjacent comma. Leave any other servers in place. If you replaced a previous definition, copy that entry back from the timestamped backup. Restore the entire backup only if you also want to undo every later edit to the file.

For Claude Code, the person can run `claude mcp remove --scope user aphrodite`. Restart the client so it picks up the change.
