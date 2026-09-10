import {makeBlock,uid,type Page,type Block} from './model';
export function moaPage():Page{
 const blocks:Block[]=[];
 const frame=(title:string,variant:string,parentId?:string)=>{const b={...makeBlock('frame',true),title,variant,parentId,layout:{padding:0,gap:0}};blocks.push(b);return b;};
 const add=(kind:'moasidebar'|'moatoolbar'|'moacard'|'moadetail',parentId:string)=>{const b={...makeBlock(kind,true),parentId};blocks.push(b);return b;};
 const shell=frame('Moa workspace','app-shell');add('moasidebar',shell.id);
 const main=frame('Workspace content','app-main',shell.id);add('moatoolbar',main.id);
 const board=frame('Weekly board','app-board',main.id);
 const titles=['랜딩페이지 구조 검토','팀 업데이트 공유','사용자 인터뷰 정리','히어로 섹션 디자인','온보딩 플로우 설계','베타 테스트 계획','컴포넌트 상태 정의','반응형 레이아웃 점검','디자인 QA','출시 노트 작성'];
 const projects=['웹사이트 개편','제품 출시','디자인 시스템','웹사이트 개편','디자인 시스템','제품 출시','디자인 시스템','웹사이트 개편','디자인 시스템','제품 출시'];
 const descriptions=['주요 섹션 구성과 카피를 검토하고 개선안을 정리합니다.','이번 주 진행 상황을 정리해 팀에 공유합니다.','인터뷰 내용을 취합하고 인사이트를 정리합니다.','랜딩 페이지의 히어로 섹션 시안을 제작합니다.','새로운 팀원이 첫 작업까지 자연스럽게 도달하도록 흐름을 정리합니다.','테스트 대상과 일정을 확정하고 준비 사항을 정리합니다.','버튼, 입력창 등 주요 컴포넌트의 상태를 정의합니다.','주요 브레이크포인트에서 레이아웃을 점검합니다.','구현된 화면을 기준으로 디자인 QA를 진행합니다.','주요 변경 사항을 정리해 릴리스 노트를 작성합니다.'];
 for(let day=0;day<5;day++){const lane=frame(`${['월','화','수','목','금'][day]}  ${day+7}`,'app-lane',board.id);for(let j=0;j<2;j++){const i=day*2+j,b=add('moacard',lane.id);b.title=titles[i];b.text=[projects[i],descriptions[i],['현승','민경','지연'][i%3],['진행 중','완료','검토 대기'][i%3],i%2?'보통':'높음'].join('|');b.label=j?'오후 4:00':'오전 11:00';}}
 add('moadetail',shell.id);return {id:uid(),name:'Moa · Weekly workspace',blocks};
}
