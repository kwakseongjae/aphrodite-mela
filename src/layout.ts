import type { Block } from './model';
export type Layout = { width?: number; widthPx?:number; height?: number; gap?: number; padding?: number; columns?: number; mode?: 'flow'|'free'; x?: number; y?: number };
export function validLayout(v: unknown): v is Layout {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const limits: Record<string, [number,number]> = {width:[10,100],widthPx:[64,2000],height:[100,2000],gap:[0,96],padding:[0,96],columns:[1,4],x:[0,1500],y:[0,1500]};
  return Object.entries(v).every(([k,n]) => k==='mode' ? ['flow','free'].includes(n) : k in limits && Number.isInteger(n) && n>=limits[k][0] && n<=limits[k][1]);
}
export function canParent(blocks: Block[], id: string, parentId?: string): boolean {
  if (!parentId) return true;
  const parent=blocks.find(b=>b.id===parentId);
  if (parent?.kind!=='frame') return false;
  let cursor: string|undefined=parentId; const seen=new Set([id]);
  while(cursor) { if(seen.has(cursor) || seen.size>6) return false; seen.add(cursor); cursor=blocks.find(b=>b.id===cursor)?.parentId; }
  // Moving a populated frame must not make its descendants exceed the depth bound.
  return blocks.every(b=>{
    let current: string|undefined=b.id,depth=0;const visited=new Set<string>();
    while(current){if(visited.has(current)||depth++>6)return false;visited.add(current);current=current===id?parentId:blocks.find(x=>x.id===current)?.parentId;}
    return true;
  });
}
export function validateTree(blocks: Block[]): boolean {
  return blocks.every(b=>canParent(blocks,b.id,b.parentId));
}
export function layoutStyle(b: Block, blocks: Block[]): string {
  const l=b.layout??{}, parent=blocks.find(p=>p.id===b.parentId);
  return `width:${l.widthPx!==undefined?`${l.widthPx}px`:`${l.width??100}%`};min-width:0;${l.height!==undefined?`height:${l.height}px;overflow:auto;`:''}${parent?.layout?.mode==='free'?`position:absolute;left:${l.x??0}px;top:${l.y??0}px;`:''}`;
}
export function frameStyle(b: Block): string {
  const l=b.layout??{};
  return `position:relative;display:${l.mode==='free'?'block':'grid'};grid-template-columns:repeat(${l.columns??1},minmax(0,1fr));gap:${l.gap??16}px;padding:${l.padding??24}px;min-height:${l.height??240}px;`;
}
