# Claude Code에 붙여 넣을 프롬프트

아래 울타리를 통째로 붙여 넣는다. 작업 트리는 `cursor/layout-cards-0-2-7-f301`이고, 원격에 올라가 있다.

```
이 저장소의 docs/HANDOFF-CLAUDE-2026-09-23.md 를 먼저 읽고, 그 문서가 가리키는 코드와 docs/CATALOG-EVIDENCE.md, docs/DESIGN-CONTRACT-SCOPE.md, docs/PRODUCT-STRATEGY.md, docs/COMPUTER-USE.md 를 확인한 뒤 작업해줘.

너는 그 핸드오프를 구현하는 사람이 아니다. 방향, 구현 계획, 리서치를 더블체크해서 더 나은 쪽으로 고치는 사람이다. 핸드오프의 다음 패치(DESIGN.md 배치 문장, 히어로 셀렉트 폴백)는 가설이지 지시가 아니다.

해줘.

1. 사실 확인. 브랜치 버전, 설치된 /Applications/Aphrodite.app 버전, 667d41f 에 0.2.5·0.2.6·0.2.7이 한 커밋으로 들어 있는지, designMarkdown 이 아직 종류 이름만 쓰는지, hero-variant 셀렉트가 directions 세 개 외에는 같은 폴백을 쓰는지, 갤러리 카드 제목이 변형 아이디인지, COMPUTER-USE.md 가 갤러리를 모르는지. 핸드오프와 어긋나면 코드를 믿어라.

2. pen.dev(Pencil)를 지금 공개된 자료로 다시 봐라. 핸드오프의 pen.dev 문단은 2026-09-22 세션 메모다. 0.2.x에 새로 가져올 것이 있으면 근거와 함께 한 문단으로 말하고, 없으면 그 판단을 한 문단으로 남겨라. 사용자 라이브러리, 슬롯, 테마 열, 내장 모델, .pen 포맷은 이번 구현에 넣지 마라.

3. 검토를 docs/HANDOFF-CLAUDE-REVIEW-2026-09-23.md 로 써라. 다음 0.2.8을 하나로 고르고, 고르지 않은 후보를 왜 미루는지 적어라. 후보: DESIGN.md 배치 문장, 히어로 라벨, 카탈로그·인스펙터·계약이 같이 쓰는 이름 표, COMPUTER-USE.md 를 현재 크롬에 맞추기, 아직 설치하지 않은 0.2.7을 로컬 빌드로 보여주기. 이름 표를 고르면 계약에 아이디를 먼저 박지 마라. 배치 문장을 고르면 카드 제목이 아이디로 남는 이유를 적어라.

4. 검토를 커밋하기 전에는 기능을 넣지 마라. 검토 문서를 먼저 커밋하고 푸시한 다음, 그 문서가 고른 패치 하나만 구현해라.

구현 제약:

- 버전은 +0.0.1. 지금 0.2.7이면 0.2.8이다. package.json, src-tauri/tauri.conf.json, Cargo.toml, Cargo.lock 을 같이 올려라. 0.3.0은 올리지 마라.
- git stash pop 하지 마라. stash@{0} 은 승인되지 않은 0.3.0 초안이고 갤러리가 이미 이 브랜치에 있다. 배치 문장이 필요하면 stash 를 읽고 이 브랜치에 다시 써라. Experience 문단의 Primary task 삭제는 배치 줄과 따로 판단해라.
- /Applications/Aphrodite.app 은 교체하지 마라.
- 0.2.5–0.2.7 동작을 되돌리지 마라. 갤러리는 implementations(kind).length === 1 일 때만. 필터로 Button 을 한 프로바이더로 줄여 갤러리가 되면 안 된다.
- 패치 전 화면을 남기고, 끝난 뒤 같은 프레임을 after 로 docs/patch-frames/ 에 넣어라. lab/ 만 쓰면 폰에서 안 보인다.
- docs/RELEASE-NOTES-v0.2.8.md 를 추가하고 cargo test the_notes_we_ship_read_as_sentences 를 통과시켜라. 요약은 세 줄, 각 줄 20자 초과, .dmg 없음, 절 중간에서 끊기지 않음, 카드 문장에 # 과 ** 없음.
- 테스트를 추가하고 관련 테스트를 실행해라.
- 에이전트 토큰과 키는 문서, 커밋, 출력에 넣지 마라.
- 커밋하고 이 브랜치에 푸시해라. PR 은 이미 https://github.com/kwakseongjae/aphrodite-mela/pull/1 이다. 새로 열지 마라.

끝나면 이전/이후가 어디 있는지, 패치가 한 일, 다음 한 가지를 짧게 말하고 멈춰라. 다음 패치로 넘어가지 마라.
```
