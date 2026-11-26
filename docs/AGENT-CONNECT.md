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

Opening status (`connect_status`) looks for the program and reads any unfinished re-point from Aphrodite’s own record. An explicit lookup (`connect_ask`) runs `claude mcp get aphrodite`. Claude Code can health-check the named server by starting its command or contacting its URL. Preview also runs this lookup. After checking the previewed program’s identity, both `connect_apply` and `connect_remove` run `get` again before acting. An unexpected reply or scope leaves the registration unknown. Other servers’ names and raw CLI output stay in Rust. [Managing MCP servers](https://code.claude.com/docs/en/mcp#managing-your-servers)

A Finder-launched app does not see shell variables from your shell startup files. Aphrodite searches absolute directories from its own PATH in order, then `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.claude/local`, `~/.npm-global/bin`, `~/.volta/bin`, `~/.local/share/fnm/aliases/default/bin` and `~/Library/Application Support/fnm/aliases/default/bin`. It resolves symlinks and reports the first executable it finds. The resolved file and its ancestors must belong to you or root, with group and other write access disabled. A preview identifies the resolved program by path, device, inode, size and modification time. A changed program requires a new preview.

The preview and copyable snippets use the resolved program. When it cannot be found, the manual commands use `claude` from your terminal. With the default profile, the fallback setup for an app in Applications is

```sh
claude mcp add --transport stdio --scope user aphrodite -- /Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp
```

If Aphrodite inherited `CLAUDE_CONFIG_DIR`, every generated command includes that setting. For example, the same fallback for a named profile is

```sh
CLAUDE_CONFIG_DIR='/Users/ada/Claude Work' claude mcp add --transport stdio --scope user aphrodite -- /Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp
```

With a default-profile line, use a terminal where `CLAUDE_CONFIG_DIR` is unset to act on the same profile. The app starts the absolute program directly, with a fresh mode-0700 working directory inside Darwin’s per-user temporary folder. It checks the ancestors for shared write access and project markers. Each invocation has ten seconds and 64 KiB per output stream. The child gets the home directory, a restricted PATH, output-format settings, and the selected profile. A successful result can include the exact add or remove acknowledgment, up to 256 bytes. Aphrodite never opens Claude Code’s settings file or passes provider tokens to the process.

Aphrodite owns a recognized user-scope stdio entry when its reported command exactly matches the current sidecar or the last sidecar Aphrodite registered for that profile, with empty arguments and no environment values. Claude Code 2.1.327 prints a bare `Environment:` for an empty environment. Aphrodite stores its own record in a mode-0600 file under `~/Library/Application Support/studio.aphrodite.mela/connect/`, keyed by profile. It publishes the record by atomic rename under a bounded lock. Observing absence clears the previous ownership claim. If registration succeeds but the record cannot be saved, `registered_record_missing` tells the screen to show the registration and offer another connect press to repair the record.

A re-point previews removal, the new add, and the old add that can restore the entry. Before removal, Aphrodite saves both paths. Close and restart wait for accepted changes. After a failed command, including a timeout or oversized output, Aphrodite asks Claude Code again. The result’s `observed` fields report the current entry, or the lookup error if it could not be established. Recovery adds the old entry only after observing absence. On the next launch, `unfinishedRepoint` offers a fresh preview and a person-authorized finish. A concurrent edit can still fall between Claude Code’s separate get, remove and add commands.

Replacing a customized entry needs confirmation. The preview flags that the old definition cannot be restored because CLI text can omit or flatten settings. Removing a foreign entry also requires its reported command to match this sidecar. Keep the original registration instructions if you choose to replace it.

## What changes on disk

For the other clients, Rust reads the configuration locally. It refuses a path resolving to Claude Code’s settings or a configuration with multiple hard links. The preview contains the path, insertion line, generated text, and flags for creation and foreign-entry replacement. Other configuration text stays in Rust and is never logged or sent to the screen or an agent.

On first connect to an existing file, Aphrodite makes a private (mode 0600) byte copy of your own file alongside it, including any settings or keys you put there. Its name is `<filename>.aphrodite-<timestamp>.bak`. You can keep or delete it. Aphrodite never reads it. Each confirmed replacement of an entry Aphrodite cannot identify as its own creates another backup with a fresh timestamp. Re-pointing an owned entry keeps its existing backup. Removing an entry deletes the backup when the file is back to its original bytes. If you edit the file between connecting and removing, its backup stays and reconnecting makes a new one.

A file attribute records the exact spelling and value of the entry, the executable path and the original file digest. A directory attribute remembers the original digest across an editor’s save. On confirmed removal, Aphrodite checks the undo against its own insertion code. It clears the directory attribute on removal and deletes an app-created file only when its entire content still matches what Aphrodite generates for a new file. Only the file attribute and matching entry bytes establish ownership. A replacement of someone else’s entry requires your confirmation of the current preview. Removal after a lost receipt also needs confirmation and a command pointing to this installation. Remove other foreign entries by hand. If Aphrodite replaced a previous definition, its original text remains in your backup.

Status reports whether it detected the client app or command-line tool. It reports a missing configuration directory separately. The engine uses the client’s existing configuration directory. The edited file gets a fresh modification time. Aphrodite carries over ownership, mode, flags, ACL and extended attributes, excluding macOS provenance and quarantine tags. It checks the displaced file after an atomic exchange. If an editor saves again during conflict recovery, its live file takes precedence. An additional displaced version can remain beside it as a hidden `.aphrodite-*.recovery` file. It offers a snippet if the directory is missing, the format cannot be safely edited, or the filesystem lacks extended attributes. Move Aphrodite to Applications and reopen it when running from a disk image, a read-only mount or App Translocation. The boot and data volumes need no disk-image lookup. On another writable mount, an unavailable disk-image inventory also requires moving the app. Copying a snippet skips this lookup.

The two stdio adapters run up to 32 tool calls at once and hold 64 more in arrival order. A further call receives a queue-full reply. The limits are 24 MiB per input frame or HTTP response and 64 KiB for the endpoint file. Requests allow 96 nested JSON containers and 262,144 structural tokens (opening containers, commas and colons). Successful responses deeper than 96 containers or wider than 393,216 structural tokens return their original JSON text after validation. Both response paths reject malformed JSON, numbers that overflow to infinity and unpaired surrogates. HTTP errors such as 403 return the app’s refusal text or a sentence with the HTTP status. Redirects use the offline reply. A 12 MiB library image takes 16 MiB as base64. CR, LF and CRLF delimit frames. A leading UTF-8 BOM is accepted. Invalid UTF-8 and unpaired surrogate escapes receive a parse error, and the next frame is still processed.

## Undo by hand

For Codex, remove the `[mcp_servers.aphrodite]` table and its fields. For Cursor or Claude Desktop, remove the `aphrodite` property inside `mcpServers` and adjust its adjacent comma. Leave any other servers in place. If you replaced a previous definition, copy that entry back from the timestamped backup. Restore the entire backup only if you also want to undo every later edit to the file.

For Claude Code, copy the remove snippet (`connect_snippet` with action `remove`) for your installation and profile. The default-profile fallback is

```sh
claude mcp remove --scope user aphrodite
```

The corresponding fallback for the named profile above is

```sh
CLAUDE_CONFIG_DIR='/Users/ada/Claude Work' claude mcp remove --scope user aphrodite
```

Use the explicit lookup to check the result. To undo a re-point by hand, remove the new entry and run the old add command from the preview. To restore a replaced foreign entry, use its original registration instructions. Restart the client so it picks up the change.
