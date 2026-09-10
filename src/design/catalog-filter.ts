import {catalog} from '../model';
import {providers} from '../providers';
import {catalogGroup,implementations} from './component-explorer';
export type CatalogFilter={query:string;provider:string};
export const emptyCatalogFilter:CatalogFilter={query:'',provider:'all'};
const aliases:Record<string,string>={button:'버튼 액션',input:'입력 필드 폼',cards:'카드 콘텐츠',hero:'히어로 랜딩',frame:'프레임 레이아웃',navigation:'메뉴 탐색',footer:'푸터',products:'상품 제품',features:'기능 특징',table:'표 테이블',calendar:'일정 달력',stats:'통계 지표'};
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
