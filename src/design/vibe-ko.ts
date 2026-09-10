import type {VibePack} from './vibe';

// Authored demo translations. These never translate arbitrary user content.
export const koreanVibeCopy:Record<string,VibePack['copy']>={
 lighting:{
 navigation:{title:'FORME',text:'컬렉션 · 브랜드 이야기 · 저널',label:'둘러보기'},
 hero:{title:'공간에 의미를 더하는 빛',text:'일상에 따뜻함과 개성을 더하는 조각 같은 조명. 나만의 공간을 완성하는 빛을 만나보세요.',label:'컬렉션 둘러보기'},
 features:{title:'섬세한 빛, 따뜻한 일상',text:'조각 같은 형태|공간에 개성을 더하는 실루엣을 만나보세요.\n따뜻한 분위기|일상의 공간을 위한 영감을 찾아보세요.\n나만의 시선|나에게 어울리는 빛을 골라보세요.',label:'일상을 바라보는 새로운 시선'},
 products:{title:'일상을 위한 오브제',text:'아크 펜던트|$780\n헤일로 테이블|$620\n폴드 월|$480',label:'컬렉션'},
 cta:{title:'더 부드러운 빛, 더 환한 일상',text:'당신의 공간을 위한 조명 컬렉션을 만나보세요.',label:'나에게 맞는 조명 찾기'},
 footer:{title:'FORME',text:'오래 보아도 좋은 형태, 세심하게 다듬은 디테일.',label:'© 2026 FORME · 데모'},
 button:{title:'컬렉션 둘러보기',text:'프로토타입 버튼입니다. 출시 전 실제 목적지를 연결하세요.',label:'컬렉션 둘러보기'},
 input:{title:'이메일 주소',text:'새 컬렉션 소식을 받아보세요. 데모 화면입니다.',label:'you@example.com'}},
 commerce:{
 stats:{title:'스토어 현황',text:'매출|$128,430|이번 달 데모\n주문|1,842|데모 주문\n전환율|3.84%|데모 비율',label:'데모 데이터'},
 cards:{title:'인기 상품',text:'스톤웨어 식기 세트|420개 · $29,358\n조각 테이블 조명|312개 · $21,528\n데일리 토트백|286개 · $10,296',label:'상품 현황'},
 input:{title:'상품 검색',text:'데모 카탈로그를 검색하세요.',label:'상품 이름'},
 button:{title:'보고서 내보내기',text:'실제 매출 데이터가 없는 데모 동작입니다.',label:'보고서 내보내기'},
 notice:{title:'좋은 흐름을 이어가고 있어요',text:'가상 데이터에서 매출이 18.6% 증가했습니다. 게시 전 검증된 데이터로 바꾸세요.',label:'데모 인사이트'}},
 travel:{
 navigation:{title:'Wanderly',text:'숙소 · 체험 · 저장 목록',label:'내 계정'},
 hero:{title:'머물고 싶은 곳을 찾아서',text:'마요르카의 숙소 컬렉션을 둘러보세요. 시각 검토를 위한 가상 목록입니다.',label:'숙소 찾기'},
 products:{title:'마요르카의 숙소',text:'카사 데 라 칼마|$245 / 1박\n디 올리브 하우스|$189 / 1박\n칼라 비스타|$275 / 1박',label:'데모 컬렉션'},
 input:{title:'여행지',text:'다음 여행을 시작할 곳을 골라보세요.',label:'스페인 마요르카'},
 button:{title:'숙소 검색',text:'실시간 예약이나 잔여 객실 정보가 없는 데모입니다.',label:'검색'}}
};

export const englishWorkspaceCopy:VibePack['copy']={
 table:{title:'Launch preparation',text:'Review homepage|Jiyeon|In progress\nOrganize design tokens|Minsu|Done\nAccessibility checks|Seoyeon|Pending',label:'Search tasks'},
 cards:{title:'Website launch',text:'Polish the first screen|Review copy and visual hierarchy.\nResponsive implementation|Check mobile reading order.\nFinal QA|Verify keyboard navigation and export.',label:'Team project'},
 input:{title:'Project name',text:'Choose a name your team will recognize.',label:'e.g. Website launch'},
 button:{title:'Request review',text:'Local demo only. No message is sent to teammates.',label:'Request review'},
 notice:{title:'Ready for review',text:'Let a real user review the direction before continuing.',label:'Notice'}
};
