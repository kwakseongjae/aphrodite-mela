# 실행 레인: 모델·역할·덩어리 순서 (정본)

기준: 2026-11-18 오너 지시, 2026-11-26에 Codex Astra 워커를 더함(아래 두 번째 인용).

> 앞으로 기획과 로드맵, 최종검수는 fable이, 나머지 작업은 opus랑 sonnet을 필요에 따라 사용할 수 있게 해줘. 아마 Momo프로젝트가 가장 세팅이 잘 되어 있을거야.

Momo의 `docs/planning/PIPELINE.md`에서 가져온 것:
- 레인 표 하나를 정본으로 두고 다른 문서에 복사하지 않는다.
- 지정 모델을 임의로 바꾸지 않는다.
- 워커의 완료 선언만으로 완료 처리하지 않는다.
- 구현과 분리한 fresh 컨텍스트 검수.

2026-11-26에 오너가 Codex의 Astra 모델을 구현에도 적극적으로 쓰기로 했다: 크레딧에 여유가 있고, 기대 효과는 Opus와 비슷하게 본다(Fable·Opus가 위라는 판단은 그대로). effort는 재서 정한다.

가져오지 않은 것: 트랙 둘, 스택 8칸, 검증 줄. 이 저장소는 오너 한 사람과 세션 하나 규모라 과하다. 코드 워커가 셋을 넘게 되면 다시 본다.

## 1. 레인

| 레인 | 역할 | 구성 |
|---|---|---|
| product-owner | 방향, 통과·반려·롤백, x.y.0 태그, 방향 승인 | 오너 |
| planner / final-reviewer | 기획, 로드맵, 지시서, 설계 결정, 워커 결과 확인, **최종 검수**, 검수 보드, 오너와의 대화 | **Fable** (Claude Code 세션 모델). 세션이 Fable이 아니면 `final-review` 에이전트(fresh 컨텍스트, Fable)로 최종 검수를 받는다 |
| worker-opus | 판단이 큰 구현: 문서 모델, 원장, 권한, 명령표, 렌더러, 설계가 섞인 UI | Claude Code 서브에이전트 **Opus**, 작업마다 git worktree 하나 (`.claude/agents/worker-opus.md`) |
| worker-astra | 끝이 시험으로 분명한 구현: 엔진과 연결(MCP 싣기, 공유 서버, ChatGPT 엔진, 네이티브 쪽), 동작 고침, 버릴 코드로 하는 시험(시제품), 양이 많은 기계적인 일 | **Codex CLI `gpt-6.2-astra`**, 작업마다 git worktree 하나. 부르는 법과 effort는 §4. Claude 쪽 에이전트 정의를 읽지 못하므로 규칙을 지시서 머리에 적어 준다 |
| worker-sonnet | 기계적인 구현과 보조: 브랜치 옮기기와 충돌 풀기, 시험 추가, 문구, 화면 캡처와 전·후 그림, 조사, 약관 재확인 | Claude Code 서브에이전트 **Sonnet** (`.claude/agents/worker-sonnet.md`) |
| reviewer-code | 구현 맥락과 분리한 diff 검수. **지은 쪽과 다른 회사의 모델이 본다** | Astra가 지은 것은 fresh 컨텍스트 Opus 서브에이전트가, Opus·Sonnet이 지은 것은 Codex CLI(읽기 전용, Astra, effort는 §4)가 본다. 권한·저장·설정 파일·새 네트워크 표면처럼 틀리면 비싼 변경은 둘 다 돌린다. 11/17·11/18·11/20·11/25에 Codex가 실제 구멍을 찾았다 |
| 이미지 | 아이콘, 샘플 이미지, 랜딩 에셋 | Codex (gpt-image-2) |

- Grok은 쓰지 않는다(2026-11-17). 화면 조작(computer use)도 쓰지 않는다(계획 §7.5).
- 지정 모델을 쓸 수 없으면 다른 모델로 임의로 바꾸지 않는다. 진행 상태와 남은 일을 보드에 남기고 멈춘다. **미리 정해 둔 넘겨주기는 둘뿐이다**: (1) Opus가 한도에 걸리면 그 덩어리 가운데 시험으로 끝이 분명한 부분만 Astra가 이어받는다(모양을 정하는 일과 시안은 기다린다). (2) Astra가 한도나 오류로 멈추면 같은 세션을 이어서 시키고(`codex exec resume`), 그래도 안 되면 Opus가 이어받는다. 넘겨줄 때마다 보드에 한 줄로 적는다.
- 보드의 엔진·UI 항목에 실제로 쓴 모델을 적는다.

## 2. 덩어리 하나가 도는 순서

1. **지시서 (Fable).** 목표, 범위, 하지 말 것, 완료 기준, 고치기 전에 실패해야 하는 시험을 `docs/research/briefs/<덩어리>.md`에 쓴다. 보드의 진행표를 "진행"으로 바꾼다.
2. **구현 (Astra, Opus 또는 Sonnet 워커).** worktree에서 작은 커밋으로 한다. 원격에 올리기, PR, main은 건드리지 않는다. 동시에 도는 코드 워커는 셋까지(계획 §21.3의 세 줄)이고, 같은 파일의 같은 곳을 동시에 만지지 않는다. 화면 점검(`verify:*`)은 포트가 고정이라 한 번에 한 작업 폴더만 돈다: Astra 워커는 `npm test`·`tsc`·`build`까지만 돌리고 화면 점검은 Fable이 돌린다.
3. **확인 (Fable).** diff를 읽고 `npm test`, `npx tsc --noEmit`, 점검(`verify:tools`, `authority`, `contract`, `workspaces`, `mcp`, `selection`)을 직접 다시 돌린다.
4. **독립 검수.** reviewer-code. 높음 지적을 고친 경우에만 다시 돌린다.
5. **최종 검수 (Fable).** 지시서의 완료 기준과 대조하고, 조용히 정한 것과 한계를 적어 보드에 올린다. UI는 전·후와 롤백 단위 커밋, 엔진은 커밋·시험·리뷰를 함께 올린다.
6. **오너 결정.** 통과·반려·롤백을 채팅으로 받는다. 설계, 지시서, 시안은 미리 해도 된다. **새 UI는 오너가 그림으로 먼저 확인한다**(오너 2026-11-26): 새로 생기는 화면은 짓기 전에 시안을, 있던 화면이 달라지는 것은 합치기 전에 전·후 그림을 올리고 답을 받은 뒤 main에 넣는다. 눈에 보이는 것이 바뀌지 않는 덩어리(엔진, 동작 고침)는 계획 §21.5대로 기다리지 않고 이어 간다.
7. **합치기와 정리.** PR → CI → 합치기. 합친 worktree와 브랜치는 그 자리에서 지운다(전역 디스크 위생 규칙).

## 3. 어느 워커에게 줄지

| 일 | 워커 |
|---|---|
| 한 번 틀리면 되돌리기 어려운 구조(명령표 스키마, 노드 모델, 원장 연산), 권한·보안 | Opus. 설계 초안은 Fable이 쓰고 Opus가 구현하고, Codex(Astra)가 검수한다 |
| 모양과 취향이 걸린 화면(시안, 화면 옮기기, 어두운 판, 문구) | Opus. 그림은 Fable이 한 장씩 본다 |
| 완료 기준이 시험으로 적히는 엔진·연결·네이티브 일, 동작 고침, 시제품 시험 | Astra. fresh Opus가 검수한다 |
| 세워 둔 브랜치를 새 main 위로 옮기기, 충돌 풀기 | Sonnet. 충돌이 설계 판단을 요구하면 멈추고 Fable에게 넘긴다 |
| 화면 시안·목업(코드 밖), 전·후 캡처 | 방향과 기준은 Fable, 그리는 일은 Opus, 캡처는 Sonnet |
| 조사(경쟁 제품 재조사, 약관 재확인) | Sonnet |
| 5분 안쪽의 작은 고침, 지적 반영 한 줄 | Fable이 직접 |

## 4. Codex Astra를 부르는 법 (2026-11-26)

- 모델은 `gpt-6.2-astra`(11/26 이 계정에서 도는 것을 확인). `~/.codex/config.toml`은 건드리지 않고(기본값이 `gpt-6.1-sol`·medium·`danger-full-access`다) 부를 때마다 모델, effort, 샌드박스를 적는다. 출력 머리의 `model:`·`reasoning effort:`·`sandbox:` 줄을 읽고 나서 결과를 믿는다.
- 구현: `~/.claude/skills/codex-fleet/scripts/codex_spawn.sh --workdir <작업 폴더> --prompt-file <지시서> --name <이름> --model gpt-6.2-astra --effort <effort> --add-dir /Users/kwakseongjae/projects/aphrodite-mela/.git`(샌드박스는 workspace-write로 고정, 종료는 `RUN_DIR/exit-code`). 
- 검수: `codex exec -m gpt-6.2-astra -c model_reasoning_effort=<effort> --sandbox read-only --skip-git-repo-check -C <작업 폴더> "<질문>"`. 공격하라는 말투는 쓰지 않는다(필터에 걸린다).
- **effort**: 재서 정한다(검수는 이미 답을 아는 변경으로, 구현은 같은 일을 두 effort로). 잰 결과와 정한 값은 아래에 적는다.

### 검수 effort (2026-11-26에 잼)

같은 질문으로 편집 화면의 틀 f76531c를 보게 했다. 11/25에 `gpt-6.2-sol` high가 높음 1·중간 5·낮음 4를 찾은 변경이다(출력: `lab/review-board/evidence/reviews/2026-11-25-codex-0.3-L4-shell.out`, 이번 것은 `2026-11-26-astra-probe-{medium,high,xhigh}.out`).

| 모델·effort | 걸린 시간 | 토큰 | 지적 | 알려진 높음 | 새로 찾은 것 |
|---|---|---|---|---|---|
| sol 6.2 high (11/25) | — | 196천 | 10 (높음 1 · 중간 5 · 낮음 4) | 찾음 | 기준 |
| astra medium | 3분 1초 | 98천 | 10 (1 · 6 · 3) | 찾음 | 없음. 낮음 하나(열려 있던 팔레트)를 놓침 |
| astra high | 5분 32초 | 165천 | 12 (2 · 6 · 4) | 찾음 | 열려 있던 내보내기 창이 에이전트 편집 뒤 오류, 둘러보기가 숨은 도구를 가리킴 |
| astra xhigh | 7분 28초 | 212천 | 12 (2 · 6 · 4) | 찾음 | 위의 것 + 자동 배치가 리비전·원장의 좌표를 바꿈, 홈 카드의 페이지 수, 팔레트에서 빠진 Moa 견본 |

**정한 값(검수)**: 기본은 **astra high**(sol high보다 토큰이 적고 더 찾는다). 권한·저장·설정 파일·네트워크처럼 틀리면 비싼 변경은 **xhigh**. 고침 하나만 좁게 다시 볼 때는 **medium**. max·ultra는 xhigh에서 더 찾는 것이 눈에 보일 때만 재 본다.

### 구현 effort

가1(넘어온 고침 일곱, 지시서 `briefs/0.3-G1-carryover-fixes.md`)을 같은 지시서로 두 작업 폴더에서 돌리고, fresh Opus가 둘을 나란히 검수했다(`lab/review-board/evidence/reviews/2026-11-26-opus-0.3-G1-compare.md`).

| effort | 걸린 시간 | 토큰 | 바뀐 것 | 시험 | 검수가 본 차이 |
|---|---|---|---|---|---|
| astra high | 15분 30초 | 179천 | 13파일 +258 −33 | 1017 통과 | 일곱 가운데 둘이 반쪽(빈 보드의 핸드오프 글, 한 묶음 안의 op+patch 배치), 포커스 가두기에서 Shift+Tab이 샘, 시키지 않은 단추를 화면에 더함 |
| astra xhigh | 19분 | 214천 | 16파일 +367 −61 | 1017 통과 | 위 넷이 없음. 대신 속성 칸에 저장되지 않는 입력 칸을 남김 |

둘 다 같은 곳(페이지 안의 링크가 보드를 바꾸는 길)에서 틀렸다: 지시서가 그렇게 시켰기 때문이고, 검수가 잡아 Fable이 규칙을 바꿨다(틀의 메시지는 보드를 바꾸지 않는다).

**정한 값(구현)**: 기본은 **astra xhigh**. 시간은 4분의 1쯤 더 들고 빠뜨리는 것이 눈에 띄게 적다. 한 줄 고침이나 문구처럼 판단이 없는 일만 high. 어느 effort든 fresh Opus 검수는 건너뛰지 않는다(두 effort가 같은 잘못을 함께 했다).

**알게 된 것**: Codex의 샌드박스는 worktree의 git 메타데이터(`.git/worktrees/<이름>/index.lock`)를 쓰지 못한다(`--add-dir <main>/.git`을 줘도). 워커는 작업 폴더 안의 임시 git 폴더로 커밋하고 묶음 파일과 `STATUS`를 남긴다 → Fable이 `git reset --mixed <끝 커밋>`으로 가지에 붙인다. 지시서에 이 방법을 미리 적어 준다.
