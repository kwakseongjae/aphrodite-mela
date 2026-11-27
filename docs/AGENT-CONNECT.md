# Connect an agent to Aphrodite

The Mac app includes a small MCP server named `aphrodite-mcp`. A client launches it over standard input and output. With Aphrodite in Applications, its command is `/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp`. The connection engine uses the running app’s actual path. In development it uses the sidecar beside the development executable.

The server runs without Node. It reads Aphrodite’s local endpoint file on each call and passes the request to the running app. With the app closed, the guide still explains how to work with Aphrodite. Open the app to read or change a board. Permission to edit and approval of a direction belong to the person in Aphrodite. Registering the server grants neither.

## Connecting to Preview

Stable and Aphrodite Preview share the client entry named `aphrodite`. A Claude profile can point that entry at one installation at a time. When Stable has registered it, asking from Preview reports it as present with `pointsHere: false` and `owned: false`. Connect shows the exact user-scope remove and add commands. On confirmation, Preview runs them and records its sidecar in its own journal. To switch back, confirm the reverse operation in Stable. Either app can offer a confirmed removal when the plain stdio command exactly matches the other app’s recorded path for this profile.

For manual setup, install Aphrodite Preview in Applications and choose the line for your client. The Claude example selects the default profile. If the name is already registered, use the remove snippet for the same profile before adding Preview.

```sh
/usr/bin/env -u CLAUDE_CODE_CUSTOM_OAUTH_URL -u CLAUDE_CONFIG_DIR claude mcp add --transport stdio --scope user aphrodite -- '/Applications/Aphrodite Preview.app/Contents/MacOS/aphrodite-mcp'
codex mcp add aphrodite -- '/Applications/Aphrodite Preview.app/Contents/MacOS/aphrodite-mcp'
```

The copied line quotes the space in `Aphrodite Preview.app`. The engine passes the entire path as one argument. Claude Code 2.1.327 displays the path unquoted on its `Command:` line. Restart the client after switching, open the board in Preview, and allow the client’s request to edit there.

The source Node adapter defaults to stable. To target Preview, launch it with `APHRODITE_ENDPOINT_FILE="$HOME/Library/Application Support/studio.aphrodite.mela.preview/agent-endpoint.json"`. The explicit file also takes precedence in either bundled executable. A running preview advertises its version in this file.

## Where the entry goes

These are the user-level locations on macOS. The documentation was checked on November 26, 2026. The engine is available to the desktop application. Its settings screen is a separate change.

| Client | Configuration | What the engine supplies |
| --- | --- | --- |
| Claude Code | `~/.claude.json`, user scope | A preview of the CLI commands. The person can authorize the engine to run them or copy the add command. Claude Code maintains its own file. [MCP scopes](https://code.claude.com/docs/en/mcp#user-scope) · [Settings files](https://code.claude.com/docs/en/settings) |
| Codex | `~/.codex/config.toml` (or `config.toml` under `CODEX_HOME` within your home) | A TOML table named `mcp_servers.aphrodite` with a `command` string. Codex documents direct editing. [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) |
| Cursor | `~/.cursor/mcp.json` | A JSON property named `mcpServers.aphrodite` with `type` set to `stdio` and the executable as `command`. Cursor documents creating the global file. [Cursor MCP configuration](https://cursor.com/docs/mcp) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | A JSON property named `mcpServers.aphrodite` with the executable as `command`. The local-server guide documents this file. Fully quit and reopen Claude Desktop after editing it. [Local server setup](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers) · [Manual file creation](https://py.sdk.modelcontextprotocol.io/get-started/real-host/) |

## Claude Code

Opening status (`connect_status`) finds the CLI and reads Aphrodite’s recovery journal without launching a program. On the person’s press, `connect_ask` or `connect_preview` runs `claude mcp get aphrodite`. Claude Code can health-check the named server by starting its command or contacting its URL. `connect_apply` and `connect_remove` check the previewed CLI identity and ask again before acting. Exit 0 with a first stdout line of `aphrodite:` means the entry exists. Exit 1 with stderr beginning `No MCP server named "aphrodite".` means it is absent. Other replies leave the entry unknown. The screen receives flags and codes. The diagnostic’s list of other servers stays in Rust. [Managing MCP servers](https://code.claude.com/docs/en/mcp#managing-your-servers)

A Finder-launched app does not see shell variables from your shell startup files. Aphrodite searches absolute directories from its own PATH in order, then `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.claude/local`, `~/.npm-global/bin`, `~/.volta/bin`, `~/.local/share/fnm/aliases/default/bin` and `~/Library/Application Support/fnm/aliases/default/bin`. It reports the first executable it finds. Every directory along the link chain, the resolved file and their ancestors must belong to you or root and exclude write access by other accounts. The preview binds the resolved path, device, inode, size, modification time and interpreter selection.

Aphrodite keeps the verified files open through launch, passes an argument vector and starts a wrapper through its verified interpreter. On volumes supporting macOS file IDs, it launches the native program by its file ID. On 2026-11-27, native arm64 Claude Code 2.1.327 launched this way with a clean environment on macOS. Looking up a missing name exited 1 with empty stdout and one stderr line beginning with the missing-name sentence. Looking up the registered `aphrodite` exited 0 with empty stderr. Elsewhere a native program can be replaced between the last pathname check and launch. A wrapper receives its script by file ID or inherited descriptor. Wrappers that locate siblings through their own script path are unsupported. In-place edits by the file owner can still race launch.

The preview and snippets use the resolved program when trusted. If discovery finds an untrusted executable, status reports it as unavailable with the reason `cli_untrusted`. Both this case and a missing executable offer a manual line using `claude` from your terminal. With the default profile, the fallback setup for an app in Applications is

```sh
/usr/bin/env -u CLAUDE_CODE_CUSTOM_OAUTH_URL -u CLAUDE_CONFIG_DIR claude mcp add --transport stdio --scope user aphrodite -- /Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp
```

If Aphrodite inherited `CLAUDE_CONFIG_DIR`, every generated command includes that setting. For example, the same fallback for a named profile is

```sh
CLAUDE_CONFIG_DIR='/Users/ada/Claude Work' /usr/bin/env -u CLAUDE_CODE_CUSTOM_OAUTH_URL claude mcp add --transport stdio --scope user aphrodite -- /Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp
```

The copied line clears the terminal’s custom OAuth selector. The default-profile line also clears the terminal’s configuration directory. The app starts the absolute program directly, with a fresh mode-0700 working directory inside Darwin’s per-user temporary folder. It checks the ancestors for shared write access and project markers. Each invocation has ten seconds and 64 KiB per output stream. The child gets the home directory, a restricted PATH, output-format settings, and the profile exactly as you spelled it in `CLAUDE_CONFIG_DIR`, including any `..` components. A successful result can include the exact add or remove acknowledgment, up to 256 bytes. Aphrodite never opens Claude Code’s settings file or passes provider tokens to the process.

Claude Code’s display can wrap paths, replace control characters with spaces and show an empty argument exactly like an empty argument list. Aphrodite uses the user-scope command as a hint. An automatic removal without extra confirmation requires a plain stdio display agreeing with the exact sidecar path in Aphrodite’s registration record for the profile. If the display only suggests this installation, replacing or removing it requires confirmation of the previewed command. A foreign definition can be replaced with confirmation. Its preview flags when the previous definition cannot be restored. Remove accepts a command matching the current sidecar, the registered path, or the previous path in an unfinished re-point. If Claude reports an entry and its scope is unreadable, the preview offers the exact user-scope commands. Both Connect and Remove require confirmation in that case.

Each app keeps its own mode-0600 record and profile lock. Stable uses `~/Library/Application Support/studio.aphrodite.mela/connect/` and Preview uses `~/Library/Application Support/studio.aphrodite.mela.preview/connect/`. The lock and journal follow Claude’s textual join of the profile directory and filename. Claude collapses `..` before resolving links, so `$HOME/lnk/..` shares the default profile’s journal even when `lnk` points to `$HOME/real/sub`. Displayed lines preserve your spelling. Aphrodite publishes the record by atomic rename under a bounded lock. It ignores future fields. Any successful Connect press replaces a damaged record. Connecting an absent entry creates a fresh record without extra confirmation.

If the profile lock is damaged, Aphrodite moves it aside and installs a private lock with the old ownership claim suspended. After syncing the swap, Aphrodite unlinks the displaced name if it is a regular file or a symlink. A displaced directory stays in the `connect` folder under a name matching `.damaged-claude-lock-*`, with its contents intact. Anything else that is displaced stays too, and so does a displaced file when the repair is interrupted or the unlink fails; the repair itself still counts. The lookup or command reports the repair in `recordError`. An existing entry needs confirmation before Aphrodite can claim it again. Observing absence revokes the previous ownership claim even if receipt deletion fails. If registration succeeds and saving the record fails, the result includes `code: registered`, the CLI exit status and `recordError: registered_record_missing`.

A re-point previews removal, the new add and the old add that can restore the entry. Before removal, Aphrodite saves the previous and target paths. After a failed command, including a timeout or oversized output, it asks again. The result’s `observed` fields report the current entry or the lookup error. Recovery attempts the old add only after observing absence. On relaunch, `unfinishedRepoint` lets you preview recovery again, including the old add if rollback stopped after restoring the old path. When the entry is absent, Remove clears the journal on your press. An external edit can fall between Claude Code’s separate get, remove and add commands.

## What changes on disk

For the other clients, Rust reads the configuration locally. It refuses a configuration with multiple hard links. It also compares the file’s device and inode with Claude Code’s profile settings, including legacy `.config.json` and OAuth-specific files, before opening the file and again on the descriptor before reading. This catches two symlinks pointing to one ordinary file. Apply and remove for all four clients use the same bounded close and restart wait. The preview contains the path, insertion line, generated text, and flags for creation and foreign-entry replacement. Other configuration text stays in Rust and is never logged or sent to the screen or an agent.

On first connect to an existing file, Aphrodite makes a private (mode 0600) byte copy of your own file alongside it, including any settings or keys you put there. Its name is `<filename>.aphrodite-<timestamp>.bak`. You can keep or delete it. Aphrodite never reads it. Each confirmed replacement of an entry Aphrodite cannot identify as its own creates another backup with a fresh timestamp. Re-pointing an owned entry keeps its existing backup. Removing an entry deletes the backup when the file is back to its original bytes. If you edit the file between connecting and removing, its backup stays and reconnecting makes a new one.

Each installation uses its app identifier in the file and directory attribute names. A file attribute records the exact spelling and value of the entry, the executable path and the original file digest. A directory attribute remembers the original digest across an editor’s save. On confirmed removal, Aphrodite checks the undo against its own insertion code. It clears the directory attribute on removal and deletes an app-created file only when its entire content still matches what Aphrodite generates for a new file. Only the file attribute and matching entry bytes establish ownership. A replacement of someone else’s entry requires your confirmation of the current preview. Removal after a lost receipt also needs confirmation and a command pointing to this installation. Remove other foreign entries by hand. If Aphrodite replaced a previous definition, its original text remains in your backup.

Status reports whether it detected the client app or command-line tool. It reports a missing configuration directory separately. The engine uses the client’s existing configuration directory. The edited file gets a fresh modification time. Aphrodite carries over ownership, mode, flags, ACL and extended attributes, excluding macOS provenance and quarantine tags. It checks the displaced file after an atomic exchange. If an editor saves again during conflict recovery, its live file takes precedence. An additional displaced version can remain beside it as a hidden `.aphrodite-*.recovery` file. It offers a snippet if the directory is missing, the format cannot be safely edited, or the filesystem lacks extended attributes. Move Aphrodite to Applications and reopen it when running from a disk image, a read-only mount or App Translocation. Passive status uses mount flags and the system’s disk description for external volumes. An unrecognized device reports an unknown location. The boot and data volumes need no image inventory. On other writable mounts, preview and mutation consult the disk-image inventory and refuse if it is unavailable. File snippets need only the sidecar path.

The two stdio adapters run up to 32 tool calls at once and hold 64 more in arrival order. A further call receives a queue-full reply. The limits are 24 MiB per input frame or HTTP response and 64 KiB for the endpoint file. Requests allow 96 nested JSON containers and 262,144 structural tokens (opening containers, commas and colons). Successful responses deeper than 96 containers or wider than 393,216 structural tokens return their original JSON text after validation. Both response paths reject malformed JSON, numbers that overflow to infinity and unpaired surrogates. HTTP errors such as 403 return the app’s refusal text or a sentence with the HTTP status. Redirects use the offline reply. A 12 MiB library image takes 16 MiB as base64. CR, LF and CRLF delimit frames. A leading UTF-8 BOM is accepted. Invalid UTF-8 and unpaired surrogate escapes receive a parse error, and the next frame is still processed.

## Undo by hand

For Codex, remove the `[mcp_servers.aphrodite]` table and its fields. For Cursor or Claude Desktop, remove the `aphrodite` property inside `mcpServers` and adjust its adjacent comma. Leave any other servers in place. If you replaced a previous definition, copy that entry back from the timestamped backup. Restore the entire backup only if you also want to undo every later edit to the file.

For Claude Code, copy the remove snippet (`connect_snippet` with action `remove`) for your installation and profile. The default-profile fallback is

```sh
/usr/bin/env -u CLAUDE_CODE_CUSTOM_OAUTH_URL -u CLAUDE_CONFIG_DIR claude mcp remove --scope user aphrodite
```

The corresponding fallback for the named profile above is

```sh
CLAUDE_CONFIG_DIR='/Users/ada/Claude Work' /usr/bin/env -u CLAUDE_CODE_CUSTOM_OAUTH_URL claude mcp remove --scope user aphrodite
```

Use the explicit lookup to check the result. To undo a re-point by hand, remove the new entry and run the old add command from the preview. To restore a replaced foreign entry, use its original registration instructions. Restart the client so it picks up the change.
