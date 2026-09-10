import type {Project} from '../model';
import {parseCatalogChoice,type CatalogChoice} from './component-explorer';
export type ShelfChoice=CatalogChoice;
export const SHELF_PAGE_SIZE=4;
/** Bound live preview renderers; all choices remain reachable by explicit paging. */
export function shelfPage(items:readonly ShelfChoice[],requested:number){
 const pages=Math.max(1,Math.ceil(items.length/SHELF_PAGE_SIZE));
 const page=Math.max(0,Math.min(pages-1,Number.isFinite(requested)?Math.trunc(requested):0));
 return {page,pages,items:items.slice(page*SHELF_PAGE_SIZE,(page+1)*SHELF_PAGE_SIZE).map((choice,i)=>({choice,index:page*SHELF_PAGE_SIZE+i}))};
}
const key=(c:ShelfChoice)=>`${c.kind}:${c.provider}:${c.variant}`;
export function validShelf(value:unknown):value is ShelfChoice[]{
 return Array.isArray(value)&&value.length<=12&&value.every(c=>c&&typeof c==='object'&&Object.keys(c).every(k=>['kind','provider','variant'].includes(k))&&parseCatalogChoice(JSON.stringify(c))!==null)&&new Set(value.map(key)).size===value.length;
}
export function pinShelf(p:Project,c:ShelfChoice):'added'|'duplicate'|'full'{
 if(!validShelf([c]))throw new Error('Invalid shelf choice');
 const items=p.shelf??[];if(items.some(x=>key(x)===key(c)))return 'duplicate';
 if(items.length>=12)return 'full';p.shelf=[...items,{...c}];return 'added';
}
/** Canvas history never rewinds project-owned working selections. */
export function preserveShelf(restored:Project,current:Project){
 if(restored.id!==current.id)throw new Error('History belongs to another project');
 if(current.shelf)restored.shelf=current.shelf.map(c=>({...c}));else delete restored.shelf;
 return restored;
}
