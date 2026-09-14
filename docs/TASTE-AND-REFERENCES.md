# 취향과 레퍼런스 — 설계 제안

작성 2026-09-14. 두 가지를 같은 뼈대 위에 올리는 제안이다. **취향**(사람이 무엇을 고르고 무엇을 고치는가)과 **레퍼런스 아카이브**(무엇을 보고 만들었는가). 둘 다 로컬·전역 두 스코프를 갖고, 둘 다 동의 없이는 시작하지 않는다. 아직 구현 전이다.

이미 만든 것과 뼈대를 공유한다 — 사진 라이브러리의 스코프 구조, 내용 주소(FNV-1a 16 hex), 영수증, 권한 문. 새 개념을 들이는 게 아니라 있는 것을 한 겹 더 쓰는 쪽이다.

---

## 1. taste.md — 취향을 파일로

### 1.1 왜 파일인가

취향은 개인적이다. 그래서 **사람이 열어보고 고치고 지울 수 있어야** 한다. 숨은 프로파일이 아니라 `DESIGN.md`처럼 읽을 수 있는 마크다운이어야 신뢰가 생긴다. 틀린 줄이 있으면 지우면 된다.

경로는 사진 라이브러리와 같은 규칙:

```
~/Library/Application Support/studio.aphrodite.mela/taste.md          ← 전역
.../vault/<projectId>/taste.md                                        ← 이 프로젝트만
```

### 1.2 무엇이 신호인가 — 고친 것이 고른 것보다 세다

앱은 이미 모든 결정을 영수증으로 갖고 있다(`AssemblyRun`, `changeReceipt`, 제안 accept/keep/discard). 여기서 네 가지를 뽑는다.

| 섹션 | 무엇 | 왜 |
|---|---|---|
| **Chosen** | 세 방향 중 고른 것, 디자인 시스템, 변형, 서체 | 가장 직접적. 다만 선택지가 준 것 안에서의 선택이다. |
| **Corrected** | Get Vibe 직후 **사람이 바꾼 것** | **가장 날카롭다.** 기계가 제안한 뒤 사람이 손댄 지점이 곧 취향의 경계다. |
| **Rejected** | 버린 제안, 열어봤지만 안 쓴 프리셋 | 부정 신호는 긍정 신호만큼 정보가 많다. |
| **Said** | 브리프·조립 목표에 사람이 쓴 말 | 본인의 어휘. 인용으로만 남긴다. |

예시:

```markdown
# Taste
schema: aphrodite.taste/1
consent: on · scope: global · since 2026-09-14
updated: 2026-09-20

## Chosen
- Editorial hero, stacked — 5번 중 4번 (run r12, r14, r15, r18)
- 제목 serif + 본문 sans — 프로젝트 7개 중 6개

## Corrected
- Get Vibe 뒤 제목을 줄인다 — 중앙값 48자 → 31자 (편집 9회)
- CTA 라벨은 8번 중 7번 교체 — 명사보다 동사를 쓴다
- 생성 이미지보다 로컬 라이브러리 사진을 6번 골랐다

## Rejected
- Karrot 프리셋 2번 열고 한 번도 유지 안 함
- 풀블리드 이미지 3번 버림

## Said
- "따뜻하고 편집적인" (브리프, 2026-09-10)
- "여백이 충분했으면" (조립 목표, 2026-09-12)
```

**증거 없는 줄은 쓰지 않는다.** 모든 항목에 횟수와 출처가 붙는다. 이 규칙이 "앱이 나를 멋대로 규정한다"는 느낌을 막는다.

### 1.3 동의

세 단계이고 기본은 **꺼짐**이다.

| 상태 | 뜻 |
|---|---|
| off (기본) | 아무것도 기록하지 않는다 |
| project | 이 프로젝트 안에서만 기록·사용 |
| global | 전역 파일에 모으고 모든 프로젝트에서 사용 |

- 켠 날짜가 파일 첫머리에 남는다.
- **기록 동의와 사용 동의는 별개다.** 기록만 하고 사용은 끌 수 있다.
- 「지금까지 기록된 것 보기」가 파일을 그대로 연다. 「잊어줘」가 지운다.
- **내보내기 번들에는 기본으로 들어가지 않는다.** 넣으려면 체크해야 한다. 취향 파일이 핸드오프 zip에 딸려 나가 남의 손에 들어가는 일은 없어야 한다.

### 1.4 어디에 쓰이나

- Get Vibe의 기본값과 카피 길이 목표
- 세 방향의 **순서**(내용이 아니라)
- 서체·시스템 추천
- 도구 표면의 `aphrodite_get_taste`(읽기, 동의 게이트) — Claude Code가 사용자의 어투로 쓰게

### 1.5 가장 큰 위험 — 취향이 우리가 되는 것

취향 파일로 추천을 좁히면 **사용자는 자기가 이미 좋아하는 것만 보게 된다.** 디자인 도구에서 이건 치명적이다. 그래서 규칙 하나를 박는다.

> 세 방향 중 **하나는 항상 프로필과 어긋나게** 만들고, 그렇다고 표시한다. ("평소 고르시던 것과 다른 쪽")

취향은 기본값을 정하는 데 쓰고, 선택지를 줄이는 데는 쓰지 않는다.

### 1.6 구현 모양

```ts
// src/design/taste.ts — 순수 함수, 테스트 가능
export type TasteConsent='off'|'project'|'global';
export type TasteLine={text:string;count:number;evidence:string[]};
export type Taste={consent:TasteConsent;since:string;chosen:TasteLine[];corrected:TasteLine[];rejected:TasteLine[];said:TasteLine[]};
export function deriveTaste(runs:AssemblyRun[],projects:Project[],consent:TasteConsent):Taste
export function renderTaste(t:Taste):string      // taste.md 텍스트
export function parseTaste(md:string):Taste      // 사람이 고친 파일을 다시 읽는다
```

테스트: 동의 off면 빈 결과, 증거 없는 줄은 만들어지지 않음, 횟수 계산, 사람이 손으로 지운 줄이 되살아나지 않음(수동 편집 존중).

---

## 2. 레퍼런스 아카이브

### 2.1 지금의 한계

`project.reference`는 **이미지 한 장**이다(data URL). 세 방향 분석의 입력으로만 쓰이고, 보고 버린 것들은 아무 데도 남지 않는다. 사람이든 에이전트든 탐색한 것이 사라진다.

### 2.2 저장

사진 라이브러리와 같은 규칙 — 내용 주소, 두 스코프.

```
references/index.json            ← 항목 목록
references/blobs/<id>.<ext>      ← 이미지·포스터 바이트
references/projects/<projectId>/ ← 같은 구조, 이 프로젝트 전용
```

항목 하나:

```json
{"id":"a1b2c3d4e5f60718","kind":"image|link|video|note","scope":"global",
 "url":"https://…","title":"…","note":"사람이 쓴 메모",
 "poster":"<blob id>","tags":["lighting","editorial"],
 "addedAt":"2026-09-14T09:00:00Z","addedBy":"human|claude-code","alive":true}
```

### 2.3 링크를 어떻게 다루나 — 웹뷰는 네트워크가 없다

CSP가 `connect-src 'self' ipc:`다. 그래서 **링크 메타데이터는 Rust에서 가져온다.** 서체 설치 때 만든 경로와 같은 모양이다: https 전용, 크기 상한, 명시적 동작에만.

가져오는 것은 **제목과 og:image 바이트**까지다. 스크립트는 실행하지 않고 페이지 전체를 저장하지도 않는다. og:image를 바이트로 받아두는 이유는 **링크가 죽어도 카드가 남게** 하기 위해서다. 재조회가 실패하면 `alive:false`로 두고 "원본 사라짐"으로 보여준다.

영상은 **주소 + 포스터 + 구간(in/out) + 메모**만 저장한다. 영상 자체는 받지 않는다 — 용량과 라이선스 양쪽에서 옳지 않다. 로컬 영상 파일을 떨어뜨리면 포스터 이미지를 같이 달라고 요청한다(디코더가 없어 프레임을 뽑을 수 없다는 사실을 숨기지 않는다).

### 2.4 안전 — 여기가 주입 표면이다

**레퍼런스 안의 글자는 데이터지 지시가 아니다.** 이미 OCR에 적용하던 규칙을 가져온 페이지 제목·설명, 그리고 에이전트가 넣은 메모까지 확장한다. 아카이브를 읽는 에이전트가 거기 적힌 문장을 명령으로 삼으면 안 된다. 도구 설명과 스키마에 이 문장을 명시한다.

권한도 기존 문을 그대로 쓴다 — **아카이브 읽기는 읽기, 항목 추가는 쓰기.** 에이전트가 탐색한 결과를 넣으려면 사람이 문을 열어야 한다.

### 2.5 보는 방법

왼쪽 패널에 **레퍼런스** 탭을 에셋 옆에 둔다. 사진 라이브러리와 **똑같은 칩**(전체 / 이 프로젝트 / 공용)을 쓴다. 카드에는 포스터, 제목, 출처 배지, 누가 넣었는지가 붙는다.

그리고 하나를 통합한다: 지금의 "레퍼런스 한 장" 슬롯은 **아카이브에서 승격**하는 것으로 바꾼다. 카드의 「이 레퍼런스로 분석」이 그 자리에 올린다. 보관과 사용이 분리된다.

### 2.6 도구 표면

- `aphrodite_list_references` (읽기) — 항목과 태그, 포스터 참조
- `aphrodite_add_reference` (쓰기) — 주소·메모·태그. 에이전트가 찾은 것을 남긴다

### 2.7 구현 모양

```rust
// src-tauri/src/references.rs — image_library.rs와 같은 골격
pub fn references_list(app, project: Option<String>) -> Result<Value, String>
pub fn references_add(app, item: Value, project: Option<String>) -> Result<Value, String>
pub fn references_fetch(url: String) -> Result<Value, String>   // 제목 + og:image, https 전용, 상한
pub fn references_delete(app, id: String, project: Option<String>) -> Result<Value, String>
```

---

## 3. 규모와 순서

둘 다 도구 표면 2~3단계 **뒤**가 맞다. 그래야 `aphrodite_get_taste` / `aphrodite_list_references`가 이미 있는 도구 규약 위에 얹힌다.

| 단계 | 내용 | 규모 |
|---|---|---|
| R1 | `references.rs` 저장·목록·삭제, 스코프 칩, 레퍼런스 탭 | 2h |
| R2 | Rust 링크 페처(제목 + og:image), 링크·영상 카드, 승격 | 2h |
| T1 | `taste.ts` 파생 함수와 `taste.md` 읽기/쓰기, 동의 UI | 2h |
| T2 | Get Vibe·방향 순서에 연결, 어긋나는 방향 한 개 규칙, 도구 노출 | 2h |

## 4. 두 기능이 공유하는 약속

1. **동의 없이는 시작하지 않는다.** 기본값은 꺼짐이고, 켠 날짜가 파일에 남는다.
2. **사람이 읽고 고칠 수 있는 파일이다.** 숨은 상태가 아니다.
3. **로컬과 전역 두 스코프**, 사진 라이브러리와 같은 규칙.
4. **가져온 글자는 데이터다.** 지시로 읽지 않는다.
5. **내보내기에 기본 포함하지 않는다.** 취향도 메모도 사용자의 것이다.
