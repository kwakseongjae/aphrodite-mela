# B3 반복 수정 검증 — 2026-09-09

## 판정

반복 수정·보존·실제 내보내기 검수는 통과. 베타 출시, 브랜드 완성도, 시간/토큰 절감 검증 완료는 아님.
원본 B2를 복제한 `B3 · Matched iteration trial`에서만 작업했다. 사용자 승인 버튼은 누르지 않았고 최종 ZIP도 Draft다.

## 실제 진행

1. 기존 5개 섹션을 유지한 채 프로젝트 기본색을 초록에서 파랑 #2255cc로 비교·적용.
2. 상담 버튼을 추가하고 문구를 입력한 뒤 own → 공식 MUI로 교체, Footer 앞으로 이동.
3. 제작 과정 CTA를 추가하고 Features 다음, 상담 버튼 앞에 배치.
4. 네이티브 미리보기, 앱 재시작, 각 단계 ZIP 저장, 실제 HTML 브라우저 확인, 프로젝트/SCENE 구조 비교.

최종 순서: navigation → hero → products → features → cta → MUI button → footer.
5개 실제 ZIP을 검사했고 기존 5/5 블록의 모든 필드와 다른 페이지는 동일했다. 마지막 렌더러 수정도 페이지/토큰을 변경하지 않았다. SCENE의 모든 instanceId/parentId가 프로젝트와 일치한다.

## 관측 시간과 한계

| 이터레이션 | 조작 시작→적용 체크포인트 | 추가 비용 |
|---|---:|---|
| 파랑 비교·적용 | 40.938초 | 사전 준비·ZIP 저장 제외 |
| 버튼 추가·문구·MUI 교체 | 85.692초 | 미리보기 오류 해결 후 확인까지 총 473.428초 |
| 하단 CTA 추가·배치 | 40.290초 | 화면 확인까지 71.174초 |

`artifacts/b3-iteration/timings.json`에 UTC 체크포인트를 보관했다. 이 수치는 도구 왕복을 포함하며 전체 작업 시간이 아니다. 이후 앵커 수정·빌드·재검증 시간도 별도 발생했다. 약 3분 만에 전체 완성했다는 해석은 틀리다.
실제 앱 로그는 `artifacts/b2-bilingual/theme-handoff-export/b3-iteration-run.json`; 모든 Computer Use 동작이나 이후 디버깅을 포괄하는 로그는 아니다. 토큰 사용량과 사람의 정신적 부담은 측정하지 않았다.

## 발견·수정한 결함

- 긴 네이티브 미리보기에서 모달 전체가 흐려지거나 사라졌다. 배경 blur 제거만으로는 해결되지 않았고 native modal의 레이어/애니메이션 처리까지 수정한 후 실제 화면이 정상화됐다.
- CTA 추가로 기존 View all의 자동 목적지가 바뀌었다. 페이지 순서가 아니라 collection/contact별 우선순위로 데모 앵커를 결정한다. 회귀 테스트 2개 추가.
- 네이티브 Shadow DOM 내부 링크가 실제 스크롤로 이어지지 않았다. 원시 fragment와 composedPath를 사용하고 미리보기 호스트만 명시적으로 스크롤하도록 수정. 최종 빌드62294에서 View all 클릭→Footer 화면 확인.
- 독립 정적 코드 대조본의 문자열 replace가 번들 속 `$&`를 치환해 iframe/CTA를 깨뜨렸다. 함수형 replacer로 수정하고 브라우저 DOM에서 CTA와 MUI 버튼 표시를 재확인했다.

## 증거

실제 네이티브 저장본: `artifacts/b2-bilingual/theme-handoff-export/b3-04-verified.zip`.
압축 해제: `artifacts/b3-iteration/04-verified/`.
검사: `npx tsx scripts/verify-b3-iterations.ts` 통과, TypeScript 테스트 88/88 통과. 최종 데스크탑 빌드 완료·재실행.
브라우저 1440/375 너비 모두 문서 가로 넘침 없음. 기존 사진 2개 로드 성공, 원래 비어 있던 상품 이미지 2개는 그대로 빈 슬롯이다.

실제 화면은 다음 파일을 사용한다:

- `artifacts/b3-iteration/04-hero-viewport.png`
- `artifacts/b3-iteration/04-below-fold-viewport.png`
- `artifacts/b3-iteration/04-mobile-viewport.png`
- `artifacts/b3-iteration/04-native-anchor-verified.png`

주의: `04-final-desktop.png`, `04-final-mobile.png`는 전체 페이지 캡처 도구의 중복/여백 및 iframe 누락이 관찰되어 검수 증거에서 제외한다. 위의 단일 뷰포트 캡처와 실제 페이지가 기준이다. 이번 증거는 스크린샷이며 연속 녹화 영상이 아니다.

## 직접 코드 대조본의 범위

`scripts/build-b3-direct-control.mjs`와 `artifacts/b3-iteration/direct-control/button.tsx`는 원본 HTML/CSS에 정적 변경을 적용하고 MUI를 직접 import한다. Aphrodite 프로젝트 모델/렌더러를 호출하지 않는다. 다만 이미 완성된 기준 HTML과 설치된 패키지를 재사용했고 앞선 실험의 학습 효과가 있으므로 새 이미지→코드 구현과의 공정한 속도 A/B가 아니다. 편집 가능한 프로젝트/SCENE 동기화도 제공하지 않는다. 속도 우열이나 토큰 절감률을 발표할 근거로 사용하지 않는다.

## 다음 goal / 품질 기준

1. 공식 컴포넌트의 전시용 wrapper와 실제 배치용 control을 구분. 프로젝트 글꼴·spacing·surface를 반영하되 source/project/custom 정책과 Undo를 유지한다. 현재 MUI 제목/여백은 브랜드와 어울리지 않는다.
2. 사용자가 의도한 실제 링크를 명시하는 모델 마련. 현재 Our story/Journal/상담은 데모이며 실제 페이지나 예약 서비스가 아니다.
3. 브랜드 접합 개선 후 동일 변경 브리프를 여러 레퍼런스에 반복. 전체 준비·검수·실패 복구 시간을 모두 기록하고 독립 직접 구현 조건을 고정한다.
4. 사용자에게 재지시 횟수·전면 재작업 필요 여부·정신적 부담을 직접 평가받는다. 에이전트가 사용자 만족 점수를 대신 매기지 않는다.

이번 청크는 shadow-git-sandbox로 변경 전 보호 스냅샷을 만들고, vercel-react-best-practices의 직접 import 지침을 독립 MUI 대조본에 적용했다.
