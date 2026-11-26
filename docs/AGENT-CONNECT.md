# Connect an agent to Aphrodite

The Mac app includes a small MCP server named `aphrodite-mcp`. A client launches it over standard input and output. With Aphrodite in Applications, its command is `/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp`. The connection engine uses the running app’s actual path. In development it uses the sidecar beside the development executable.

The server runs without Node. It reads Aphrodite’s local endpoint file on each call and passes the request to the running app. With the app closed, the guide still explains how to work with Aphrodite. Open the app to read or change a board. Permission to edit and approval of a direction belong to the person in Aphrodite. Registering the server grants neither.

## Where the entry goes

These are the user-level locations on macOS. The documentation was checked on November 26, 2026. The engine is available to the desktop application. Its settings screen is a separate change.

| Client | Configuration | What the engine supplies |
| --- | --- | --- |
| Claude Code | `~/.claude.json`, user scope | A preview of the CLI commands. The person can authorize the engine to run them or copy the add command. Claude Code maintains its own file. [MCP scopes](https://code.claude.com/docs/en/mcp#user-scope) · [Settings files](https://code.claude.com/docs/en/settings) |
| Codex | `~/.codex/config.toml` (or `config.toml` under `CODEX_HOME` within your home) | A TOML table named `mcp_servers.aphrodite` with a `command` string. Codex documents direct editing. [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) |
| Cursor | `~/.cursor/mcp.json` | A JSON property named `mcpServers.aphrodite` with `type` set to `stdio` and the executable as `command`. Cursor documents creating the global file. [Cursor MCP configuration](https://cursor.com/docs/mcp) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | A JSON property named `mcpServers.aphrodite` with the executable as `command`. The local-server guide documents this file. Fully quit and reopen Claude Desktop after editing it. [Local server setup](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers) · [Manual file creation](https://py.sdk.modelcontextprotocol.io/get-started/real-host/) |

## Claude Code

For status and preview, Aphrodite runs `claude mcp get aphrodite`. Claude Code can health-check that one server. Aphrodite reads the user-scope definition from the reply. Exit 1 with the named missing-server diagnostic means the entry is absent. An unexpected reply, a different scope or a failed lookup leaves its status unknown. Other servers’ names, diagnostics and configuration values stay in Rust. [Managing MCP servers](https://code.claude.com/docs/en/mcp#managing-your-servers)

Finder can launch an app without the shell’s PATH. Aphrodite checks absolute PATH directories in order, then `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.claude/local`, `~/.npm-global/bin`, `~/.volta/bin`, `~/.local/share/fnm/aliases/default/bin` and `~/Library/Application Support/fnm/aliases/default/bin`. An executable file or a symlink to one qualifies. The preview includes the selected program’s absolute path and each argument, plus a shell-quoted line for each command.

For a new connection the person sees the add command before authorizing it. For the usual installation its terminal equivalent is

```sh
claude mcp add --transport stdio --scope user aphrodite -- '/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp'
```

Aphrodite rechecks the preview when the person presses connect or remove. It starts the program directly in a fresh private directory outside the project. The child receives the home directory, a short executable search path, fixed output-format settings and the selected `CLAUDE_CONFIG_DIR` if set. Each invocation has ten seconds and a 64 KiB limit on each output stream. The result carries a code and the exit status when available. A successful response can also include one exact acknowledgment of the displayed command, up to 256 bytes. Aphrodite never opens `~/.claude.json` or handles provider tokens.

Aphrodite considers a user-scope entry its own when Claude Code reports plain stdio, an empty argument list, no additional settings, and a command equal to this installation’s sidecar or the last sidecar Aphrodite registered for that CLI profile. A home-directory extended attribute stores that path. Its name starts with `studio.aphrodite.mela.claude-user.` followed by a digest of the profile’s configuration path. Successful removal clears it. If updating that record fails after a successful CLI command, the result is `record_failed` with exit status 0. Refresh status to see the registration.

A moved app previews `claude mcp remove --scope user aphrodite`, the new add command, and the old add command it will use for recovery. If adding fails after removal, `repoint_restored` means the old registration was restored. `repoint_restore_failed` includes the recovery attempt’s result. A customized entry needs separate confirmation to replace. Removing it through the engine also requires its command to point to this installation. Claude Code can redact or flatten settings in its text output, so Aphrodite keeps no restorable copy of a foreign definition. If its removal succeeds and the new add fails, the result is `foreign_removed_add_failed`.

Aphrodite serializes its own writes and rejects a changed preview. Claude Code’s CLI offers separate get, remove and add operations. A simultaneous edit in another program can still fall between them.

## What changes on disk

For the other clients, Rust reads the configuration locally. The preview contains the path, insertion line, generated text, and flags for creation and foreign-entry replacement. Other configuration text stays in Rust and is never logged or sent to the screen or an agent.

On first connect to an existing file, Aphrodite makes a private (mode 0600) byte copy of your own file alongside it, including any settings or keys you put there. Its name is `<filename>.aphrodite-<timestamp>.bak`. You can keep or delete it. Aphrodite never reads it. Each confirmed replacement of an entry Aphrodite cannot identify as its own creates another backup with a fresh timestamp. Re-pointing an owned entry keeps its existing backup. Removing an entry deletes the backup when the file is back to its original bytes. If you edit the file between connecting and removing, its backup stays and reconnecting makes a new one.

A file attribute records the exact spelling and value of the entry, the executable path and the original file digest. A directory attribute remembers the original digest across an editor’s save. On confirmed removal, Aphrodite checks the undo against its own insertion code. It clears the directory attribute on removal and deletes an app-created file only when its entire content still matches what Aphrodite generates for a new file. Only the file attribute and matching entry bytes establish ownership. A replacement of someone else’s entry requires your confirmation of the current preview. Removal after a lost receipt also needs confirmation and a command pointing to this installation. Remove other foreign entries by hand. If Aphrodite replaced a previous definition, its original text remains in your backup.

Status reports whether it detected the client app or command-line tool. It reports a missing configuration directory separately. The engine uses the client’s existing configuration directory. The edited file gets a fresh modification time. Aphrodite carries over ownership, mode, flags, ACL and extended attributes, excluding macOS provenance and quarantine tags. It checks the displaced file after an atomic exchange. If an editor saves again during conflict recovery, its live file takes precedence. An additional displaced version can remain beside it as a hidden `.aphrodite-*.recovery` file. It offers a snippet if the directory is missing, the format cannot be safely edited, or the filesystem lacks extended attributes. Move Aphrodite to Applications and reopen it when running from a disk image, a read-only mount or App Translocation. The boot and data volumes need no disk-image lookup. On another writable mount, an unavailable disk-image inventory also requires moving the app. Copying a snippet skips this lookup.

The two stdio adapters run up to 32 tool calls at once and hold 64 more in arrival order. A further call receives a queue-full reply. The limits are 24 MiB per input frame or HTTP response and 64 KiB for the endpoint file. Requests allow 96 nested JSON containers and 262,144 structural tokens (opening containers, commas and colons). Successful responses deeper than 96 containers or wider than 393,216 structural tokens return their original JSON text after validation. Both response paths reject malformed JSON, numbers that overflow to infinity and unpaired surrogates. HTTP errors such as 403 return the app’s refusal text or a sentence with the HTTP status. Redirects use the offline reply. A 12 MiB library image takes 16 MiB as base64. CR, LF and CRLF delimit frames. A leading UTF-8 BOM is accepted. Invalid UTF-8 and unpaired surrogate escapes receive a parse error, and the next frame is still processed.

## Undo by hand

For Codex, remove the `[mcp_servers.aphrodite]` table and its fields. For Cursor or Claude Desktop, remove the `aphrodite` property inside `mcpServers` and adjust its adjacent comma. Leave any other servers in place. If you replaced a previous definition, copy that entry back from the timestamped backup. Restore the entire backup only if you also want to undo every later edit to the file.

For Claude Code, run `claude mcp remove --scope user aphrodite` to undo registration. Run `claude mcp get aphrodite` to check the result. To undo a re-point by hand, remove the new entry and run the old add command from the preview. To restore a replaced foreign entry, use its original registration instructions. Restart the client so it picks up the change.
