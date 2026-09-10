import {catalog} from '../model';
import {providers} from '../providers';
import {catalogGroup,implementations} from './component-explorer';
export type CatalogFilter={query:string;provider:string};
export const emptyCatalogFilter:CatalogFilter={query:'',provider:'all'};
const aliases:Record<string,string>={button:'버튼 액션',input:'입력 필드 폼',cards:'카드 콘텐츠',hero:'히어로 랜딩',frame:'프레임 레이아웃',navigation:'메뉴 탐색',footer:'푸터',products:'상품 제품',features:'기능 특징',table:'표 테이블',calendar:'일정 달력',stats:'통계 지표',select:'선택 드롭다운',checkbox:'체크박스 선택',switch:'스위치 토글',textarea:'텍스트영역 메모',badge:'배지 상태',avatar:'아바타 프로필',breadcrumb:'경로 탐색',pagination:'페이지네이션 쪽',progress:'진행률 프로그레스',skeleton:'스켈레톤 로딩',accordion:'아코디언 접기',chips:'칩 태그',slider:'슬라이더 범위',stepper:'스테퍼 단계',toggle:'토글 전환'};
export function filteredKinds(group:string,filter:CatalogFilter){
 const tokens=filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return catalog.filter(c=>{
  if(group!=='All'&&catalogGroup(c.kind)!==group)return false;
  const rows=implementations(c.kind).filter(r=>filter.provider==='all'||r.provider===filter.provider);
  const text=[c.kind,c.name,c.description,aliases[c.kind]??'',...rows.map(r=>r.provider+' '+r.name)].join(' ').toLowerCase();
  return rows.length>0&&tokens.every(t=>text.includes(t));
 });
}
export function normalizeCatalogFilter(query:string,provider:string):CatalogFilter{return {query:query.slice(0,100),provider:provider==='all'||Object.hasOwn(providers,provider)?provider:'all'};}
