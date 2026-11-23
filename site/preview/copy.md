# 다운로드 페이지의 글 (site/preview)

페이지에 실리는 글의 원천입니다. tests/preview-page.test.ts가 이 파일과 페이지(index.html의 한국어, preview.js의 두 언어)를 글자 그대로 견줍니다. 글을 바꿀 때는 여기와 페이지를 함께 바꿉니다.

## 한국어

### 첫 화면

**눈썹 줄** Mac용 · 내부 미리보기

**제목** 쓰던 AI는 그대로, / 작업물은 한곳에.

**부제목** Claude와 ChatGPT 구독은 쓰던 그대로 두세요. 여러 프로젝트의 작업물이 Aphrodite 보드 한곳에 모여요.

**단추** Mac용 내려받기 · (작게) 무료 · 계정 없음 · macOS 13 이상

### 왜

**제목** 채팅창마다 흩어진 작업물, 이제 찾아다니지 마세요.

**본문** 브리핑은 지난주 대화에, 랜딩 시안은 다른 프로젝트에, 보고서는 다른 계정에 있죠. Aphrodite는 AI와 만든 것을 프로젝트별 보드에 모아 둬요. 열면 그려진 모습 그대로 나란히 보여요.

**본문 둘째 문단** 프로젝트마다 쌓이는 디자인 시안과 문서, 아티팩트로 만들던 페이지를 Aphrodite 보드 한곳에 모아서 보고, 고치고, 건넬 수 있어요.

### 기능

1. **쓰던 구독 그대로 써요.** 새 요금제도, API 키도 필요 없어요. 이미 쓰고 있는 Claude Code나 Codex를 연결하면, 그 에이전트가 보드에 페이지를 만들고 고쳐요. Aphrodite는 무료예요.
2. **프로젝트마다 보드 하나에 모여요.** 브리핑, 보고서, 디자인 시안, 스크린샷, 영상까지 한 보드에 놓여요. 페이지를 누르면 실제로 동작하는 모습 그대로 크게 볼 수 있어요.
3. **작업물은 내 Mac에 남아요.** 보드는 이 Mac의 파일이에요. AI 계정을 바꿔도, 대화가 사라져도 그대로 있어요.
4. **누가, 왜 고쳤는지 남아요.** 에이전트가 고친 곳에는 이유가 함께 기록돼요. 마음에 들지 않으면 ⌘Z 한 번으로 되돌릴 수 있어요.
5. **파일 하나로 건네요.** 보드는 .aph 파일 하나로, 페이지는 HTML 파일 하나로 내보내요. HTML 파일은 브라우저에서 바로 열리고, .aph 파일은 Aphrodite에서 열려요.
6. **결정은 사람이 해요.** 방향을 승인하는 일은 사람만 할 수 있어요. 에이전트가 만들고, 무엇을 고를지는 사람이 정해요.

### 시작하는 법

**제목** 쓰던 에이전트를 연결하면, 보드에 그리기 시작해요.

1. **Aphrodite를 설치하고 열어 두세요.** 내려받은 파일을 열어 Applications 폴더에 넣으면 끝이에요.
2. **쓰던 에이전트를 연결하세요.** 지금은 저장소를 받은 다음 터미널에 명령 한 줄을 넣어서 연결해요(git과 Node가 필요해요). Claude Code와 Codex 가운데 쓰는 쪽만 하면 돼요. 체크 하나로 연결하는 방법은 다음 판에 들어가요.
3. **평소처럼 부탁하세요.** "이번 주 진행 상황을 브리핑 페이지로 만들어서 Aphrodite 보드에 올려 줘." 처음 한 번, Aphrodite가 편집을 허용할지 물어요.

### 아직 안 되는 것

**제목** 미리보기판이라 아직 안 되는 것도 있어요.

- 페이지 안의 글과 모양을 손으로 직접 고치기. 지금은 에이전트에게 말해서 고쳐요.
- 앱 안에서 바로 AI와 대화하기. 지금은 터미널의 에이전트를 연결해서 써요.
- 링크로 공유하기. 지금은 파일로 건네요.

**맺음 제목** 쓰던 AI로 만들고, Aphrodite에 모아 두세요.

## English

### First screen

**Eyebrow** For Mac · Internal preview

**Headline** Keep your AI. / Keep the work in one place.

**Sub** Stay on the Claude and ChatGPT plans you already have. The work from every project gathers on one Aphrodite board.

**Button** Download for Mac · (small) Free · No account · macOS 13 or later

### Why

**Title** Stop digging through chats for the work.

**Body** The briefing is in last week's conversation, the landing draft is in another project, the report is under another account. Aphrodite keeps what you make with AI on one board per project, drawn exactly as it runs.

**Body, second paragraph** The designs, documents and pages your agents make across every project gather on one Aphrodite board, where you can review them, revise them and hand them over.

### Features

1. **Use the plans you already pay for.** No new subscription, no API key. Connect the Claude Code or Codex you already use and it builds and edits pages on your board. Aphrodite is free.
2. **One board per project.** Briefings, reports, design drafts, screenshots and video sit side by side. Open a page to see it running at full size.
3. **The work stays on your Mac.** A board is a file on this Mac. Switch AI accounts or lose a conversation, and it is still here.
4. **Every change says who and why.** An agent's edit carries its reason, and one ⌘Z takes it back.
5. **Hand it over as one file.** A board exports as one .aph file, a page as one HTML file. The HTML file opens in any browser; the .aph file opens in Aphrodite.
6. **People decide.** Only a person can approve a direction. The agent makes, and a person decides what to keep.

### Getting started

**Title** Connect the agent you already use, and it starts drawing on your board.

1. **Install Aphrodite and keep it open.** Open the file you downloaded and put Aphrodite in your Applications folder. That's all.
2. **Connect the agent you already use.** For now, you clone the repository and add one line in the terminal (you need git and Node). Do it only for the one you use, Claude Code or Codex. Connecting with a single checkbox comes in the next preview.
3. **Ask the way you always do.** "Turn this week's progress into a briefing page and put it on the Aphrodite board." The first time, Aphrodite asks whether to allow edits.

### Not yet

**Title** It's a preview, so some things don't work yet.

- Editing a page's text and look by hand. For now, you ask the agent to change it.
- Talking to an AI inside the app. For now, you connect an agent in the terminal.
- Sharing by link. For now, you hand it over as a file.

**Closing** Make it with the AI you already use. Keep it in Aphrodite.
