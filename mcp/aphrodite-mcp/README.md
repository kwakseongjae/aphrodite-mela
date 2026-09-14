# Aphrodite MCP server

Lets an agent read and change an Aphrodite design through [MCP](https://modelcontextprotocol.io). It is a thin adapter over the app's loopback channel: it finds the running app, forwards one tool call to one route, and hands the answer back. **No dependencies** — nothing to install.

## Connect it

Claude Code, from this repository (a `.mcp.json` is already here — approve it when prompted):

```sh
claude mcp list          # aphrodite · pending approval → run `claude` and approve
```

Anywhere else, or from another folder:

```sh
claude mcp add --transport stdio aphrodite -- node /path/to/aphrodite-mela/mcp/aphrodite-mcp/index.mjs
```

Codex:

```sh
codex mcp add aphrodite -- node /path/to/aphrodite-mela/mcp/aphrodite-mcp/index.mjs
codex mcp get aphrodite
```

Anything else that speaks MCP over stdio: run `node /path/to/mcp/aphrodite-mcp/index.mjs`. The working directory does not matter.

An agent with only a shell needs none of this — the channel is plain HTTP:

```sh
E=$(cat ~/Library/Application\ Support/studio.aphrodite.mela/agent-endpoint.json)
BASE=$(echo "$E" | python3 -c 'import json,sys;print(json.load(sys.stdin)["base"])')
TOKEN=$(echo "$E" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -s "$BASE/agent/guide" -H "Authorization: Bearer $TOKEN" -H 'X-Aphrodite-Agent: codex'
```

Open Aphrodite first: the server reads `~/Library/Application Support/studio.aphrodite.mela/agent-endpoint.json` to find it. Port and token change every launch, so nothing is stored here.

## The tools

| Tool | Reads / writes | For |
|---|---|---|
| `aphrodite_guide` | read | How to work with Aphrodite, and what is true right now — **start here** |
| `aphrodite_request_connection` | asks | Ask the person to let you edit; they answer with one click |
| `aphrodite_get_contract` | read | Pages, frames, components, the design system, and what the person has selected |
| `aphrodite_get_tokens` | read | The CSS variables the page is painted with |
| `aphrodite_list_components` | read | The kinds and variants available to add |
| `aphrodite_list_images` | read | The local picture library |
| `aphrodite_apply_edits` | write | Add, update, move, delete components — a whole change in one call |
| `aphrodite_add_image` | write | Put a picture in the library |
| `aphrodite_delete_image` | write, destructive | Remove one |

## What it will not do

- **Approve a direction.** That is the person's decision and no tool here can make it.
- **Let itself in.** Reading is always open; editing needs the person to open the door. An agent may *ask* — `aphrodite_request_connection` puts a line at the top of their app with the agent's name on it, and they allow or decline with one click — but nothing here can open it unasked. One request stands at a time and a decline holds for a few minutes, so a prompt cannot become a nag.
- **Decide anything.** Permission is the app's judgement (`src/agent/authority.ts`), so the same request made with `curl` meets the same answer. Nothing here can be relaxed by a client.

## Checking it

```sh
node scripts/verify-mcp.mjs     # protocol, tool manifest, and a live call if the app is open
```
