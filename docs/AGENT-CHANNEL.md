# Agent channel (Agent mode, v0.1.5+)

When a human starts **Agent mode** (dock → Agent, or key `3`), the app locks itself for people and opens a channel for the agent:

- A golden shield covers the window and a one-line banner sits on top. Every OS-originated event (mouse, keyboard, wheel, paste, drag) is dropped. The only human controls left are the banner's **End Agent mode** button and **⌘⇧A**.
- Programmatic events pass. The agent drives through the channel below; the app executes commands as untrusted DOM events, records a receipt for each one, and answers with the live state.
- Approve direction stays locked for the agent as before; scope (frame / delete / design system / export) still applies.

## Desktop app: loopback HTTP

On Agent mode start the app writes `~/Library/Application Support/studio.aphrodite.mela/agent-endpoint.json` (mode 600):

```json
{"schema":"aphrodite.agent-endpoint/1","port":49321,"token":"…","base":"http://127.0.0.1:49321"}
```

The banner shows `127.0.0.1:<port>`; the agent console (right panel) shows ready-made curl lines. Every request needs `Authorization: Bearer <token>` and JSON bodies. Answers are JSON; `409` means the app refused (Agent mode off, locked action, nothing selected…), `504` means no answer in 15 s.

| Route | Body | Does |
|---|---|---|
| `GET /agent/state` | — | `#app` data attributes (`mode`, `page`, `frame`, `camera`, `selectedId`, `selectedKind`, …), delegation summary, last 10 receipts. Works even when Agent mode is off. |
| `POST /agent/command` | `{"query":"hero 추가"}` | Runs the best palette match (same search as ⌘K: commands, "Add <component>", "Go to frame · …"). |
| `POST /agent/act` | `{"action":"add","data":{"kind":"cta"}}` | Dispatches a `data-action` exactly like a click on a button with those data attributes. |
| `POST /agent/click` | `{"selector":".space-frame.active [data-kind=hero]"}` | `element.click()` on the first match. Use it to select blocks (`[data-block-id]`), open frame labels, press buttons. |
| `POST /agent/edit` | `{"field":"title","text":"…","blockId":"optional"}` | Sets `title / text / label / eyebrow / description` on the selected block (or `blockId`) through the normal commit (undoable, receipted). |
| `POST /agent/type` | `{"selector":"input[name=name]","text":"…","submit":true}` | Fills a form control that is currently in the DOM (dialog forms) and optionally submits its form. |
| `POST /agent/key` | `{"key":"1","shift":true}` | Synthesises a key press on the document (`"Escape"`, `"k"` with `meta`, `"1"` with `shift` = fit all). |
| `POST /agent/end` | — | Ends Agent mode from the agent side (`ended-by-agent`). |

Typical run:

```sh
E=$(cat ~/Library/Application\ Support/studio.aphrodite.mela/agent-endpoint.json)
BASE=$(echo "$E" | python3 -c 'import json,sys;print(json.load(sys.stdin)["base"])')
TOKEN=$(echo "$E" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
curl -s "$BASE/agent/state" "${H[@]}"
curl -s -X POST "$BASE/agent/command" "${H[@]}" -d '{"query":"features 추가"}'
curl -s -X POST "$BASE/agent/click"   "${H[@]}" -d '{"selector":".space-frame.active [data-kind=hero]"}'
curl -s -X POST "$BASE/agent/edit"    "${H[@]}" -d '{"field":"title","text":"빛으로 완성하는 공간"}'
curl -s -X POST "$BASE/agent/key"     "${H[@]}" -d '{"key":"1","shift":true}'
curl -s -X POST "$BASE/agent/end"     "${H[@]}"
```

## Browser build: `window.aphroditeAgent`

Without Tauri the same executor is exposed as `window.aphroditeAgent.run(kind, payload)` returning a promise — for CDP-driven harnesses and tests:

```js
await window.aphroditeAgent.run('command', {query: 'hero 추가'});
await window.aphroditeAgent.run('edit', {field: 'title', text: 'Light, made meaningful'});
await window.aphroditeAgent.run('state');
```

## Why not the real mouse?

A computer-use agent that moves the physical pointer is indistinguishable from the person at the desk, so the lock would block it too. The channel is what makes "the agent, by the agent" true: the human is locked out, the agent is not. Agents that only have a screen and a mouse should run the shell lines above from a terminal, or ask the human to end Agent mode.
