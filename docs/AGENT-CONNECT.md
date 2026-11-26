# Connect an agent to Aphrodite

The Mac app includes a small MCP server named `aphrodite-mcp`. A client launches it over standard input and output. With Aphrodite in Applications, its command is `/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp`. The connection engine uses the running app’s actual path. In development it uses the sidecar beside the development executable.

The server runs without Node. It reads Aphrodite’s local endpoint file on each call and passes the request to the running app. With the app closed, the guide still explains how to work with Aphrodite. Open the app to read or change a board. Permission to edit and approval of a direction belong to the person in Aphrodite. Registering the server grants neither.

## Where the entry goes

These are the user-level locations on macOS. The documentation was checked on November 26, 2026. The engine is available to the desktop application. Its settings screen is a separate change.

| Client | Configuration | What the engine supplies |
| --- | --- | --- |
| Claude Code | `~/.claude.json`, user scope | A command to copy. Claude Code maintains this file and documents the CLI for user registration. [MCP scopes](https://code.claude.com/docs/en/mcp#user-scope) · [Settings files](https://code.claude.com/docs/en/settings) |
| Codex | `~/.codex/config.toml` (or `config.toml` under `CODEX_HOME` within your home) | A TOML table named `mcp_servers.aphrodite` with a `command` string. Codex documents direct editing. [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) |
| Cursor | `~/.cursor/mcp.json` | A JSON property named `mcpServers.aphrodite` with `type` set to `stdio` and the executable as `command`. Cursor documents creating the global file. [Cursor MCP configuration](https://cursor.com/docs/mcp) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | A JSON property named `mcpServers.aphrodite` with the executable as `command`. The local-server guide documents this file. Fully quit and reopen Claude Desktop after editing it. [Local server setup](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers) · [Manual file creation](https://py.sdk.modelcontextprotocol.io/get-started/real-host/) |

For Claude Code, the person can run this command for the usual installation path. Aphrodite itself never runs `claude` or `codex`, opens a provider credential store, or signs in to either service.

```sh
claude mcp add --transport stdio --scope user aphrodite -- '/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp'
```

## What changes on disk

For Claude Code, Aphrodite checks for the CLI and supplies the registration command. It never opens `~/.claude.json`. For the other clients, Rust reads the configuration locally. The preview contains the path, insertion line, generated text, and flags for creation and foreign-entry replacement. Other configuration text stays in Rust and is never logged or sent to the screen or an agent.

On first connect to an existing file, Aphrodite makes one private (mode 0600) byte copy of your own file alongside it, including any settings or keys you put there. Its name is `<filename>.aphrodite-<timestamp>.bak`. You can keep or delete it. Aphrodite never reads it. Changing the executable path keeps the first backup. Removing an entry deletes the backup when the file is back to its original bytes.

A file attribute records the exact spelling and value of the entry, the executable path and the original file digest. A directory attribute remembers the digest and generated delimiters so an editor can replace the file and you can still undo the insertion. Only the file attribute and matching entry bytes establish ownership. A replacement of someone else’s entry requires your confirmation of the current preview. Removal after a lost receipt also needs confirmation and a command pointing to this installation. Remove other foreign entries by hand. If Aphrodite replaced a previous definition, its original text remains in your backup.

The engine uses the client’s existing configuration directory. It preserves the file’s mode, ACL and other extended attributes and checks the displaced file after an atomic exchange. If an editor saves again during conflict recovery, its live file takes precedence. An additional displaced version can remain beside it as a hidden `.aphrodite-*.recovery` file. It offers a snippet if the directory is missing, the format cannot be safely edited, or the filesystem lacks extended attributes. Move Aphrodite to Applications and reopen it when running from a disk image, a read-only mount or App Translocation.

The two stdio adapters run up to 32 tool calls at once and hold 64 more in arrival order. A further call receives a queue-full reply. The limits are 24 MiB per input frame or HTTP response and 64 KiB for the endpoint file. Requests allow 96 nested JSON containers and 262,144 structural tokens (opening containers, commas and colons). Responses deeper than 96 containers or wider than 393,216 structural tokens return their validated JSON text directly. A 12 MiB library image takes 16 MiB as base64. CR, LF and CRLF delimit frames. A leading UTF-8 BOM is accepted. Invalid UTF-8 and unpaired surrogate escapes receive a parse error, and the next frame is still processed.

## Undo by hand

For Codex, remove the `[mcp_servers.aphrodite]` table and its fields. For Cursor or Claude Desktop, remove the `aphrodite` property inside `mcpServers` and adjust its adjacent comma. Leave any other servers in place. If you replaced a previous definition, copy that entry back from the timestamped backup. Restore the entire backup only if you also want to undo every later edit to the file.

For Claude Code, the person can run `claude mcp remove --scope user aphrodite`. Restart the client so it picks up the change.
