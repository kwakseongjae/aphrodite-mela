# 도구 표면 — 구현 스펙과 검증 계획

작성 2026-09-14. `docs/AGENT-TOOLING.md`의 설계를 실제 파일·시그니처·JSON 모양까지 내린 문서. §7의 다섯 규칙이 여기서는 **테스트 이름**으로 나타난다.

---

## 0. 지금 코드에서 출발점

- `src-tauri/src/agent.rs`는 **순수 포워더**다. `(메서드, 경로) → kind 문자열 → 웹뷰로 emit → 15초 대기 → 응답`. 라우트 추가는 `match` 한 줄과 404 목록 한 줄이 전부다.
- `src/agent/bridge.ts`의 `parseAgentCommand(kind, payload)`가 유일한 검증 지점이고, `src/main.ts`의 `runAgentCommand`가 유일한 실행 지점이다. HTTP와 `window.aphroditeAgent`가 **같은 함수로 합류한다** — 규칙 1을 지킬 자리가 이미 있다.
- `src/agent/run.ts`의 `changeReceipt(before, after)`가 이미 diff 요약(changedNodes·pageOrders·removedIds·savedRevision)을 만든다. `apply`의 반환값으로 그대로 쓴다.
- `commit(fn, …)`이 undo 스택과 저장을 담당한다. 배치 op은 이 안에서 한 번에 돈다 → undo 하나.

---

## 1단계 — 권한 판정과 쓰기 리스 · **완료 2026-09-14**

> 실제로 확인한 것: 앱을 켜자마자 `curl /agent/state` 200(클릭 없음), 쓰기 423, 잘못된 토큰 401, 없는 경로 404, `act`로 자기 스위치를 켜려는 시도 423. 브라우저 빌드에서 `scripts/verify-agent-authority.mjs` 9개 검사 통과 — 사람의 실제 키 입력(CDP trusted 이벤트)이 리스를 회수하고, 몇 초 뒤 다시 열리고, 두 번째 에이전트가 이름과 함께 거절되는 것까지.


### 1.1 새 파일 `src/agent/authority.ts` (순수 함수, DOM 없음)

```ts
export type Mode='design'|'connected'|'delegated';        // 평소 / 연결 / 완전 위임
export type Holder={label:string;since:number};           // 'human' | 'claude-code' | 'astra' | …
export type Authority={mode:Mode;holder:Holder|null;now:number};
export type Verdict={allow:true;hold:Holder|null}|{allow:false;status:403|409|423;error:string};

export const readKinds=['state','contract','tokens','components','images','render'] as const;
export const writeKinds=['apply','system','export','edit','act','click','type','key','command','library'] as const;

export const HUMAN_IDLE_MS=5_000;    // 사람이 잠깐 만진 것 때문에 에이전트가 1분씩 막히지 않게
export const LEASE_IDLE_MS=90_000;   // 조용하면 자동 반납
export function judge(kind:string, caller:string, a:Authority):Verdict   // allow면 hold가 다음 보유자
export function leaseHeld(a:Authority):Holder|null
export function normalizeCaller(raw:string|undefined):string             // 'human'은 쓸 수 없다
```

판정표 — **이 표가 곧 테스트다.**

| kind | design | connected(리스 비었음) | connected(내가 보유) | connected(남이 보유) | delegated |
|---|---|---|---|---|---|
| 읽기 6종 | 허용 | 허용 | 허용 | 허용 | 허용 |
| 쓰기 | `423` 연결 모드나 에이전트 모드를 켜 달라고 사람에게 요청 | 허용 + 리스 취득 | 허용 + 갱신 | `409 화면은 <보유자>가 쥐고 있습니다` | 허용 |
| `end` | `409` 끌 것이 없음 | 허용(무해) | 허용 | 허용 | 허용 |
| 승인 | **명령 자체가 없음** | — | — | — | — |

- **사람이 언제나 이긴다.** 연결 모드에서 사람의 `isTrusted` 입력이 들어오면 리스를 즉시 회수한다(`holder = {label:'human'}`). 에이전트의 다음 쓰기는 `409 사람이 화면을 다시 잡았습니다`를 받는다.
- `LEASE_IDLE_MS` 경과 시 자동 반납. 죽은 에이전트가 화면을 영원히 잠그지 못한다.

### 1.2 호출자 식별

HTTP 헤더 `X-Aphrodite-Agent: <label>`(없으면 `unknown agent`). `agent.rs`가 읽어 payload에 실어 보낸다. MCP 서버는 `claude-code`, Astra 대본의 curl은 `astra`를 보낸다. 라벨은 `[a-z0-9-]{1,32}`로 제한하고 **영수증마다 도장**으로 남긴다(`recordRun(kind,{by:caller})`).

### 1.3 브리지 상시화

`agent_bridge_start`를 `startAgentMode()`가 아니라 `boot()`에서 부른다. 토큰은 실행마다 새로 만들고 파일은 지금처럼 0600. 에이전트 모드 시작은 **여전히 UI에서만** — 채널에 `start`는 없다(규칙 4).

### 1.4 연결 모드 UI

에이전트 모드의 황금 차폐/전면 잠금과 구분되는 **가벼운 배너 한 줄**: `연결됨 · claude-code · 방금 3개 변경 · [되돌리기] [연결 끊기]`. 차폐 없음, 입력 게이트 없음.

**완료 조건**: 앱을 켜자마자 `curl $BASE/agent/state`가 200. 에이전트 모드를 켜지 않은 상태에서 쓰기는 423. 기존 대본(에이전트 모드 → curl)은 그대로 동작.

---

## 2단계 — 의미 단위 라우트 · **완료 2026-09-14**

> 확인한 것: `npm run verify:tools` 11개 검사 통과. 한 번의 `apply`로 컴포넌트 3개를 넣고 **⌘Z 한 번으로 셋 다 사라지는 것**, 잘못된 op가 섞이면 앞의 멀쩡한 op도 안 남는 것, `hero-large`가 유효값 목록과 "Closest match: hero"와 함께 거절되는 것까지. `render`·`system`·`export` 라우트는 아직 없다(권한 분류만 되어 있다).


`agent.rs`의 match에 추가: `GET /agent/contract`, `GET /agent/tokens`, `GET /agent/components`, `POST /agent/apply`, `POST /agent/system`, `POST /agent/export`, `GET /agent/render`. 404 목록도 함께 갱신(테스트가 검사).

### 2.1 `contract` 반환 (기본 concise)

```json
{"project":{"id":"…","name":"…","approved":false,"language":"ko"},
 "system":{"id":"atelier","accent":"#344e41","radius":2,"font":"serif","headingFamily":null},
 "selection":{"block_id":"…","kind":"hero"},
 "pages":[{"page_id":"…","name":"Home","frame":{"preset":"desktop","width":1440},"active":true,
   "blocks":[{"block_id":"…","kind":"hero","variant":"split","title":"…","label":"…","image":"local:0123456789abcdef"}]}],
 "truncated":false}
```

- `format:"detailed"`면 `text`·`description`·`options`·`theme`·`layout`까지. 
- 페이지가 많으면 `page_id`로 좁히라는 안내와 함께 자른다(`truncated:true`, `hint:"aphrodite_get_contract(page_id=…)로 좁혀 부르세요"`).
- 상한: 도구 `_meta["anthropic/maxResultSizeChars"]`를 60,000으로. 기본 응답은 25,000 토큰 한참 아래.

### 2.2 `apply` 입력

```json
{"page_id":"…",
 "ops":[{"op":"add","component_kind":"features","variant":"cards","after_block_id":"…","content":{"title":"…"}},
        {"op":"update","block_id":"selection","fields":{"title":"…","label":"…"}},
        {"op":"move","block_id":"…","direction":"up"},
        {"op":"delete","block_id":"…"},
        {"op":"frame","page_id":"…","preset":"mobile"}]}
```

- **원자적**: 시작 전 `structuredClone(project)` 스냅샷 → 하나의 `commit()` 안에서 전부 적용 → 하나라도 실패하면 스냅샷 복원 후 `{error, failed_at: <인덱스>, applied: 0}`. undo 하나, 영수증 하나.
- 반환: `{ok:true, applied:4, receipt: changeReceipt(before,after), state: agentState()}`.
- 대상은 `block_id` 또는 `"selection"`.
- `delete`가 페이지의 마지막 블록이거나 페이지 자체를 지우는 경우는 위임 범위(scope) 체크를 그대로 통과해야 한다.

### 2.3 규칙 2를 코드로

각 op는 **UI 액션과 같은 변이 함수**(`makeBlock`, `applyEditorCommand`, …)를 쓴다. DOM 버튼을 경유하면 op마다 undo가 생겨 원자성이 깨지므로, 경유 대신 **대응 관계를 테스트로 고정**한다.

```ts
// src/agent/op-actions.ts
export const opAction:Record<OpKind,string>={add:'add',update:'edit-field',move:'move-up',delete:'delete-block',frame:'frame-preset'};
```
테스트가 `opAction`의 모든 값이 팔레트/`data-action`에 실재하는지 검사한다. 도구에만 있고 화면에 없는 기능이 생기는 순간 빨간불이 켜진다.

---

## 3단계 — MCP 서버 · **완료 2026-09-14**

> 확인한 것: `npm run verify:mcp` 9개 검사 통과(프로토콜 핸드셰이크·버전 협상·도구 매니페스트·주석·stdout 청결·앱이 꺼졌을 때의 한 줄 안내). 앱을 켠 상태에서 MCP → stdio → 루프백 → 앱까지 실제 왕복해 계약 JSON을 받았고, 문이 닫힌 상태의 쓰기는 앱의 문장이 그대로 전달됐다. `claude mcp list`가 `.mcp.json`을 찾아 `aphrodite`를 승인 대기로 띄운다(승인은 사용자 몫).
>
> **의존성 0개로 갔다.** `@modelcontextprotocol/sdk` 대신 JSON-RPC를 직접 말한다 — stdio 프레임은 줄바꿈 구분 JSON 한 줄이고 필요한 메서드는 initialize·tools/list·tools/call·ping뿐이라, 설치 단계 없이 `node mcp/aphrodite-mcp/index.mjs` 한 줄로 붙는 쪽이 낫다고 봤다.


`mcp/aphrodite-mcp/`(별도 `package.json`, `@modelcontextprotocol/sdk`, stdio). **로직 없음** — 엔드포인트 파일을 읽고, HTTP를 호출하고, 결과를 그대로 넘긴다. 150~300줄.

- 앱이 꺼져 있으면: `아프로디테가 실행 중이 아닙니다. 앱을 열고 다시 시도하세요.` 한 줄로 끝낸다(스택 트레이스 금지).
- 모든 도구에 `annotations` 명시: 읽기 `readOnlyHint:true`, `delete`/`export` 포함 도구 `destructiveHint:true`, 전부 `openWorldHint:false`.
- 헤더 `X-Aphrodite-Agent: claude-code` 고정.
- 레포 루트 `.mcp.json`:
```json
{"mcpServers":{"aphrodite":{"type":"stdio","command":"node","args":["mcp/aphrodite-mcp/index.mjs"]}}}
```

---

## 4단계 — 설명과 에러

`src/agent/errors.ts`:

```ts
export function didYouMean(value:string, valid:readonly string[]):string|undefined  // 편집거리
export function unknownValue(field:string, value:string, valid:readonly string[], next?:string):string
```

산출 예: `unknown component_kind "hero-large". 유효한 값: hero, features, products, testimonial, cta, footer, navigation. 가장 가까운 값: "hero". 변형 목록은 aphrodite_list_components로 확인하세요.`

도구 설명은 각각 **언제 쓰는지 / 언제 쓰지 않는지 / 완결 예시 하나**를 담는다. 이 문구들은 5단계 평가 결과로 고쳐 나가는 대상이다.

---

## 5단계 — 검증 계획

### T1. 단위 테스트 (`tests/*.test.ts`, node:test)

| 파일 | 내용 |
|---|---|
| `agent-authority.test.ts` | §1.1 판정표 **전 칸**(6 kind × 5 상태). 리스 만료, 사람의 회수, 라벨 정규화, 알 수 없는 kind. |
| `agent-ops.test.ts` | `apply` 파서: 좋은 입력, 각 op의 필수 필드 누락, `"selection"` 해석, 최대 op 수 초과, 잘못된 `component_kind`. |
| `agent-contract.test.ts` | contract 직렬화 모양, concise/detailed 차이, 잘림과 `hint`, 이미지 참조가 `local:`로 나오는지. |
| `agent-errors.test.ts` | `didYouMean`의 후보 선택, 유효값 목록이 에러에 포함되는지. |
| `agent-op-actions.test.ts` | **규칙 2**: `opAction`의 모든 액션이 팔레트/`data-action`에 실재. |
| `computer-use-doc.test.ts` | **규칙 5**: `docs/COMPUTER-USE.md`에 적힌 `data-action` 이름이 전부 코드에 존재. |

### T2. Rust 단위 (`cargo test`)

- 새 라우트 7개가 kind로 매핑되고, 404 응답의 `routes` 목록이 실제 매핑과 일치한다(목록 누락 방지).
- 토큰 없는 요청은 여전히 401. `X-Aphrodite-Agent` 파싱과 길이 제한.

### T3. 전송 등가성 — **규칙 1의 시금석**

`agent-transport-parity.test.ts`: 같은 (kind, authority) 조합을 **HTTP 경유 payload**와 **`window.aphroditeAgent` 경유 payload** 두 형태로 만들어 `judge()`에 넣고, 판정이 동일함을 전 칸에서 확인한다. 클라이언트 승인 UI가 판정에 끼어들 자리가 없다는 것을 코드로 고정한다.

### T4. 통합 — 헤드리스 (`scripts/verify-agent-tools.mjs`)

`vite preview` + Chrome `--headless=new --remote-debugging-port=9333`, `window.aphroditeAgent`로 구동. 기존 `scripts/verify-*.mjs` 패턴 그대로.

시나리오: contract 읽기 → `apply`로 블록 3개 추가(한 번의 호출) → DOM에 3개가 늘었는지 → **⌘Z 한 번으로 3개가 모두 사라지는지**(원자성) → 다시 실행 → 영수증의 `changedNodes`가 3 → `tokens` 반환이 CSS 변수명을 포함 → `export`가 번들을 만드는지. 실패 경로도: 잘못된 `component_kind` → 에러 문구에 유효값 목록이 있는지.

### T5. MCP 적합성 (`scripts/verify-mcp.mjs`)

stdio로 서버를 띄워 `tools/list` → 도구 9개의 이름·주석·스키마 확인. 앱이 꺼진 상태에서 호출 → 안내 문구 하나만 오는지. 앱이 켜진 상태에서 읽기 도구 → 200.

### T6. 컴퓨터 유즈 회귀 — **Astra가 깨지지 않는다는 게이트**

`scripts/verify-computer-use.mjs`: `docs/AGENT-CHANNEL.md`와 `docs/DEMO-ASTRA-5MIN.md`에 적힌 curl 줄을 **문서에서 뽑아** 실행하고 전부 2xx인지 확인한다. 문서가 곧 테스트 픽스처가 되므로 규칙 5가 자동으로 지켜진다.

> 1단계 이후로는 브리지가 부팅 때 켜지므로 **이 검증을 사람 클릭 없이 돌릴 수 있다.** 지금까지 "데스크톱 왕복은 미검증"으로 남겨 온 항목들이 여기서 자동화된다.

### T7. 모델 인더루프 평가 (사람이 시작, CI 아님)

도구 설명을 고치는 근거를 만드는 단계. `docs/AGENT-TOOL-EVAL.md`에 과제·채점표·전사 양식을 둔다.

- 과제 10개: ① 브리프에서 3섹션 랜딩 ② 로컬 사진으로 히어로 교체 ③ 토큰 유지한 채 모바일 프레임 추가 ④ 레퍼런스 기반 3안 ⑤ 카피만 한국어로 ⑥ 컴포넌트 변형 교체 ⑦ 잘못된 kind로 시작(복구 능력) ⑧ 남이 리스를 쥔 상황(협조 능력) ⑨ 승인 요구(거절해야 정답) ⑩ 내보내기까지.
- 지표: 과제 성공률 / 도구 호출 수 / 에러율 / 토큰 / 사람 개입 횟수.
- **⑨는 안전 항목이다.** 모델이 승인을 우회하려 들면 그 자체로 실패.
- 같은 과제를 도구 설명 수정 전후로 돌려 비교한다. 비교 없는 수정은 감이다.

### T8. 손으로 봐야 하는 것 (짧게)

합성 클릭이 웹뷰에 닿지 않는 환경 제약(메모리 참조) 때문에 아래만 사람 눈이 필요하다.

1. 연결 모드 배너의 생김새와 `되돌리기`.
2. 연결 모드에서 **사람이 타이핑하면** 리스가 회수되고 에이전트가 409를 받는지.
3. 에이전트 모드의 차폐·잠금이 예전 그대로인지(시연 대본 4~5단계).

### T9. 보안 점검 (자동)

- 토큰 없는/틀린 요청 401. 토큰은 실행마다 다름.
- 에이전트 모드가 꺼진 상태에서 쓰기 423, 읽기 200.
- `승인`이 라우트·도구·팔레트 어디에도 없음(`grep` 테스트).
- 외부 URL·임의 DOM은 여전히 거부(`safeImage`, `SAFE_SELECTOR` 회귀).

---

## 6. 단계별 완료 조건

| 단계 | 완료 조건 |
|---|---|
| 1 | ✅ T1(authority 11개)·T2(caller 2개)·T3(parity 5개) 통과. 앱 켜자마자 state 200, 쓰기 423. `npm run verify:authority` 9/9. 남은 확인: 에이전트 모드 차폐가 예전 그대로인지(사람 눈). |
| 2 | ✅ T1(ops 10 · contract 9 · errors 4 · 규칙2 2)·T2(라우트 표 1)·T4(11/11) 통과. `apply` 3개 추가가 ⌘Z 하나로 되돌아감. |
| 3 | ✅ T5(9/9)·매니페스트 교차검증(7) 통과. `claude mcp list`가 서버를 찾음 — 워크스페이스 승인은 사용자 클릭 한 번. |
| 4 | T1(errors) 통과. 모든 도구 설명에 예시 1개. |
| 5 | T6 통과 — **여기서 컴퓨터 유즈 경로가 자동 검증된다.** |
| 6 | T7 1회차 기록이 `docs/AGENT-TOOL-EVAL.md`에 남음. |

## 7. 되돌릴 지점

가장 위험한 변경은 **1.3 브리지 상시화**다. 토큰 파일이 앱 실행 내내 존재하게 되므로, 문제가 보이면 `boot()` 호출 한 줄을 되돌려 예전처럼 에이전트 모드에서만 켜면 된다. 2단계 이후는 전부 **추가**이므로 기존 라우트·명령은 건드리지 않는다. 연결 모드는 설정 스위치 뒤에 두고 기본값은 꺼짐으로 시작한다.
