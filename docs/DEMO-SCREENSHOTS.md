# Aphrodite 실제 동작 스크린샷

2026-09-08, macOS release 앱을 직접 조작하며 촬영했다. 합성 목업이나 생성 이미지가 아니라 `tauri://localhost`에서 실행되는 앱 화면이다. 촬영용으로 추가한 페이지와 스타일 변경은 Undo로 되돌렸다. Auto fill은 고정 로컬 샘플이며 AI 이미지 분석·생성을 시연한 것이 아니다.

## 1. 기본 작업대

컴포넌트 라이브러리, 중앙 캔버스, 공유 토큰과 속성 편집기.

![기본 작업대](/Users/kwakseongjae/Desktop/projects/aphrodite-mela/artifacts/demo-2026-09-08/01-workbench.jpg)

## 2. Brief → 편집 가능한 초안

Start from a brief → 가구 브랜드 쇼핑몰 → Assemble a new draft. Home을 유지하면서 Draft 2에 Navigation, Hero, Collection, Features, Footer가 생긴다. 현재는 키워드별 템플릿 규칙이다.

![초안](/Users/kwakseongjae/Desktop/projects/aphrodite-mela/artifacts/demo-2026-09-08/02-draft.jpg)

## 3. Auto fill → 카피와 이미지 채우기

Auto fill → 기본 copy/images 체크 → Fill this page. 플레이스홀더가 Form & Field 샘플 문구와 로컬 사진으로 바뀐다.

![Auto fill 결과](/Users/kwakseongjae/Desktop/projects/aphrodite-mela/artifacts/demo-2026-09-08/03-autofilled.jpg)

## 4. 디자인 시스템 선택

![시스템 선택](/Users/kwakseongjae/Desktop/projects/aphrodite-mela/artifacts/demo-2026-09-08/04-systems.jpg)

## 5. 같은 화면에 Toss inspired 적용

파란 primary, 흰 배경, sans-serif, 12px radius가 적용된다. 공식 Toss 컴포넌트를 이식한 것이 아닌 자체 프리셋이다.

![스타일 변경](/Users/kwakseongjae/Desktop/projects/aphrodite-mela/artifacts/demo-2026-09-08/05-toss-style.jpg)

## 6. 모바일 375px

같은 블록이 좁은 컨테이너에 맞춰 재배치된다. 사진은 본문 아래로 내려가므로 첫 뷰포트에 보이지 않는다.

![모바일](/Users/kwakseongjae/Desktop/projects/aphrodite-mela/artifacts/demo-2026-09-08/06-mobile.jpg)

## 7. Export

실제 프로젝트 상태에서 프롬프트가 생성되고 DESIGN.md / HTML을 확인할 수 있다. 사용자 승인을 대신하지 않도록 Draft 상태 그대로 촬영했다. 이번 시연에서는 새 ZIP 저장이나 외부 전송을 하지 않았다.

![내보내기](/Users/kwakseongjae/Desktop/projects/aphrodite-mela/artifacts/demo-2026-09-08/07-handoff.jpg)
