# Aphrodite

**Shape before you build.** 코딩 전에 디자인 방향을 조립하고 시각적으로 확인하는 Tauri 데스크톱 프로토타입.

## 실행

```sh
npm install
./script/build_and_run.sh
```

Codex의 Run 버튼도 같은 빌드·실행 스크립트를 사용한다. 개발 모드: `npm run desktop`.
브라우저로 실행: `npm run dev` → http://127.0.0.1:1420

```sh
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

macOS 빌드 산출물: `src-tauri/target/release/bundle/macos/Aphrodite.app` (DMG 번들 시에는 `bundle/dmg/`로 이동).
디버그 번들: `npx tauri build --debug --bundles app` → `src-tauri/target/debug/bundle/macos/Aphrodite.app`.
배포 서명·공증은 GitHub Actions 릴리스 워크플로에서 시크릿이 있을 때만 수행한다(아래 “다운로드와 배포”). Node 22.12+, Rust/Tauri 플랫폼 빌드 도구 및 macOS Swift 컴파일러가 필요하다. 현재 네이티브 OCR 빌드는 macOS 전용이다.

## 직접 써보기

1. 기본 Form & Field 프로젝트에서 Hero를 선택하고 오른쪽에서 문구를 바꾼다.
2. Components의 + 또는 드래그로 섹션을 추가한다. 오른쪽 버튼으로 순서 변경·복제·삭제한다.
3. 디자인 시스템을 바꾸거나 색상·타이포·반경을 편집한다. 같은 프로젝트의 모든 페이지에 적용된다.
4. Start from a brief로 목적을 입력하면 새 초안 페이지가 추가된다. Auto fill로 샘플 카피와 이미지를 넣는다.
5. 모바일 전환과 Preview에서 검토하고 Approve direction을 누른다.
6. Export에서 프롬프트를 복사하거나 ZIP을 저장한다. ZIP 안의 index.html은 로컬 이미지와 함께 오프라인으로 열린다.

프로젝트 메뉴에서 저장/열기/새 프로젝트. 페이지 옆 메뉴에서 이름 변경/복제/삭제. 에셋 탭에서 사진 선택. Undo/Redo는 버튼 또는 ⌘Z/⌘⇧Z. `/`로 컴포넌트 검색. 디자인 변경은 승인을 무효화한다.

### 레퍼런스 → 3안 비교

Reference → Upload reference 또는 Try a sample reference → Analyze reference. macOS에서는 Apple Vision으로 문구와 좌표를 읽고, 로컬 픽셀 분석으로 색상·이미지 영역 후보를 표시한다. 문구를 수정하고 필요한 경우에만 Use this media candidate를 체크한다. Compare 3 directions → Use direction 1/2/3으로 새 페이지를 추가한다. 원래 페이지와 토큰은 유지된다. 오른쪽 Composition에서 배치를 다시 바꿀 수 있다.

브라우저는 OCR 없이 Pixels only로 표시한다. 이미지 영역은 텍스처 기반 추정이지 의미 인식이나 정확한 객체 추출이 아니다. 비교안은 실제 컴포넌트의 3개 고정 배치 변형이며 생성 모델의 결과가 아니다. SCENE.json은 컴포넌트 ID·버전·변형·슬롯·분석 근거를 HTML과 함께 내보낸다.

## 현재 기능과 한계

실제 동작: 7종 블록, 삽입 DnD, 정렬 버튼, 속성 편집, 다중 페이지, 공유 토큰, 로컬 저장 및 JSON 왕복, PNG/JPG/WebP 업로드, 선택적 DESIGN.md 색상 파싱, 로컬 Auto fill, 미리보기, 승인 상태, ZIP export, 네이티브 파일 저장 대화상자.

아직 연결하지 않은 기능: 모델 기반 이미지/영상 생성·분석, 실제 OmD graph validator 및 전체 컴포넌트 계약, 인증/OAuth, 설치 가능한 Codex 플러그인, 백엔드·상품 결제·실제 사이트 라우팅. Brief는 키워드 규칙으로 구조를 고르고 Auto fill은 Form & Field 고정 샘플이다. 공식 브랜드 컴포넌트나 모델 연결을 가장하지 않는다.

프로젝트는 localStorage에 저장되며 별도 파일로 보관할 수 있다. 브라우저와 앱 저장 영역은 별개다. 업로드 이미지는 2MB 이하 PNG/JPG/WebP만 허용한다(앱 UI·네이티브 OCR 한도 동일). 프로젝트 가져오기는 20MB, 페이지 30개, 페이지당 블록 100개로 제한한다. 사용자가 임의로 고른 전경/배경 색상의 대비는 별도로 검토해야 한다. CTA 전경은 검정/흰색 중 대비가 좋은 값을 자동 선택한다.

## 다운로드와 배포

- 랜딩 페이지: `site/` (정적 HTML, EN/한국어 자동 전환). `main`에 푸시하면 `.github/workflows/pages.yml`이 GitHub Pages로 배포한다. 공개 주소는 `https://kwakseongjae.github.io/aphrodite-mela/`를 가정한다(저장소 이름이 바뀌면 `site/script.js`의 `REPO`와 `site/index.html`의 `og:*` 메타를 함께 바꾼다).
- 릴리스: `v0.1.0` 같은 태그를 푸시하면 `.github/workflows/release.yml`이 macOS 러너에서 Apple Silicon `.dmg`를 만들어 GitHub Release 초안에 첨부한다. `APPLE_*` 시크릿이 있으면 Developer ID 서명과 공증까지 수행하고, 없으면 ad-hoc 서명 상태로 남아 첫 실행 시 우클릭 → 열기가 필요하다.
- 로컬 DMG: `npx tauri build --bundles dmg` → `src-tauri/target/release/bundle/dmg/Aphrodite_<ver>_aarch64.dmg`.
- 최소 macOS 13.0(Ventura). OCR 헬퍼는 Tauri 사이드카(`bundle.externalBin`, 파일명 `src-tauri/bin/aphrodite-vision-<target-triple>`)로 번들되어 `Contents/MacOS/aphrodite-vision`에 놓이고 hardened runtime으로 함께 서명된다(공증 필수). `scripts/build-vision.mjs`가 `-target <arch>-apple-macos13.0`으로 컴파일하므로 빌드 머신의 OS 버전에 묶이지 않는다.
- 앱 아이콘 원본: `public/brand/app-icon-1024.png`. `npx tauri icon public/brand/app-icon-1024.png`로 `src-tauri/icons/`를 재생성한다.

## 로컬 전용 폴더

`lab/`는 git에 넣지 않는다(`.gitignore`). 실험 이미지, 검증 실행 결과, 네이티브 핸드오프 ZIP, 조각상 원본 모델이 여기 있다: `lab/artifacts/`, `lab/validation/`, `lab/sculpture/`, `lab/brand/`. 문서에 적힌 `artifacts/...`, `validation/...` 경로는 `lab/` 아래를 뜻한다. `scripts/*.mjs` 검증 스크립트는 `lab/artifacts/`에 쓰고 읽는다.

## 구조

- `src/model.ts`: 버전이 있는 프로젝트/시스템/페이지/블록, 가져오기 검증, 승인 변경 감지
- `src/render.ts` + `src/page.css`: 에디터와 export가 공유하는 HTML/CSS 렌더러
- `src/components.ts`: 자체 컴포넌트 registry와 SCENE.json 계약
- `src/reference.ts` + `src-tauri/native/ReferenceVision.swift`: 로컬 픽셀 분석 / 네이티브 OCR / 3안 조립
- `src/main.ts` + `src/style.css`: 작업대, 편집/히스토리/모달, 파일 UI
- `src/export.ts`: 프롬프트/구조적 DESIGN.md/HTML/JSON/에셋 ZIP, native save
- `src-tauri/`: Tauri 2 셸, CSP 및 최소 저장 권한
- `docs/PRODUCT.md`: 제품 정의, 이번 구현 범위, OmD와 agent 확장 로드맵
- `docs/COMPUTER-USE.md`: 에이전트 UI 조작 가이드
- `tests/model.test.ts`: 프로젝트 왕복·수입 검증·승인 무효화·토큰 파싱

오마이디자인 계약을 참고했지만 내보낸 DESIGN.md는 검증된 OmD Portable Core 또는 Bound System이라고 주장하지 않는다. OpenDesign의 로컬 작업 흐름을 참고해 독립 구현했다. 원본 코드의 포크가 아니다. 출처와 라이선스는 `THIRD_PARTY_NOTICES.md` 참고. 이 저장소의 코드는 MIT 라이선스(`LICENSE`)다.
