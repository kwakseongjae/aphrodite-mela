import type {Block} from '../model';
import type {EditorCommand} from './commands';
import {canParent} from '../layout';
export function layerMove(blocks:Block[],id:string,targetId:string,after=false):EditorCommand|null{
 const target=blocks.find(b=>b.id===targetId);
 if(!target||id===targetId||!blocks.some(b=>b.id===id)||!canParent(blocks,id,target.parentId))return null;
 const siblings=blocks.filter(b=>b.parentId===target.parentId&&b.id!==id);
 const beforeId=after?siblings[siblings.indexOf(target)+1]?.id:target.id;
 return {type:'move',id,parentId:target.parentId,beforeId};
}
/** Pointer events work in WKWebView without OS file-drag interception. Commit only on release. */
export function mountLayerReorder(root:HTMLElement,blocks:Block[],commit:(c:EditorCommand)=>boolean,announce:(message:string)=>void,ko=false){
 let active:{id:string;pointer:number;x:number;y:number;moved:boolean;command:EditorCommand|null}|undefined;
 const reset=()=>{root.querySelectorAll('.layer-drop-before,.layer-drop-after').forEach(el=>el.classList.remove('layer-drop-before','layer-drop-after'));};
 root.addEventListener('pointerdown',e=>{
  if(e.button!==0||!(e.target as HTMLElement).closest('[data-layer-grip]'))return;
  const row=(e.target as HTMLElement).closest<HTMLElement>('[data-layer-id]');if(!row)return;
  active={id:row.dataset.layerId!,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false,command:null};
  e.preventDefault();root.setPointerCapture(e.pointerId);
 });
 const update=(e:PointerEvent)=>{
  if(!active||active.pointer!==e.pointerId)return;
  active.moved ||= Math.hypot(e.clientX-active.x,e.clientY-active.y)>4;if(!active.moved)return;
  reset();const row=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-layer-id]');
  active.command=null;if(!row||!root.contains(row))return;
  const after=e.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;
  active.command=layerMove(blocks,active.id,row.dataset.layerId!,after);
  if(active.command)row.classList.add(after?'layer-drop-after':'layer-drop-before');
 };
 root.addEventListener('pointermove',update);
 root.addEventListener('pointerup',e=>{
  update(e);if(!active||active.pointer!==e.pointerId)return;const completed=active;active=undefined;reset();
  if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);
  if(!completed.moved)return;
  const changed=completed.command&&commit(completed.command);
  announce(changed?(ko?'레이어 순서 변경 · 실행 취소 가능':'Layer order changed · Undo available'):(ko?'이동할 수 없거나 같은 위치입니다.':'Move rejected or unchanged.'));
 });
 const cancel=()=>{if(active&&root.hasPointerCapture(active.pointer))root.releasePointerCapture(active.pointer);active=undefined;reset();};
 root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);
 root.addEventListener('keydown',e=>{
  if(e.key==='Escape'){cancel();return;}
  if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
  const row=(e.target as HTMLElement).closest<HTMLElement>('[data-layer-id]'),b=blocks.find(b=>b.id===row?.dataset.layerId);if(!b)return;
  e.preventDefault();const siblings=blocks.filter(n=>n.parentId===b.parentId),next=siblings[siblings.indexOf(b)+(e.key==='ArrowUp'?-1:1)];
  const command=next&&layerMove(blocks,b.id,next.id,e.key==='ArrowDown');if(command)commit(command);
 });
}
