# Claude Code 핸드오프 — 2026-09-23

이 문서는 2026-09-22~23 세션이 세운 방향, 그 세션이 실제로 넣은 코드, 그리고 아직 손대지 않은 다음 작업을 적는다. 결론은 가설이다. 코드를 다시 읽고, 공개된 제품 사실을 다시 확인하고, 더 나은 다음 패치가 있으면 그쪽으로 간다.

전달용 프롬프트는 `docs/HANDOFF-CLAUDE-PROMPT.md`다.

## 제품에서 유지하는 것

Aphrodite는 로컬 macOS 작업대다. Tauri 2, Vite, 프론트는 React가 아닌 vanilla TypeScript. 모델은 앱에 넣지 않는다. 사람이 방향을 정하고, 그 결정이 디자인 계약으로 남는다. 컴퓨터 유즈와 에이전트 채널은 강점으로 유지한다. 읽기는 항상 열리고, 쓰기는 Connected 또는 Agent 모드와 임대(lease)를 통과한다. 에이전트는 자기 권한을 스스로 열 수 없다.

버전은 소유자가 0.3.0을 승인하기 전까지 0.2.x다. 마이너 패치는 +0.0.1. 버전 숫자는 `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `Cargo.lock`이 같다. MCP가 읽는 버전은 `package.json`이다.

`/Applications/Aphrodite.app`은 소유자가 설치를 말하기 전까지 바꾸지 않는다. 2026-09-23에 `CFBundleShortVersionString`은 **0.2.4**였다. `main`도 0.2.4다. 이 브랜치의 패키지 버전은 **0.2.7**이다.

## 브랜치

- 브랜치: `cursor/layout-cards-0-2-7-f301`
- PR: https://github.com/kwakseongjae/aphrodite-mela/pull/1 (draft)
- 화면 기록: `docs/patch-frames/README.md`
- `main` 대비 기능 커밋은 하나다. `667d41f`가 0.2.5, 0.2.6, 0.2.7을 한 번에 넣었고, 버전 파일은 0.2.4에서 0.2.7로 한 번에 올라갔다. 릴리스 노트 파일은 세 개다. 소유자는 패치마다 결과를 보고 `ㄱㄱ`으로 다음을 승인하려 했다. 설치된 앱에서 0.2.5와 0.2.6을 따로 확인하는 단계는 없었다.

## 이미 들어간 패치

### 0.2.5 — 업데이트 카드

원인: `paintUpdate()`가 퍼센트마다 카드 DOM을 갈아끼워 `.update-card`의 `enter` 애니메이션이 반복됐다. `downloadAndInstall` 뒤에는 묻지 않고 `relaunch()`가 호출됐다.

지금 트리: `keepsCard`는 `working`과 `installing`이 같은 상태로 이어질 때만 카드의 문장과 막대 너비만 고친다 (`src/update-notice.ts`). 설치가 끝나면 상태는 `restart`이고, `update-relaunch` 전까지 `relaunch()`를 호출하지 않는다. `update-later`는 다음 실행에 새 버전이 시작된다는 토스트를 남긴다. 버튼 문구는 `설치하기` / `Install`이다.

한계: 이 수정은 **지금 돌고 있는 바이너리가 0.2.5 이상일 때** 다음에 뜨는 업데이트 카드에 적용된다. 설치된 0.2.4는 예전 업데이터를 갖고 있다. `docs/patch-frames/025-update-card.jpg`는 설치된 앱 캡처가 아니라 카드 상태 프리뷰다. macOS에서 `/Applications`가 쓰기 불가면 tauri-plugin-updater가 관리자 AppleScript를 한 번 띄울 수 있다. 그건 이 패치의 범위 밖이다.

### 0.2.6 — 창이 홈이면 채널도 홈

원인: `GET /agent/state`는 `screen=home`인데, contract · tokens · render · guide가 메모리의 마지막 프로젝트를 화면에 있는 캔버스처럼 설명했다.

지금 트리: `src/agent/contract.ts`의 `closedCanvas` / `closedRender`. `src/main.ts`의 `runAgentCommand`는 `screen !== 'editor'`일 때 contract · tokens · render를 닫고, `apply` · `edit` · `system` · `export`를 거절한다. 클릭과 `act` · `command`는 남아 있어서 프로젝트를 열 수 있다. guide는 `screen: 'home'`일 때 프로젝트 목록이라고 말하고, 메모리의 프로젝트 이름을 페이지인 것처럼 넣지 않는다. `mcp/aphrodite-mcp/tools.mjs`의 get_contract / get_render 설명에 같은 말이 들어가 있다.

증거: `docs/patch-frames/026-home.jpg`는 프로젝트 목록, `026-channel-page.jpg`는 그때 채널이 찍어 준 화면 밖 페이지다. 홈 프레임을 찍을 때 창 안의 버전 표기는 0.2.3이었다. 오늘 번들 버전은 0.2.4다.

### 0.2.7 — 구현이 하나인 레이아웃은 카드

근거는 `docs/CATALOG-EVIDENCE.md`다. 2026-09-16 기준으로 섹션 변형은 23개에서 58개로 늘었고, 컨트롤은 이미 구현 × 변형 × 상태 조합이 두텁다. 사람이 느끼는 빈약함은 버튼 상태가 아니라 섹션 레이아웃을 한 장씩 못 보던 카탈로그였다.

규칙 (`src/design/catalog-view.ts`): `implementations(kind).length === 1 && rows.length === 1 && patternVariants(kind).length > 1`일 때만 `data-catalog-layout="gallery"`. 카드마다 `data-variant`가 있고, Add / Pin / Inspect가 그 변형을 싣는다. 공유 `#explorer-variant` 셀렉트는 없다. 구현이 여러 개인 종류(Button: own, mui, astryx, seed, shadcn)는 `compare`로 남는다. 필터로 Button을 한 프로바이더로 줄여도 갤러리가 되면 안 된다. `tests/catalog-filter.test.ts`가 그 경우를 막는다.

히어로 변형 9개 (`src/patterns.ts`): `split`, `image-left`, `stacked`, `editorial-wide`, `full-bleed`, `centered`, `offset`, `duo`, `quiet`.

전후: `docs/patch-frames/027-hero-before.jpg`, `027-hero-after.jpg`.

## 리서치에서 가져온 가설

다시 확인할 것. 세션 메모이지, 오늘 다시 연 1차 자료가 아니다.

- pen.dev(Pencil)는 IDE/데스크톱 벡터 디자인 도구로 이해했다. `.pen` / `.lib.pen`, 컴포넌트 · 슬롯 · 변수 · 테마, MCP의 `get_style` / `read_skill` / `execute` / `browser` / `spawn_agents`, 앱 안 컴포저와 병렬 시안이 참고 대상이었다.
- Aphrodite가 이미 가진 것 중 유지할 것: 로컬, 모델 없음, 영수증이 남는 권한, 사람 승인.
- 0.2.x에서 가치 있다고 본 것: 섹션 레이아웃을 카드로 보기, DESIGN.md가 실제로 놓인 레이아웃을 말하기, 컴퓨터 유즈 크롬을 문서와 맞추기, 채널이 창과 같은 화면을 말하기.
- 0.3.0 승인 전에는 넣지 않기로 한 것: 사용자 컴포넌트 라이브러리, 슬롯 편집, 라이트/다크 변수 열, 앱 안에 묶인 모델 컴포저, `.pen` 포맷.
- `design-md/` 코퍼스(OmD / DESIGN.md 모음)는 토큰 근거지, 레이아웃 카탈로그가 아니다. `docs/CATALOG-EVIDENCE.md`와 `docs/DESIGN-CONTRACT-SCOPE.md`가 그 구분을 이미 적었다.
- 포지셔닝 가설은 `docs/PRODUCT-STRATEGY.md`에 있다. “에이전트가 구현하기 전에 사람이 방향을 확정하고, 그 결정이 구현까지 유지되는 디자인 하네스.” Figma MCP가 이미 캔버스 작성과 컴포넌트 전달을 하므로, MCP 연결 자체는 차별점이 아니라고 그 문서가 적는다.

## 브리핑만 되고 코드에는 없는 다음 작업

소유자에게 말한 다음 `ㄱㄱ`은 두 가지였다.

1. `designMarkdown` (`src/design/contract.ts`)은 종류 이름만 적는다. `- hero: preserve the exported anatomy...`. 페이지에 놓인 블록의 `page / kind / variant / provider`가 없다. `componentIdentity`는 비어 있는 hero variant를 `patternVariants('hero')[0]`인 `split`으로 본다. 계약 문장은 그 사실을 아직 쓰지 않는다.
2. 인스펙터 히어로 `<select id="hero-variant">` (`src/main.ts`, 구성 셀렉트)는 `directions`(`src/reference.ts`)에서 이름을 찾는다. `directions`는 `split`, `image-left`, `stacked` 세 개만 이름이 있다. 나머지 여섯은 폴백 한 문장 `Editorial wide · 36:64` / `에디토리얼 와이드 · 36:64`를 같이 쓴다.

## 그 다음 작업보다 먼저 볼 구멍

갤러리 카드의 제목은 변형 **아이디**다 (`full-bleed`). 사람이 읽는 이름 표가 없다. 인스펙터는 세 개만 이름이 있고, DESIGN.md는 이름을 아직 안 적는다. 계약에 아이디를 먼저 박으면, 나중에 이름을 정할 때 계약 문장도 같이 바뀐다.

이름 하나를 카탈로그 카드, 인스펙터, DESIGN.md가 같이 쓰게 하는 편이 브리핑된 두 문자열 수정보다 맞을 수 있다. 맞는지 코드와 카탈로그 근거로 다시 판단한다. 틀리면 DESIGN.md 한 줄이 먼저라는 이유를 적고 그 패치만 한다.

`docs/COMPUTER-USE.md`는 갤러리(`data-catalog-layout="gallery"`, 카드의 `data-variant`)를 아직 현재 크롬으로 적지 않는다. 컴퓨터 유즈가 강점이면, 에이전트가 읽는 문서가 어제 넣은 UI를 모르는 상태가 다음 기능보다 급할 수 있다.

세 패치를 설치하지 않은 채 다음 문장 수정을 계속하는 것이 맞는지도 본다. 소유자는 데스크톱 앱으로 결과를 본다. 로컬 빌드를 `/Applications`에 덮어쓰지 않고 보여주는 방법이 이 저장소에 있으면 그 방법을 쓰고, 없으면 그 사실을 적고 프리뷰로 증명한다.

## stash

`stash@{0}` 메시지: `hold unapproved 0.3.0 draft (catalog gallery, DESIGN.md placements)`. `main` 위에 쌓여 있다.

들어 있는 것: 버전 0.3.0, 카탈로그 갤러리(이 브랜치에 이미 있음), `src/design/contract.ts`의 `placementLine`, detailed contract의 `design_markdown`, Experience 문단에서 `Primary task` 문장 삭제, `docs/COMPUTER-USE.md`에 갤러리 문단, `docs/BETA-ROADMAP.md`에 0.3.0 체크포인트.

`git stash pop`은 하지 않는다. 갤러리가 두 번 들어가 충돌하고, 승인되지 않은 0.3.0이 버전 파일에 돌아온다. 배치 문장이 여전히 옳으면 `git stash show -p 'stash@{0}' -- src/design/contract.ts`로 읽고, 이 브랜치 기준으로 다시 쓴다. Experience 문장 삭제는 배치 줄과 별개로 판단한다.

## 검증 파이프라인

패치를 하나 고르기 전에, 그 흐름의 이전 화면을 남긴다. 동작이면 짧은 영상, 정적이면 스크린샷. 파일 이름에 패치 버전과 `before`를 넣는다. 그 패치만 고친다. 버전은 그 패치를 진행하라고 한 뒤에 +0.0.1. 결과는 로컬 데스크톱 빌드로 보여주고 `/Applications/Aphrodite.app`은 그대로 둔다. 같은 프레임을 `after`로 남긴다. 소유자에게는 이전과 이후를 같이 보여주고, 패치가 한 일을 짧게 말하고, 다음 한 가지를 브리핑한 뒤 멈춘다. 다음 진행은 `ㄱㄱ`이다.

폰에서 보게 하려면 `lab/`에만 두지 않는다. `lab/`은 gitignore다. 화면은 `docs/patch-frames/`에 넣고, PR 본문에는 `raw.githubusercontent.com` 이미지 주소를 쓴다. Cursor 아티팩트 쿼리 주소는 HTML 페이지라 그림으로 열리지 않는다.

릴리스 노트는 `src-tauri/src/update.rs`의 `the_notes_we_ship_read_as_sentences`를 통과해야 한다. `docs/RELEASE-NOTES-v0.2.*.md`(v0.1 제외)마다 요약이 세 줄이고, 각 줄은 20자를 넘고, `.dmg`가 없고, 절 중간에서 끊기지 않고, `#`이나 `**`가 카드 문장에 들어가면 안 된다.

## 하지 않는 것

- 버전을 0.3.0으로 올리지 않는다.
- stash를 그대로 적용하지 않는다.
- `/Applications/Aphrodite.app`을 교체하지 않는다.
- 에이전트 엔드포인트의 bearer, 프로세스 환경의 키를 문서나 커밋에 넣지 않는다. 엔드포인트 파일은 `~/Library/Application Support/studio.aphrodite.mela/agent-endpoint.json`이다.
- 사용자 컴포넌트 라이브러리, 슬롯, 테마 열, 내장 모델, `.pen`을 이 검토의 구현에 넣지 않는다. 검토 문장으로 “지금은 아니”라고 적는 것까지는 한다.
- 0.2.5–0.2.7 코드를 되돌리지 않는다. 방향이 다르면 다음 패치에서 고친다.

## 이 검토가 답할 질문

1. 다음 0.2.8은 배치 문장인가, 히어로 라벨 버그인가, 둘을 묶는 이름 표인가, 컴퓨터 유즈 문서를 현재 크롬에 맞추는 것인가, 아니면 아직 설치되지 않은 0.2.7을 로컬 빌드로 보여주는 것인가.
2. pen.dev에서 가져오려던 항목 중, 2026-09-23의 공개 자료 기준으로 0.2.x에 넣을 가치가 생긴 것이 있는가. 없으면 그 판단을 한 문단으로 남긴다.
3. `docs/CATALOG-EVIDENCE.md`의 “섹션 레이아웃이 체감 다양성”이라는 결론이 갤러리 이후에도 다음 순서를 정하는가.
4. 갤러리 카드 제목을 아이디로 둔 것이 0.2.7의 남은 결함인가, 의도된 계약 표기인가.
