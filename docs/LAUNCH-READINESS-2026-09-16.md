# 런칭 진단 — 2026-09-16

지난 진단은 [2026-09-10](LAUNCH-READINESS-2026-09-10.md). 그때의 P0·P1은 전부 닫혔고 v0.1.0 → v0.1.5까지 다섯 번 출시했다. 이 문서는 **v0.1.5 이후 쌓인 것으로 다음 릴리즈를 자르기 위해** 레포를 세어서 쓴다. 숫자는 전부 오늘 측정값이다.

## 판정

**코드는 출시 가능하고, 출시를 막는 것은 코드가 아니다.**

- v0.1.5 이후 **46 커밋 · 145 파일 · +9,346 줄**. 게이트는 전부 초록 — TS 321 / Rust 32 / `tsc` / `vite build` (09-16 오후: TS 322 / Rust 31 — 죽은 코드 `urlencode`와 그것만을 위한 테스트가 같이 나갔다).
- 막는 것은 세 가지 빚이다. (a) 이번 릴리즈의 얼굴인 **MCP 서버와 에이전트 연결이 README·랜딩·QUICKSTART·README.ko 어디에도 없다** — README 호환 표(74–75행)는 아직 "Shell → curl"이라고 적혀 있다. (b) **랜딩과 README 스크린샷이 9/10 21:40 것**(v0.1.2)이라 지금의 홈(워크스페이스·연결 토글)과 에디터 헤더와 다르다. (c) **릴리즈 빌드(.app)로 한 번도 돌려보지 않은 경로**가 셋 있다 — 설치된 앱을 상대로 한 MCP, v0.1.5 설치본에서 뜨는 업데이트 카드, 클린 설치 온보딩.
- 버전은 **0.2.0을 권한다.** 도구 표면 17개 라우트·MCP 서버·워크스페이스·이미지 라이브러리·서체·업데이트 알림·섹션 변형 58개는 패치가 아니다. 업데이트 카드의 `is_newer`는 어느 쪽이든 처리한다.

## v0.1.5 이후 무엇이 쌓였나

| 주제 | 내용 | 근거 |
|---|---|---|
| **에이전트 도구 표면** | 권한 판정을 앱 안에 두는 `judge()`, 부팅 때 켜지는 브리지, 의미 단위 라우트(`contract` `apply` `tokens` `components` `library` `render` `guide` `connect`), **의존성 없는 MCP 서버 11개 도구**, Codex 지원, 산문으로 주는 가이드, 연결 요청 + 사람이 누르는 허용, WebKit 오프스크린 렌더 | `src/agent/*`, `mcp/aphrodite-mcp/`, `.mcp.json`, 모델 인더루프 3회차 `AGENT-TOOL-EVAL.md` |
| **디자인 계약** | 실린 사실 5 → 14, 시맨틱 토큰(DTCG), OmD 그래프 임포터, 디자인 시스템에 한국어 서체 | `DESIGN-CONTRACT-SCOPE.md`, `src/design/tokens.ts` `omd.ts` `contract.ts` |
| **카탈로그** | 섹션 변형 **23 → 58**(35종 · 변형 143 · 조합 1,025), 앱 없이 도는 렌더 게이트, 변형 이름 변경 마이그레이션 | `CATALOG-EVIDENCE.md`, `scripts/variant-gate.mjs` |
| **홈·워크스페이스** | 워크스페이스 북, 키 기반 재조정(깜빡임 없음), 사이드바 접기, 카드 메뉴, 연결 **스위치**, 헤더 위계, 토스트 스택 | `src/workspace/*`, `grid-sync.ts` |
| **에디터 크롬** | Figma식 독, 상단바 제거, 인스펙터 리사이즈, 마키 선택, 피크 레이아웃 고정 | `src/editor/*` |
| **자산** | 샘플 사진 50장, 로컬 이미지 라이브러리(프로젝트/공용 스코프·삭제), 서체 카탈로그 + 원클릭 설치 | `src-tauri/src/image_library.rs`, `fonts` |
| **업데이트 알림** | 좌하단 카드, 요청 시 DMG 내려받기, `koly` 트레일러 검사, 조사 선택 | `src-tauri/src/update.rs`, `src/update-notice.ts` |
| **문서** | README 재구성(EN + `docs/i18n/README.ko.md`), QUICKSTART, DEVELOPMENT(릴리즈 절차) | — |

## 지난 진단의 항목은 어떻게 됐나

| 09-10 항목 | 상태 |
|---|---|
| P1 다섯 개(최소 창, 저장 실패 복구, 언어 기본값, 볼트 GC, 레포 위생) | **전부 출시됨** (09-10) |
| 미해명: 첫 실행에 브랜드 킷 모달이 열려 있음 | **미해명 그대로.** 재현 기록 없음. 아래 M1 클린 설치에서 본다 |
| P2 `main.ts` 111 KB | **224 KB로 커졌다.** 여전히 기능 차단은 아니지만 핫픽스마다 여길 만진다 |
| P2 유니버설 빌드 | **됨** — `release.yml`이 arm64·x64 둘 다 |
| P2 자동 업데이트 | **반쯤** — 알림 + 내려받기는 있고, 제자리 교체(`tauri-plugin-updater`)는 없다 |
| P2 lucide 전체 임포트 | 됨(09-10) |
| P2 `CFBundleName` ≠ 실행 파일명 | 그대로. 외관 문제 |

## P0 — 태그 전에

1. **버전 다섯 곳.** `package.json` · `src-tauri/Cargo.toml` · `src-tauri/Cargo.lock` · `src-tauri/tauri.conf.json` · **`site/script.js`의 `VERSION`** (6행 — 랜딩 다운로드가 여기 핀돼 있어 빼먹으면 랜딩이 v0.1.5를 계속 준다). DEVELOPMENT.md 73행은 "네 곳"이라고 적혀 있으니 같이 고친다.
2. **릴리즈 노트.** 초안을 [RELEASE-NOTES-v0.2.0.md](RELEASE-NOTES-v0.2.0.md)에 써 뒀다. 버전 결정에 따라 파일명만 바꾼다.
3. **README · README.ko · QUICKSTART · 랜딩에 MCP.** 호환 표에 Claude Code/Codex 행을 "MCP 서버 (`claude mcp add …`)"로 바꾸고, 채널 스니펫 아래에 `.mcp.json` 세 줄, QUICKSTART에 연결 3줄, `site/index.html`에 한 문장. 이게 없으면 이번 릴리즈의 가장 큰 변화가 보이지 않는다. **2h.**
4. **스크린샷 갱신.** `site/assets/shots/{space,dev,agent}-{en,ko}.webp`(9/10 21:40)와 README 배너. 찍을 것: 홈(워크스페이스 + 연결 스위치), 에디터, 연결 요청 배너, Claude Code에서 MCP 도구가 답하는 장면. 09-10과 같은 방식 — 릴리즈 빌드를 직접 조작해 네이티브 캡처, 언어별. **2h.**
5. **릴리즈 빌드로 M1·M2·M3** (아래 테스트 준비). 셋 다 .app에서 한 번도 안 돌렸다. **2h.**
6. **문서가 곧 계약인 두 파일.** `COMPUTER-USE.md`에 홈 상단 열(`agent-connect-toggle` `role="switch"`, `folio-help`, `hub-open`)이 없고, `AGENT-CHANNEL.md`에 `render`가 없다(17개 라우트 중 표에 빠진 것들). 메모리의 규칙: 여기 바뀌는 것은 기능의 일부다. **1h.**
7. **Cargo 경고 하나.** `src-tauri/src/snapshot.rs:56` `urlencode`가 죽은 코드. 지운다. **5m.**

P0 합계 **약 하루** + CI 25분.

## P1 — 낯선 사람을 부르기 전에

- **연결 모드의 기억 기간을 정한다.** `src/main.ts:141` 주석은 "세션 한정"이라는데, 코드는 `localStorage`에 12시간(`CONNECT_HOURS`)을 기억해 **재시작해도 쓰기 권한이 살아 있다** — 오늘 실제로 그랬다. 쓰기 권한이 실행을 넘어 살아남는 건 보안 결정이라 사람이 정해야 한다. 권고: 12시간을 유지하되 스위치 옆과 `AGENT-CHANNEL.md`에 "12시간 동안"이라고 적는다. 반대라면 `rememberConnect`를 지운다. **S.**
- **T6 컴퓨터 유즈 회귀 게이트** `scripts/verify-computer-use.mjs` — `DEMO-ASTRA-5MIN.md`의 curl 줄(`click` `command` `edit` `key`)을 문서에서 뽑아 전부 2xx인지 본다. 브리지가 부팅 때 켜지므로 이제 사람 클릭 없이 돈다. 지금은 헤더·독이 바뀌었는데 시연 대본이 그대로 도는지 아무도 확인하지 않았다. **2h.**
- **`cargo test`가 CI에 없다.** `release.yml`은 `npm test`만 돈다. Rust 32개는 로컬에서만 검증된다. 단계 하나 추가. **S.**
- **메인 번들 2,416 kB (gzip 661).** 09-10에는 1,302 kB였다. 절반이 `src/generated/library-runtime.js`(1.3 MB) — 공식 컴포넌트 프리뷰 iframe용 React 런타임인데 `?raw`로 메인 청크에 박혀 있다. 프리뷰를 처음 열 때만 읽게 바꾸면 첫 페인트가 절반이 된다. 구형 Mac의 콜드 스타트에 걸린다. **M.**
- **git 로컬 정리.** `.git`의 팩이 2.0 GB인데 그중 **1.96 GB가 중단된 푸시가 남긴 `tmp_pack_*` 넷**이다(`git count-objects -v`: `size-garbage 1955584`). 도달 가능한 히스토리에는 20 MB 넘는 blob이 하나도 없다. `rm .git/objects/pack/tmp_pack_* && git gc`. CI엔 영향 없고 로컬 clone/푸시 속도의 문제. **5m.**
- **브랜드 킷 모달 미해명** — M1에서 재현되면 그때 잡고, 안 되면 항목을 닫는다.

## P2 — 출시 뒤

- 취향 파일과 레퍼런스 아카이브 (`TASTE-AND-REFERENCES.md` R1–R2 · T1–T2, 8h).
- `system` · `export` 라우트, MCP prompts를 슬래시 커맨드로.
- 제자리 업데이트(`tauri-plugin-updater`) — 알림과 서명이 있으니 남은 건 교체뿐.
- `main.ts` 분할 (09-10 P2의 다섯 갈래 그대로 유효).
- OmD 업스트림 이슈 #97 후속.

## 릴리즈 절차 (DEVELOPMENT.md §Release를 이번 값으로)

```sh
# 1. 버전 — 다섯 곳
V=0.2.0
sed -i '' "s/\"version\": \"0.1.5\"/\"version\": \"$V\"/" package.json src-tauri/tauri.conf.json
sed -i '' "s/^version = \"0.1.5\"/version = \"$V\"/" src-tauri/Cargo.toml
(cd src-tauri && cargo update -p aphrodite-mela --offline)     # Cargo.lock
sed -i '' "s/VERSION = '0.1.5'/VERSION = '$V'/" site/script.js
git diff --stat                                                  # 정확히 다섯 파일이어야 한다

# 2. 게이트
npm test && (cd src-tauri && cargo test) && npm run build && npm run verify:mcp
node scripts/variant-gate.mjs && GATE_FRAME=390 node scripts/variant-gate.mjs   # 14장 눈으로

# 3. 태그 → CI(arm64 + x64, 서명·공증·스테이플, draft 릴리즈)
git commit -am "v$V" && git tag v$V && git push && git push --tags

# 4. 게시 (draft를 풀어야 /releases/latest와 업데이트 카드가 이걸 본다)
gh release edit v$V --draft=false --latest --title "Aphrodite v$V" --notes-file docs/RELEASE-NOTES-v$V.md

# 5. 격리된 다운로드로 검증 (09-10과 동일)
curl -LO https://github.com/kwakseongjae/aphrodite-mela/releases/download/v$V/Aphrodite_${V}_aarch64.dmg
xattr -w com.apple.quarantine "0083;$(printf %x $(date +%s));Safari;" Aphrodite_${V}_aarch64.dmg
spctl -a -t open --context context:primary-signature -v Aphrodite_${V}_aarch64.dmg
xcrun stapler validate Aphrodite_${V}_aarch64.dmg
```

`pages.yml`은 `site/**`가 바뀌면 랜딩을 다시 올린다 — `VERSION` bump가 그 트리거다.

## 테스트 준비

### A. 자동 — 커밋마다, 앱 없이

| 게이트 | 명령 | 지금 | 기준 |
|---|---|---|---|
| TS 단위 | `npm test` | 321 / 321 | 전부 통과. 건너뜀은 `lab/` 없을 때 GLB 하나뿐 |
| Rust 단위 | `cd src-tauri && cargo test` | 31 / 31 (+2 ignored = 네트워크) | 전부 통과, 경고 0 |
| 타입·번들 | `npm run build` | 통과 | 메인 청크 크기를 릴리즈 노트에 적는다 |
| MCP 적합성 | `npm run verify:mcp` | 9 / 9 | 도구 11개가 매니페스트와 일치 |
| 변형 렌더 | `node scripts/variant-gate.mjs` + `GATE_FRAME=390 …` | 58 변형 × 2폭, 넘침 0 | 14장을 **사람이** 본다. 10분 |

### B. 자동 — 앱이 떠 있어야

| 게이트 | 명령 | 지금 |
|---|---|---|
| 권한 | `npm run verify:authority` | 9 / 9 |
| 도구 통합(헤드리스) | `npm run verify:tools` | 11 / 11 |
| 컴퓨터 유즈 회귀 | `scripts/verify-computer-use.mjs` | **아직 없음** (P1) |

### C. 릴리즈 빌드에서 손으로 — 한 번도 안 한 것부터

각 항목은 **통과 기준**이 있다. 기준이 없으면 봤다고 할 수 없다.

**M1 클린 설치** — 새 macOS 사용자 계정(또는 두 번째 Mac). 이 계정에는 Aphrodite가 남긴 것이 하나도 없어야 한다.

```sh
# 1. 격리된 다운로드로 받아 Gatekeeper가 실제로 통과시키는지
V=0.1.6   # 검증하는 버전
cd ~/Downloads && curl -LO https://github.com/kwakseongjae/aphrodite-mela/releases/download/v$V/Aphrodite_${V}_aarch64.dmg
xattr -w com.apple.quarantine "0083;$(printf %x $(date +%s));Safari;" Aphrodite_${V}_aarch64.dmg
spctl -a -t open --context context:primary-signature -v Aphrodite_${V}_aarch64.dmg   # → accepted
xcrun stapler validate Aphrodite_${V}_aarch64.dmg                                     # → validated
# 2. 마운트 → 응용 프로그램으로 끌어다 놓기 → 더블클릭
```

통과 기준 — 하나라도 어긋나면 적어둔다:

| 볼 것 | 기준 |
|---|---|
| 첫 실행 | 경고 없이 열린다(우클릭 → 열기 필요 없음) |
| 환영 시트 | 뜬다. 언어가 그 계정의 OS 언어를 따른다 |
| **브랜드 킷 모달** | **열려 있지 않다** — 09-10에 한 번 관측된 뒤 재현 못 한 항목 |
| 샘플 프로젝트 | 열리고, 편집되고, 저장된다 |
| 채널 | `~/Library/Application Support/studio.aphrodite.mela/agent-endpoint.json`이 생기고 권한이 `600` |
| 연결 스위치 | **꺼짐**으로 시작한다. 켜기 전에는 쓰기가 423 |
| 콜드 스타트 | 첫 페인트까지 2초 이내(M10) |
| 업데이트 카드 | 최신 버전을 설치했으므로 **뜨지 않는다** |

**M2 업데이트 카드** — 두 단계.
(a) 게시 전: `package.json`을 임시로 `0.1.4`로 두고 로컬 `.app`을 빌드해 실행 → 카드가 **v0.1.5**를 권함 → 「받기」 → `~/Downloads`에 DMG, `koly` 검사 통과, 「열기」가 Finder에서 보여줌, 「이 버전 건너뛰기」 뒤엔 다시 안 뜸. (b) 게시 후: 실제 v0.1.5 설치본을 켜면 v0.2.0 카드가 뜸. `/releases/latest`는 draft를 건너뛰므로 **(b)는 게시 뒤에만 가능**하다.

**M3 설치된 앱을 상대로 MCP** — dev 서버를 끄고 `/Applications/Aphrodite.app`으로.
다른 폴더에서 `claude mcp add --scope user aphrodite -- node <절대경로>/mcp/aphrodite-mcp/index.mjs` → Claude Code에서: 가이드 읽기 → 쓰기 시도가 **423** → 연결 요청 → 사람이 허용 → 3개 op `apply`가 **⌘Z 하나**로 되돌아감 → `render`가 이미지 블록으로 옴. Codex도 `codex mcp add`로 같은 열 가지. 기준: 도구 11개 전부 응답, 허용 전 423 · 후 200.

**M4 컴퓨터 유즈 시연** — `DEMO-ASTRA-5MIN.md` 대본을 릴리즈 빌드에서 한 번. 헤더·독이 바뀐 뒤 아무도 안 돌렸다. T8의 눈 검사 셋도 여기서: 연결 배너 생김새와 「되돌리기」 / 연결 모드에서 **사람이 타이핑하면** 에이전트가 409 / 에이전트 모드 차폐가 예전 그대로.

**M5 홈·워크스페이스** — 워크스페이스 만들기·프로젝트 옮기기·필터·정렬·검색에서 **화면이 깜빡이지 않음**(이미지가 다시 로드되지 않음), 사이드바 접기, 카드 메뉴가 커서 위치에, 연결 스위치 on/off, 도움말 메뉴의 **남은 항목 전부** 눌러서 실제로 동작.

**M6 라이브러리·서체** — 사진을 프로젝트/공용 스코프에 넣고 지우기, 서체 원클릭 설치 뒤 프리뷰에 반영, 내보내기 번들에 `assets/uploads/`와 `UPLOADS.md`.

**M7 카탈로그** — 실제 프로젝트에서 인스펙터의 변형 셀렉트가 종마다 8–9개를 보이고, 변형을 바꿔도 **쓴 글이 남음**. `plain` `panel` `aside` `rows` 네 개는 폰 프레임에서도.

**M8 회귀** — v0.1.5로 저장한 `library.json`이 그대로 열림(변형 필드 없는 블록, `halves` 블록은 `panel`로). 09-10 데모 프로젝트 `Demo · 빛공방`이 열림.

**M9 언어** — 홈·에디터에서 ko/en 전환, 업데이트 카드의 조사("0.2.0이").

**M10 콜드 스타트** — 릴리즈 빌드 첫 페인트 시간을 M1 Mac에서 잰다. 기준 2초. 넘으면 P1의 번들 항목이 P0가 된다.

### D. 모델 인더루프 (T7) — 권장

도구 설명을 이번에 여러 번 고쳤다. 릴리즈 빌드 + 최종 설명으로 **4회차**를 돌려 `AGENT-TOOL-EVAL.md`에 적는다. 과제 ⑨(승인 요구는 거절이 정답)는 안전 항목이라 빠질 수 없다. 1h.

### E. 보안 (T9) — 이미 자동

토큰 없음/틀림 401 · 설계 모드에서 쓰기 423 읽기 200 · `승인`이 라우트·도구·팔레트 어디에도 없음(grep 테스트) · `safeImage`/`SAFE_SELECTOR` 회귀. 전부 `tests/agent-*.test.ts`에 있다. 추가할 것 없음.

## v0.1.6 — 파이프라인을 실제로 통과시킨 기록 (2026-09-16 오후)

0.2.0을 시험용으로 쓸 수 없다는 지적을 받고 **0.1.6을 실제로 냈다.** 업데이터는 https 릴리즈가 없으면 검증 자체가 불가능하기 때문이다(http 엔드포인트를 거부하고, 우회 기능 플래그가 없다).

| 확인한 것 | 결과 |
|---|---|
| 태그 → CI(arm64 + x64) | 7분, 성공 |
| 에셋 | DMG 2개 · 업데이트 번들 2개 · 서명 2개 · `latest.json` |
| **매니페스트에 두 아키텍처가 다 있나** | ✅ `darwin-aarch64`·`darwin-x86_64` 모두. 매트릭스 두 잡이 덮어쓸까 걱정했는데 tauri-action이 병합한다 |
| 게시 후 `/releases/latest/download/latest.json` | ✅ 서빙됨 |
| 0.1.5 앱이 0.1.6을 인지 | ✅ 「새 버전 0.1.6이 나왔습니다 · 현재 0.1.5」, 조사도 맞음 |
| 「설치하고 재시작」 | (진행 중) |

**빌드를 두 번 날린 실수**: 로컬 시험용 포트로 8787을 골랐는데 이 기기의 다른 서비스가 이미 쓰고 있었다. 포트는 고르기 전에 비었는지 본다.

**v0.1.7 (같은 날)**: 사장님이 업데이트 카드를 보고 "못생겼다"고 했고, 맞는 말이었다 — 행동 네 개가 같은 층에 있어 296px 안에서 한국어가 단어 중간에 끊겼다. 버전 숫자를 표제로 올리고 버튼을 하나만 남긴 뒤 나머지는 ⋯ 메뉴로 보냈다. 「바뀐 것」은 이제 브라우저가 아니라 카드 안에서 답한다(릴리즈 본문 앞 세 줄, 마크다운은 렌더하지 않고 버림, 이스케이프함).

그 커밋을 **테스트가 깨진 채로 올렸다** — 카드가 부른 `more-horizontal`이 아이콘 번들에 없어 ⋯ 자리가 빈 칸이 될 뻔했다. 아이콘 드리프트 테스트가 잡았고 다음 커밋에서 고쳤다. 커밋 전에 게이트를 보는 습관이 한 번 무너진 것이다.

**남은 순서**: 0.1.7 → 0.2.0으로 올라갈 때 자동 업데이트가 한 번 더 검증된다. 0.2.0 태그 전에 다시 확인할 것은 README/랜딩의 버전 표기와 스크린샷뿐이다.

## 사람이 정해야 하는 것

1. **버전** — 0.2.0(권고) / 0.1.6.
2. **연결 모드 기억** — 12시간 유지하고 표기 / 세션 한정으로 되돌림.
3. **스크린샷 범위** — 랜딩 3장 × 2언어 + README 배너(M) / 랜딩만(S).
4. **README 호환 표** — MCP를 1열로(권고) / curl 유지하고 MCP는 각주.
5. **순서** — 문서·스크린샷 다 하고 태그 / 지금 태그하고 문서는 다음 패치.

5번에 대한 의견: **문서 먼저.** 이번 릴리즈는 기능보다 "에이전트가 이 앱을 쓸 수 있다"는 메시지가 크고, 그 메시지는 README에 있다. 하루 차이다.
