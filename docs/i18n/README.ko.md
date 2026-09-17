<h1 align="center">Aphrodite: 만들기 전에, 방향부터</h1>

<p align="center">
  <img src="../assets/readme/hero.png" alt="Aphrodite 히어로 배너 — “Shape before you build.” 문구와 선글라스를 쓴 신문 콜라주 뮤즈, 황금 사과" width="100%">
</p>

<p align="center">
  <a href="https://kwakseongjae.github.io/aphrodite-mela/"><b>웹사이트</b></a> ·
  <a href="https://github.com/kwakseongjae/aphrodite-mela/releases/latest"><b>macOS용 다운로드</b></a> ·
  <a href="../QUICKSTART.md">빠른 시작</a> ·
  <a href="../../mcp/aphrodite-mcp/README.md">MCP 서버</a> ·
  <a href="../AGENT-CHANNEL.md">에이전트 채널</a> ·
  <a href="https://github.com/kwakseongjae/aphrodite-mela/releases">릴리즈 노트</a>
</p>

<p align="center">
  <a href="https://github.com/kwakseongjae/aphrodite-mela/releases"><img alt="release" src="https://img.shields.io/github/v/release/kwakseongjae/aphrodite-mela?style=flat&color=8f6a1c&label=release"></a>
  <a href="../../LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-3a4531?style=flat"></a>
  <img alt="platform" src="https://img.shields.io/badge/macOS-13%2B%20·%20Apple%20Silicon%20%26%20Intel-292820?style=flat">
  <img alt="notarized" src="https://img.shields.io/badge/Developer%20ID-서명%20%2B%20공증-d7b449?style=flat">
  <img alt="offline" src="https://img.shields.io/badge/계정%20없음%20·%20클라우드%20없음-5a604f?style=flat">
</p>

<p align="center"><a href="../../README.md">English</a> · <b>한국어</b></p>

---

코딩 에이전트는 30분이면 페이지 하나를 냅니다. **잘못된** 페이지도 30분이면 내고, 그 사실은 맨 끝에 가서야 알게 됩니다.

Aphrodite는 그 직전 단계입니다. 화면의 **방향**을 판단할 수 있을 만큼 실제에 가깝게 — 진짜 컴포넌트와 진짜 디자인 토큰으로, 하나의 열린 캔버스 위에서 — 정한 뒤, 코드를 쓸 누구에게든(또는 무엇에게든) 빌드 계약서를 넘기는 macOS 네이티브 작업대입니다.

> **당신의 작업물은 이 Mac을 떠나지 않습니다.** 계정도, 클라우드도, 생성 크레딧도 없고, 앞으로도 만들 계획이 없습니다. Aphrodite가 네트워크에 연결하는 곳은 정확히 세 군데이며 [아래](#이-mac을-떠나는-것)에 전부 적었습니다 — 어느 것도 당신의 프로젝트나 이미지, 텍스트를 싣지 않습니다.

<sub>이 단계에 쓸 무료 로컬 Figma 대체재를 찾아 오셨다면, 겹치는 부분에 대한 설명으로는 맞습니다. 다만 Aphrodite는 의도적으로 훨씬 좁습니다 — 화면 하나, 방향 하나, 계약서 하나.</sub>

---

<table>
<tr>
<td valign="top">
<img src="../../site/assets/shots/space-ko.webp" alt="Space — 데스크톱 랜딩, 모바일 페이지, 변형안이 하나의 열린 캔버스에 프레임으로 놓여 있고 플로팅 독과 인스펙터가 보입니다"><br>
<sub><b>Space</b> — 페이지는 하나의 열린 캔버스 위 프레임입니다. 데스크톱·태블릿·모바일·커스텀. 세 방향을 나란히 펼쳐놓고 하나를 고르세요. 모든 단계는 되돌릴 수 있고 기록이 남습니다.</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="33%" valign="top">
<img src="../../site/assets/shots/home-ko.webp" alt="홈 — 실시간 미리보기가 있는 프로젝트 카드, 필터와 검색"><br>
<sub><b>홈</b> — 모든 프로젝트를 실시간 미리보기 카드로. 작업 공간 사이로 옮길 수 있습니다.</sub>
</td>
<td width="33%" valign="top">
<img src="../../site/assets/shots/agent-ko.webp" alt="에이전트 모드 — 배너가 조작 주체를 알리고, 인스펙터에 범위·잠긴 동작·영수증 타임라인이 보입니다"><br>
<sub><b>에이전트 모드</b> — 에이전트가 기록이 남는 채널로 화면을 넘겨받습니다. 범위도 승인도 당신 것이고, ⌘⇧A로 되찾습니다.</sub>
</td>
<td width="33%" valign="top">
<img src="../../site/assets/shots/dev-ko.webp" alt="개발 모드 — 컴포넌트 신원, CSS 토큰, 렌더된 마크업, 복사 버튼이 있는 읽기 전용 인스펙트 패널"><br>
<sub><b>개발 모드</b> — 읽기 전용 핸드오프. 컴포넌트 신원, CSS로 된 토큰, 렌더된 마크업, 코딩 에이전트용 프롬프트.</sub>
</td>
</tr>
</table>

<p align="center"><a href="https://kwakseongjae.github.io/aphrodite-mela/"><b>어떻게 동작하는지 단계별로 보기 →</b></a></p>

---

## 무엇을 기억해 두는가

파일 두 개. 둘 다 아무 텍스트 편집기로 열어 고칠 수 있고, 둘 다 기본값은 꺼짐입니다.

**아카이브**는 당신이 본 것을 모아둡니다 — 사진, 주소, 왜 좋았는지 적은 한 줄. 프로젝트에 붙여두거나 전체가 공유하게 할 수 있고, 이미지 라이브러리와 같은 방식으로 내용 주소가 매겨집니다. 하나를 올리면 분석이 그것을 레퍼런스로 삼습니다.

**`taste.md`**는 당신이 계속 고르는 것을, 당신이 지울 수 있는 자리에 적어둔 파일입니다. 모든 줄이 횟수와 출처 id를 답니다. *"당신은 세리프를 좋아합니다"*가 아니라 *"세리프 헤딩 — 7개 중 6개 프로젝트 (p1, p4, …)"*. 앞의 문장을 말하는 기계는 당신이 누구인지 통보하는 것이고, 뒤의 문장을 말하는 기계는 근거를 보여주는 것이라 당신이 반박할 수 있습니다. 줄을 지우면 다시 생기지 않습니다. 동의는 **꺼진 상태**로 시작하고, 꺼짐은 '안 보여준다'가 아니라 '아무것도 도출하지 않는다'는 뜻입니다.

---

## 빠른 시작

[최신 릴리즈](https://github.com/kwakseongjae/aphrodite-mela/releases/latest)에서 Mac에 맞는 DMG를 **받으세요** — Apple Silicon은 `_aarch64.dmg`, Intel은 `_x64.dmg`. Developer ID로 서명하고 공증했으며, macOS 13 이상이고 두 아키텍처 모두 매 릴리즈마다 빌드·테스트합니다.

처음 실행하면 한국어와 영어 중 선택, 샘플 프로젝트 또는 빈 프로젝트, 그리고 짧은 둘러보기를 제안합니다. 업데이트는 구석의 카드에서 버전과 변경 내용을 알려주고 스스로 설치합니다 — 해당 버전만 넘기거나, 아예 꺼둘 수 있습니다.

<details>
<summary><b>소스에서 실행하기</b></summary>

```sh
git clone https://github.com/kwakseongjae/aphrodite-mela.git
cd aphrodite-mela
npm install
npm run desktop           # HMR이 붙은 Tauri 개발 앱
```

Node 22.12+, Rust/Tauri 툴체인, 그리고 온디바이스 OCR 사이드카를 위한 macOS Swift 컴파일러가 필요합니다. 테스트·헤드리스 검증 하네스·서명·릴리즈 절차는 [DEVELOPMENT.md](../DEVELOPMENT.md)에 있습니다.
</details>

레퍼런스 → 세 방향 → 선택 → 편집 → 승인 → 내보내기까지 5분짜리 첫 프로젝트는 [QUICKSTART.md](../QUICKSTART.md)에서 따라갈 수 있습니다.

---

## 당신의 에이전트가 조작합니다

Aphrodite는 모델을 싣지 않습니다. 이미 당신 기기에 있는 에이전트가, 이 저장소의 **MCP 서버**를 통해 조작합니다.

```sh
claude mcp add --transport stdio aphrodite -- node /path/to/aphrodite-mela/mcp/aphrodite-mcp/index.mjs
codex  mcp add aphrodite              -- node /path/to/aphrodite-mela/mcp/aphrodite-mcp/index.mjs
```

읽기는 앱이 열려 있으면 언제든 됩니다. **쓰기는 사람이 문을 열어야 합니다** — 에이전트는 요청할 수 있을 뿐이고, 사람의 클릭만이 그에 답합니다. 방향 승인은 모든 경로에서 설계상 거부됩니다. 하나의 순수 함수가 모든 경로에 대해 그것을 판단하기 때문에, `curl`도 승인했다고 믿는 클라이언트와 똑같은 답을 받습니다.

도구 목록, 슬래시 명령, 그리고 이 서버가 하지 않는 일은 [mcp/aphrodite-mcp/README.md](../../mcp/aphrodite-mcp/README.md)에 있습니다. 셸밖에 없는 도구를 위한 루프백 채널은 [AGENT-CHANNEL.md](../AGENT-CHANNEL.md)에, 에이전트가 의지해도 되는 UI 계약은 [COMPUTER-USE.md](../COMPUTER-USE.md)에 있습니다.

**무엇을 넘기는가:** `PROMPT.md`, `DESIGN.md`, `tokens.json`, `SCENE.json`, 업로드한 이미지가 포함된 렌더 HTML, 그리고 프로젝트 파일. 스크린샷이 아니라 계약서입니다.

---

## 이 Mac을 떠나는 것

연결은 세 개, 그리고 이것이 전부입니다.

| 언제 | 어디로 | 왜 |
|---|---|---|
| 버전 확인 | `github.com` | 스스로, 최대 6시간에 한 번. 꺼둘 수 있습니다. |
| 서체 선택기의 **설치** | `github.com` | 요청한 폰트 파일. 관례가 아니라 Rust 경계에서 강제합니다. |
| 저장한 레퍼런스의 **가져오기** | 당신이 입력한 주소 | 그 페이지 하나에서 제목과 그림만 읽습니다. |

첫 번째는 스스로 일어나고, 나머지 둘은 당신이 눌렀기 때문에만 일어납니다. 어느 것도 당신이나 당신 작업에 관한 것을 싣지 않습니다. 프로젝트·이미지·텍스트는 이 Mac에 남고, 그것을 바꿀 스위치는 어디에도 없습니다.

---

## 문서

| 문서 | 무엇을 위한 것인가 |
|---|---|
| [QUICKSTART.md](../QUICKSTART.md) | 설치, 첫 실행, 5분짜리 첫 프로젝트, 단축키, 문제 해결 |
| [DEVELOPMENT.md](../DEVELOPMENT.md) | 툴체인, 스크립트, 테스트, 헤드리스 검증, 서명, 릴리즈 절차 |
| [COMPUTER-USE.md](../COMPUTER-USE.md) | UI를 조작하는 에이전트를 위한 계약: 동작, 상태, 팔레트, 위임 규칙 |
| [AGENT-CHANNEL.md](../AGENT-CHANNEL.md) | 루프백 채널과 `window.aphroditeAgent` |
| [aphrodite-mcp/README.md](../../mcp/aphrodite-mcp/README.md) | MCP 서버: 연결 방법, 도구, 그리고 하지 않는 일 |
| [BETA-ROADMAP.md](../BETA-ROADMAP.md) | 실행 순서와, 서명된 빌드마다의 체크포인트 |
| [APHRODITE-BRAND.md](../APHRODITE-BRAND.md) | Paper Muse — 스튜디오 자체의 아이덴티티. 앱 안에서는 브랜드 키트 |

Aphrodite는 한 사람이 에이전트 함대와 함께 공개적으로 만드는 초기 베타입니다. 형태가 아직 너무 빠르게 움직여서 기여는 아직 받지 않지만, 이슈와 질문은 환영합니다.

---

## 라이선스, 크레딧, 계보

MIT — [LICENSE](../../LICENSE)를 보세요.

뮤즈는 SMK가 공개한 밀로의 비너스 석고 캐스트를 신문 콜라주로 다룬 것입니다. 조각 에디션과 사진 출처, oh-my-design 토큰 관찰, OpenDesign 워크플로 참조는 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)에 적었습니다. [OpenDesign](https://github.com/nexu-io/open-design)이 *에이전트 네이티브·로컬 우선* 프레이밍에 영향을 주었고, Aphrodite는 범위에서 반대로 걸었습니다 — 화면 하나를 잘 정하고, 넘긴다.

<p align="center"><sub>의도 있게. 약간의 직감도 함께.</sub></p>
