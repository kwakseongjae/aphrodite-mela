# Agent channel

The channel is **open from launch**. An agent on this Mac can read the project without anyone clicking anything. Writing is a separate question, and the app — not the calling client — decides it (`src/agent/authority.ts`).

| | 읽기 (`state`, 그리고 이후의 의미 단위 조회) | 쓰기 (`edit`, `act`, `click`, `type`, `key`, `command`, `library`) |
|---|---|---|
| **평소** (design) | 200 | **423** — 사람에게 연결 모드나 에이전트 모드를 켜 달라고 요청하라는 안내 |
| **연결 모드** (connected) | 200 | 200, 단 쓰기 리스를 쥔 주체만. 다른 주체는 **409**(보유자 이름 포함) |
| **에이전트 모드** (delegated) | 200 | 200 |

- **연결 모드**는 사람이 켠다: 도움말(`?`) → **에이전트 연결** → 스위치. 사람은 화면을 계속 쓰고, 에이전트의 편집은 상단 한 줄 배너에 집계되며 ⌘Z로 되돌아간다. 이번 실행 동안만 유지되고 앱을 끄면 꺼진다.
- **에이전트가 스스로 문을 열 수는 없다.** 스위치를 누르는 것도 쓰기라서 `agent-connect-toggle`을 `act`로 호출하면 423이 돌아온다.
- **사람이 항상 이긴다.** 연결 모드에서 사람이 타이핑하거나 클릭하면 리스가 즉시 사람에게 돌아가고, 에이전트의 다음 쓰기는 409를 받는다. 몇 초 조용하면 다시 열린다. 에이전트의 리스도 90초 무활동이면 풀린다.
- **호출자 이름**: `X-Aphrodite-Agent: claude-code` 헤더로 자기 이름을 밝힌다. 영수증마다 `by`로 남는다. `human`은 쓸 수 없다.
- 승인(Approve direction)은 채널에 존재하지 않는다. 제어는 `end`로 내려놓을 수만 있고, `start`는 없다.

## Agent mode — 완전 위임

사람이 **에이전트 모드**(독 → Agent, 또는 `3`)를 켜면 앱은 사람을 잠그고 화면을 통째로 넘긴다:

- A golden shield covers the window and a one-line banner sits on top. Every OS-originated event (mouse, keyboard, wheel, paste, drag) is dropped. The only human controls left are the banner's **End Agent mode** button and **⌘⇧A**.
- Programmatic events pass. The agent drives through the channel below; the app executes commands as untrusted DOM events, records a receipt for each one, and answers with the live state.
- Approve direction stays locked for the agent as before; scope (frame / delete / design system / export) still applies.

## Desktop app: loopback HTTP

From launch the app writes `~/Library/Application Support/studio.aphrodite.mela/agent-endpoint.json` (mode 600):

```json
{"schema":"aphrodite.agent-endpoint/1","port":49321,"token":"…","base":"http://127.0.0.1:49321"}
```

The banner shows `127.0.0.1:<port>`; the agent console (right panel) shows ready-made curl lines. Every request needs `Authorization: Bearer <token>` and JSON bodies, and should carry `X-Aphrodite-Agent: <name>` so its edits are named in the receipts. Answers are JSON: `401` wrong token, `403` no such command, `409` someone else holds the screen (or the app refused), `423` writing is not open yet, `504` no answer in 15 s.

| Route | Body | Does |
|---|---|---|
| `GET /agent/contract` | `?format=detailed&pageId=…` | 디자인 계약: 페이지·프레임·컴포넌트(`block_id`, kind, variant, 카피), 디자인 시스템, **사람이 지금 선택한 것**. 기본은 concise, 큰 프로젝트는 잘리고 어떻게 좁혀 물을지 알려준다. 이미지 바이트는 절대 싣지 않는다(`inline:image/png:24000`처럼 설명만). |
| `GET /agent/tokens` | — | 토큰과 **실제 CSS 변수명**(`--brand`, `--heading`). 생성 코드가 매직 넘버 대신 토큰을 쓰게. |
| `GET /agent/components` | — | 조립 어휘: kind × 변형 × 프로바이더. |
| `POST /agent/apply` | `{"ops":[…],"page_id":"…"}` | 배치 편집. **전부 적용되거나 하나도 안 된다.** undo 하나, 영수증 하나. 실패하면 `{error, failed_at, applied:0}`. |
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

## MCP

`mcp/aphrodite-mcp/` wraps this channel as an MCP stdio server for Claude Code and anything else that speaks MCP — 7 도구, 의존성 0개, `node mcp/aphrodite-mcp/index.mjs`. 레포에 `.mcp.json`이 있으니 `claude mcp list`가 바로 찾는다. 서버는 **아무 판정도 하지 않는다** — 위 권한 표 그대로다. 자세한 것은 `mcp/aphrodite-mcp/README.md`.

## Browser build: `window.aphroditeAgent`

Without Tauri the same executor is exposed as `window.aphroditeAgent.run(kind, payload)` returning a promise — for CDP-driven harnesses and tests:

```js
await window.aphroditeAgent.run('command', {query: 'hero 추가'});
await window.aphroditeAgent.run('edit', {field: 'title', text: 'Light, made meaningful'});
await window.aphroditeAgent.run('state');
```

## Why not the real mouse?

A computer-use agent that moves the physical pointer is indistinguishable from the person at the desk, so the lock would block it too. The channel is what makes "the agent, by the agent" true: the human is locked out, the agent is not. Agents that only have a screen and a mouse should run the shell lines above from a terminal, or ask the human to end Agent mode.
