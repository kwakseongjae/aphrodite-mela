# Agent channel

The channel is **open from launch**. An agent on this Mac can read the project without anyone clicking anything. Writing is a separate question, and the app — not the calling client — decides it (`src/agent/authority.ts`).

| | 읽기 (`state`, `contract`, `tokens`, `components`, `render`, `library`의 `list`) | 쓰기 (`apply`, `ui`, `edit`, `act`, `click`, `type`, `key`, `command`, `library`의 `import`·`delete`) |
|---|---|---|
| **평소** (design) | 200 | **423** — 사람에게 연결 모드나 에이전트 모드를 켜 달라고 요청하라는 안내 |
| **연결 모드** (connected) | 200 | 200, 단 쓰기 리스를 쥔 주체만. 다른 주체는 **409**(보유자 이름 포함) |
| **에이전트 모드** (delegated) | 200 | 200 |

- **연결 모드**는 사람이 켠다: 도움말(`?`) → **에이전트 연결** → 스위치. 사람은 화면을 계속 쓰고, 에이전트의 편집은 상단 한 줄 배너에 집계되며 ⌘Z로 되돌아간다. 한 번 허용하면 **12시간** 기억된다 — 앱을 껐다 켜도 그대로다(`CONNECT_HOURS`, `src/agent/guide.ts`). 스위치를 끄면 그 자리에서 끝난다.
- **에이전트가 스스로 문을 열 수는 없다.** 스위치를 누르는 것도 쓰기라서 `agent-connect-toggle`을 `act`로 호출하면 423이 돌아온다. 대신 **요청할 수는 있다** — `POST /agent/connect`는 앱 상단에 요청자 이름이 박힌 한 줄을 띄우고, 사람이 한 번 눌러 허용하거나 거절한다. 요청은 한 번에 하나만 서 있고 거절은 5분간 유지된다.
- **`GET /agent/guide`**는 권한 없이 언제나 읽을 수 있다. 작업 방식과 지금 상태(어느 프로젝트, 쓰기 가능 여부, 누가 화면을 쥐었는지)를 함께 알려준다. 에이전트는 여기서 시작하면 된다.
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

The banner shows `127.0.0.1:<port>`; the agent console (right panel) shows ready-made curl lines. Every request needs `Authorization: Bearer <token>` and JSON bodies, and should carry `X-Aphrodite-Agent: <name>` so its edits are named in the receipts. Answers are JSON: `401` wrong token, `403` no such command, `404` no such route (the reply lists every route), `409` someone else holds the screen (or the app refused), `423` writing is not open yet, `504` no answer in 30 s.

전부 17개다. 앱이 모르는 경로에는 404와 함께 이 목록을 그대로 돌려준다 (`ROUTES`, `src-tauri/src/agent.rs`). **권한** 칸은 `src/agent/authority.ts`의 판정이다: 읽기와 물음은 언제나 200, 쓰기는 연결 모드나 에이전트 모드가 필요하다.

| Route | 파라미터 | Does | 권한 |
|---|---|---|---|
| `GET /agent/guide` | — | 플레이북과 지금 상태를 한 덩이로: 어느 프로젝트·몇 페이지·모드·화면을 쥔 주체·쓰기 가능 여부. `{ok, guide}`. 여기서 시작하면 된다. | 물음 |
| `POST /agent/connect` | `{}` | 사람 화면에 요청자 이름이 박힌 한 줄을 띄운다. `{ok, status, message, mode}` — `status`는 `asked` / `waiting`(이미 서 있는 요청) / `declined`(5분 유지) / `already-open`(이미 열려 있음). | 물음 |
| `GET /agent/contract` | `?format=detailed&pageId=…` | 디자인 계약: 페이지·프레임·컴포넌트(`block_id`, kind, variant, 카피), 디자인 시스템, **사람이 지금 선택한 것**. 기본은 concise, 큰 프로젝트는 잘리고 어떻게 좁혀 물을지 알려준다. 이미지 바이트는 절대 싣지 않는다(`inline:image/png:24000`처럼 설명만). | 읽기 |
| `GET /agent/tokens` | — | 토큰과 **실제 CSS 변수명**(`--brand`, `--heading`). 생성 코드가 매직 넘버 대신 토큰을 쓰게. | 읽기 |
| `GET /agent/components` | — | 조립 어휘: kind × 변형 × 프로바이더. `aphrodite.components/1` — `component_kind`, `name`, `group`, `variants`, `providers`. | 읽기 |
| `GET /agent/render` | `?width=&height=&pageId=` | 페이지 그림. `{ok, page_id, width, height, mime:"image/png", png:<base64>}`. `width` 240–2000(기본은 그 페이지 프레임 너비), `height` 320–6000(기본은 `width`×1.6). **뷰포트**라서 긴 페이지는 아래가 잘린다 — 더 보려면 높이를 키워 다시 부른다. 앱 자신의 WebKit이 화면 밖(−9000, −9000)의 창에 따로 그려 찍는다: 사람의 창은 움직이지 않고 패널·독·줌도 찍히지 않는다. 레이아웃을 1.5초 기다리고 촬영은 10초에 포기한다(채널 자체는 30초). macOS 데스크톱 앱 전용. | 읽기 |
| `POST /agent/apply` | `{"ops":[…],"page_id":"…"}` | 배치 편집. **전부 적용되거나 하나도 안 된다.** undo 하나, 영수증 하나. 성공은 `{ok, applied, receipt, state}`, 실패는 `{error, failed_at, applied:0}`. op는 아래 표 참고. | 쓰기 |
| `GET /agent/state` | — | `#app` data attributes (`mode`, `page`, `frame`, `camera`, `selectedId`, `selectedKind`, …), delegation summary, last 10 receipts (`seq`, `kind`, `at`). Works even when Agent mode is off. | 읽기 |
| `POST /agent/ui` | `{"action":"command\|click\|type\|key", …그 동사의 필드}` | 의미 단위 도구로 표현되지 않는 것을 인터페이스로 직접 한다(대화상자 열기, Preview·Export, 설정, 단축키). 안쪽 동사의 파서와 권한을 그대로 탄다 — 문 하나, 규칙 하나. | 쓰기 |
| `POST /agent/command` | `{"query":"hero 추가"}` | Runs the best palette match (same search as ⌘K: commands, "Add <component>", "Go to frame · …"). | 쓰기 |
| `POST /agent/act` | `{"action":"add","data":{"kind":"cta"}}` | Dispatches a `data-action` exactly like a click on a button with those data attributes. | 쓰기 |
| `POST /agent/click` | `{"selector":".space-frame.active [data-kind=hero]"}` | `element.click()` on the first match. Use it to select blocks (`[data-block-id]`), open frame labels, press buttons. | 쓰기 |
| `POST /agent/edit` | `{"field":"title","text":"…","blockId":"optional"}` | Sets `title / text / label / eyebrow / description` on the selected block (or `blockId`) through the normal commit (undoable, receipted). | 쓰기 |
| `POST /agent/type` | `{"selector":"input[name=name]","text":"…","submit":true}` | Fills a form control that is currently in the DOM (dialog forms) and optionally submits its form. | 쓰기 |
| `POST /agent/key` | `{"key":"1","shift":true}` (`code`·`meta`·`ctrl`·`alt`도 받는다) | Synthesises a key press on the document (`"Escape"`, `"k"` with `meta`, `"1"` with `shift` = fit all). | 쓰기 |
| `POST /agent/library` | `{"action":"list\|delete\|import","scope":"project\|global","id":…,"name":…,"base64":…}` | 로컬 그림 보관함. 언제나 `{ok, dir, images:[{id, scope, name, width, height, mime}]}`를 돌려준다. `delete`는 16자리 `id`, `import`는 `name`과 base64 바이트. 데스크톱 전용. | `list`는 **읽기**, `import`·`delete`는 쓰기 |
| `POST /agent/end` | — | Ends Agent mode from the agent side (`ended-by-agent`). `{ok, ended:true}`. 평소(design)에는 끝낼 것이 없어 **409**. | 모드가 켜져 있을 때만 |

`apply`가 받는 op는 다섯 가지다 (`src/agent/ops.ts`):

| op | 필드 |
|---|---|
| `add` | `component_kind`(필수), `variant`, `before_block_id`, `content` |
| `update` | `block_id`(필수), `fields` |
| `move` | `block_id`, `direction`: `up` 또는 `down` |
| `delete` | `block_id` |
| `frame` | `preset`: `desktop`·`tablet`·`mobile`·`custom`, `page_id` |

`content`와 `fields`의 키는 `title`·`text`·`label`·`eyebrow`·`description`. `block_id` 자리에는 리터럴 `"selection"`을 쓸 수 있다 — 사람이 지금 고른 것이 곧 공유 포인터다. 한 번에 op 40개까지, 문자열 하나는 4,000자까지. 페이지를 고르는 열쇠는 `apply`만 `page_id`(`pageId`도 받는다)이고, `contract`와 `render`는 `pageId`다.

`edit`·`act`·`click`·`type`·`key`·`command`는 따로 돌려줄 것이 없어 실행 뒤 `state`와 같은 것을 돌려준다.

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

`mcp/aphrodite-mcp/` wraps this channel as an MCP stdio server for Claude Code and anything else that speaks MCP — 11 도구, 의존성 0개, `node mcp/aphrodite-mcp/index.mjs`. 레포에 `.mcp.json`이 있으니 `claude mcp list`가 바로 찾는다. 서버는 **아무 판정도 하지 않는다** — 위 권한 표 그대로다. 자세한 것은 `mcp/aphrodite-mcp/README.md`.

## Browser build: `window.aphroditeAgent`

Without Tauri the same executor is exposed as `window.aphroditeAgent.run(kind, payload)` returning a promise — for CDP-driven harnesses and tests:

```js
await window.aphroditeAgent.run('command', {query: 'hero 추가'});
await window.aphroditeAgent.run('edit', {field: 'title', text: 'Light, made meaningful'});
await window.aphroditeAgent.run('state');
```

## Why not the real mouse?

A computer-use agent that moves the physical pointer is indistinguishable from the person at the desk, so the lock would block it too. The channel is what makes "the agent, by the agent" true: the human is locked out, the agent is not. Agents that only have a screen and a mouse should run the shell lines above from a terminal, or ask the human to end Agent mode.
