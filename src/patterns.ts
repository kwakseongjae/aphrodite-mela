/** Aphrodite-owned patterns. References inform conventions, not vendor implementations. */
import {moaSpecs} from './moa-specs';
export const patternSpecs = {
  ...moaSpecs,
  button: { name: 'Action button', icon: 'mouse-pointer-2', category: 'Inputs', variants: ['solid', 'outline', 'ghost'], states: ['default', 'disabled', 'loading'], title: '변경 사항 저장', text: '로컬 프로토타입 동작입니다.', label: '저장', help: 'Heading: 접근성 이름 · Label: 버튼 문구 · Content: 클릭 후 표시할 안내' },
  input: { name: 'Input field', icon: 'text-cursor-input', category: 'Inputs', variants: ['outlined', 'filled', 'search'], states: ['default', 'disabled', 'error'], title: '프로젝트 이름', text: '팀에서 알아볼 수 있는 이름을 입력하세요.', label: '예: 모아', help: 'Heading: 입력 라벨 · Label: placeholder · Content: 도움말 / 오류' },
  tabs: { name: 'View switcher', icon: 'panel-top', category: 'Navigation', variants: ['underline', 'segmented'], states: ['default', 'disabled'], title: '프로젝트 보기', text: '개요|프로젝트의 주요 내용을 확인하세요.\n활동|팀의 최근 활동을 확인하세요.\n설정|프로젝트 설정을 관리하세요.', label: '보기 선택', help: '한 줄에 탭 이름|패널 내용. 키보드 방향키로 선택할 수 있는 radio 기반 전환입니다.' },
  cards: { name: 'Content cards', icon: 'panels-top-left', category: 'Data display', variants: ['outlined', 'elevated', 'list'], states: ['default', 'empty', 'loading', 'error'], title: '팀 프로젝트', text: '웹사이트 개편|첫 화면의 방향을 검토합니다.\n디자인 시스템|팀의 공통 언어를 만듭니다.\n제품 출시|다음 단계를 함께 준비합니다.', label: '프로젝트', help: '한 줄에 카드 제목|설명. Columns로 열 수, Density로 간격을 조절합니다.' },
  stats: { name: 'Metric cards', icon: 'chart-no-axes-column', category: 'Data display', variants: ['plain', 'outlined', 'tinted'], states: ['default', 'loading', 'empty'], title: '이번 주 요약', text: '진행 중|12|샘플 데이터\n완료|8|샘플 데이터\n대기|3|샘플 데이터', label: '샘플 지표', help: '한 줄에 지표명|값|설명. 실제 데이터 연동은 포함되지 않습니다.' },
  table: { name: 'Task table', icon: 'table', category: 'Data display', variants: ['comfortable', 'compact', 'striped'], states: ['default', 'empty', 'loading', 'error'], title: '팀 업무', text: '랜딩페이지 검토|지연|진행 중\n디자인 토큰 정리|민수|완료\n출시 체크리스트|서연|대기', label: '업무 검색', help: '한 줄에 업무|담당자|상태. 미리보기·export에서 검색/상태 필터가 동작합니다.' },
  calendar: { name: 'Planning board', icon: 'calendar-days', category: 'Product UI', variants: ['week', 'agenda', 'board'], states: ['default', 'empty', 'loading', 'error'], title: '이번 주 계획', text: '월|기획안 초안 작성|진행 중\n화|디자인 시안 검토|대기\n수|개발 작업 진행|진행 중\n목|중간 점검 회의|대기\n금|팀 업데이트 공유|완료', label: '제품 미리보기 · 샘플 일정', help: '한 줄에 요일|업무|상태. week/agenda/board로 배치 변경; 실제 날짜 계산·드래그 일정 변경은 범위 밖입니다.' },
  notice: { name: 'Status message', icon: 'info', category: 'Feedback', variants: ['info', 'success', 'warning', 'error'], states: ['default', 'loading', 'empty'], title: '변경 사항을 확인하세요', text: '이 화면은 실제 데이터가 아닌 시각 프로토타입입니다.', label: '안내', help: 'Heading: 상태 제목 · Content: 설명. 상태는 색상뿐 아니라 텍스트로도 표시합니다.' },
} as const;
export type PatternKind = keyof typeof patternSpecs;
export const isPattern = (kind: string): kind is PatternKind => Object.hasOwn(patternSpecs, kind);
export const patternVariants = (kind: string): readonly string[] => isPattern(kind) ? patternSpecs[kind].variants : kind === 'hero' ? ['split', 'image-left', 'stacked','editorial-wide'] : kind==='products'?['default','editorial']:kind==='frame'?['default','app-shell','app-main','app-board','app-lane']:['default'];
export const patternStates = (kind: string): readonly string[] => isPattern(kind) ? patternSpecs[kind].states : ['default'];
export type PatternOptions = { density?: 'comfortable' | 'compact'; columns?: 1 | 2 | 3 | 4; state?: string; media?: 'image' | 'calendar'; mediaText?: string; placeholder?: string };
export function validOptions(value: unknown, kind: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as PatternOptions;
  if (Object.keys(o).some(k => !['density', 'columns', 'state', 'media', 'mediaText', 'placeholder'].includes(k))) return false;
  return (o.density === undefined || ['comfortable', 'compact'].includes(o.density)) &&
    (o.columns === undefined || [1, 2, 3, 4].includes(o.columns)) &&
    (o.state === undefined || patternStates(kind).includes(o.state)) &&
    (o.media === undefined || (kind === 'hero' && ['image', 'calendar'].includes(o.media))) &&
    (o.mediaText === undefined || (kind === 'hero' && typeof o.mediaText === 'string' && o.mediaText.length <= 20000)) &&
    (o.placeholder === undefined || (typeof o.placeholder === 'string' && o.placeholder.length <= 200));
}
