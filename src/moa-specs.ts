export const moaSpecs={
 moasidebar:{name:'App sidebar',icon:'panel-left',category:'App recipes',variants:['default'],states:['default'],title:'모아',text:'프로덕트 팀',label:'워크스페이스',help:'브랜드와 워크스페이스 이름. 자체 구현 앱 패턴입니다.'},
 moatoolbar:{name:'App toolbar',icon:'list-filter',category:'App recipes',variants:['default'],states:['default'],title:'이번 주의 실행 계획',text:'9월 7일 – 11일, 2026',label:'주간 보드',help:'Preview에서 검색·상태 필터·보드/리스트 전환。지표는 카드에서 계산됩니다.'},
 moacard:{name:'Task card',icon:'square-check',category:'App recipes',variants:['default'],states:['default'],title:'온보딩 플로우 설계',text:'디자인 시스템|새로운 팀원이 첫 작업까지 자연스럽게 도달하도록 흐름을 정리합니다.|지연|진행 중|높음',label:'오전 11:00',help:'Content: 프로젝트|설명|담당자|상태|우선순위. Preview 변경은 세션 한정이며 export 초안에는 반영되지 않습니다.'},
 moadetail:{name:'Task detail',icon:'panel-right',category:'App recipes',variants:['default'],states:['default'],title:'작업 상세',text:'카드를 선택하면 상세 내용을 확인할 수 있습니다.',label:'미리보기 변경은 세션 한정',help:'같은 앱 셸의 선택 카드와 연결됩니다. 실제 백엔드 저장은 없습니다.'},
} as const;
