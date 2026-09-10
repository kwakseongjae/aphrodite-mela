import type {Block} from '../model';
import {canParent} from '../layout';
import {localDelta,resizeBox,clamp,type Box,type Handle} from './geometry';
import type {EditorCommand} from './commands';
import {nearestGuide,edgeVelocity} from './assists';
import './pointer-editor.css';
type Options={canvas:HTMLElement;blocks:Block[];selected:string;select:(id:string)=>void;commit:(c:EditorCommand)=>boolean;announce:(s:string)=>void;report?:(event:{outcome:'cancelled'|'no-op'|'rejected';gesture:string})=>void};
export function mountPointerEditor(o:Options):()=>void {
  const abort=new AbortController(),signal=abort.signal,canvas=o.canvas;
  canvas.classList.add('editor-design');
  const overlay=document.createElement('div');overlay.className='editor-selection';overlay.hidden=true;
  const hud=document.createElement('div');hud.className='editor-hud';hud.setAttribute('role','status');hud.setAttribute('aria-live','polite');hud.hidden=true;let hudTimer=0;const say=(text:string,transient=false)=>{hud.textContent=text;hud.hidden=false;clearTimeout(hudTimer);if(transient)hudTimer=window.setTimeout(()=>{hud.hidden=true;},1600);};
  document.body.append(overlay,hud);
  const guides=document.createElement('div');guides.className='editor-guides';document.body.append(guides);
  const wrap=()=>canvas.querySelector<HTMLElement>(`[data-block-id="${o.selected}"]`);
  const item=()=>wrap()?.parentElement;
  const block=o.blocks.find(b=>b.id===o.selected);
  const scroll=canvas.closest<HTMLElement>('.canvas-scroll')!;
  let active=false,frame=0,restore:(()=>void)|undefined;
  function position(){
    if(active)return;
    const el=item();const inert=!!document.querySelector('#app')?.hasAttribute('inert');if(inert)hud.hidden=true;if(!el||inert){overlay.hidden=true;return;}
    const r=el.getBoundingClientRect(),clip=scroll.getBoundingClientRect();
    overlay.hidden=r.bottom<clip.top+8||r.top>clip.bottom-8;
    Object.assign(overlay.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`,clipPath:`inset(${Math.max(-34,clip.top-r.top)}px ${Math.max(-14,r.right-clip.right)}px ${Math.max(-14,r.bottom-clip.bottom)}px ${Math.max(-14,clip.left-r.left)}px)`});
  }
  if(block){
    const move=document.createElement('button');move.className='editor-move';move.textContent=`↔ ${block.title.slice(0,30)}`;move.setAttribute('aria-label',`Move ${block.title}`);move.dataset.handle='move';overlay.append(move);
    for(const h of ['n','ne','e','se','s','sw','w','nw']){const b=document.createElement('button');b.className='editor-handle';b.dataset.handle=h;b.setAttribute('aria-label',`Resize ${block.title} ${h}`);overlay.append(b);}
  }
  canvas.addEventListener('click',e=>{
    if((e.target as HTMLElement).closest('[data-action]'))return;
    const el=(e.target as HTMLElement).closest<HTMLElement>('[data-block-id]');
    if(el){e.preventDefault();e.stopImmediatePropagation();o.select(el.dataset.blockId!);}
  },{capture:true,signal});
  // Geometry is transient until pointerup. No project mutations or React remounts during a gesture.
  overlay.addEventListener('pointerdown',e=>{
    const handle=(e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle;
    const selectedItem=item();if(!handle||!block||!selectedItem||e.button!==0)return;
    const el:HTMLElement=selectedItem;
    if(canvas.clientWidth<=650){return;}
    e.preventDefault();e.stopPropagation();active=true;
    const startPoint={x:e.clientX,y:e.clientY},rect=el.getBoundingClientRect();
    const scale=rect.width/el.offsetWidth;
    const parent=o.blocks.find(b=>b.id===block.parentId),free=parent?.layout?.mode==='free';
    const start:Box={x:block.layout?.x??0,y:block.layout?.y??0,width:el.offsetWidth,height:el.offsetHeight};
    const oldStyle=el.getAttribute('style')??'';
    const shield=document.createElement('div');shield.className='editor-gesture-shield';document.body.append(shield);
    overlay.setPointerCapture(e.pointerId);
    let next={...start},last={...startPoint},moved=false,target:HTMLElement|undefined,alt=e.altKey;
    let moveLeft=rect.left,moveTop=rect.top,previousTime=performance.now();
    const scrollStart={x:scroll.scrollLeft,y:scroll.scrollTop};
    const clearTargets=()=>canvas.querySelectorAll('.editor-drop-target').forEach(e=>e.classList.remove('editor-drop-target'));
    const restoreStyle=()=>{el.setAttribute('style',oldStyle);clearTargets();guides.replaceChildren();};restore=restoreStyle;
    function snap(left:number,top:number,width:number,height:number,mode:string,parentId?:string){
      const xs:number[]=[],ys:number[]=[];
      const parentElement=parentId?canvas.querySelector<HTMLElement>(`[data-block-id="${parentId}"] .layout-frame`):canvas;
      const candidates=[parentElement,...o.blocks.filter(b=>b.parentId===parentId&&b.id!==block!.id).map(b=>canvas.querySelector<HTMLElement>(`[data-block-id="${b.id}"]`)?.parentElement)];
      for(const candidate of candidates){if(!candidate||el.contains(candidate))continue;const r=candidate.getBoundingClientRect();xs.push(r.left,r.left+r.width/2,r.right);ys.push(r.top,r.top+r.height/2,r.bottom);}
      const xEdges=mode==='move'?[left,left+width/2,left+width]:mode.includes('e')?[left+width]:mode.includes('w')?[left]:[];
      const yEdges=mode==='move'?[top,top+height/2,top+height]:mode.includes('s')?[top+height]:mode.includes('n')?[top]:[];
      const x=alt?{delta:0}:nearestGuide(xEdges,xs),y=alt?{delta:0}:nearestGuide(yEdges,ys);
      guides.replaceChildren();const clip=scroll.getBoundingClientRect();
      for(const [axis,result] of [['x',x],['y',y]] as const){if(result.guide===undefined)continue;const line=document.createElement('div');line.className=`editor-guide ${axis}`;Object.assign(line.style,axis==='x'?{left:`${result.guide}px`,top:`${clip.top}px`,height:`${clip.height}px`}:{top:`${result.guide}px`,left:`${clip.left}px`,width:`${clip.width}px`});guides.append(line);}
      return {x:x.delta,y:y.delta};
    }
    function candidate():HTMLElement|undefined{
      // Ignore editor chrome and the moving subtree; choose the deepest eligible frame/peer.
      shield.style.pointerEvents='none';
      const hits=document.elementsFromPoint(last.x,last.y);shield.style.pointerEvents='';
      for(const hit of hits){const w=hit.closest<HTMLElement>('[data-block-id]');if(!w||el.contains(w)||!canvas.contains(w))continue;const b=o.blocks.find(b=>b.id===w.dataset.blockId);const parentId=b?.kind==='frame'?b.id:b?.parentId;if(b&&canParent(o.blocks,block!.id,parentId))return w;}
      return undefined;
    }
    function paint(schedule=true){
      if(!active)return;
      moved ||= Math.hypot(last.x-startPoint.x,last.y-startPoint.y)>=4;
      const now=performance.now(),dt=Math.min(32,now-previousTime)/1000;previousTime=now;
      if(moved&&schedule){const clip=scroll.getBoundingClientRect();if(last.x>=clip.left&&last.x<=clip.right&&last.y>=clip.top&&last.y<=clip.bottom){scroll.scrollLeft+=edgeVelocity(last.x,clip.left,clip.right)*dt;scroll.scrollTop+=edgeVelocity(last.y,clip.top,clip.bottom)*dt;}}
      const scrollDelta={x:scroll.scrollLeft-scrollStart.x,y:scroll.scrollTop-scrollStart.y};
      const delta=localDelta(startPoint,{x:last.x+scrollDelta.x,y:last.y+scrollDelta.y},scale);
      if(moved&&handle==='move'){
        clearTargets();target=candidate();target?.classList.add('editor-drop-target');
        moveLeft=rect.left+last.x-startPoint.x;moveTop=rect.top+last.y-startPoint.y;
        const t=o.blocks.find(b=>b.id===target?.dataset.blockId),pid=t?.kind==='frame'?t.id:t?.parentId;
        if(o.blocks.find(b=>b.id===pid)?.layout?.mode==='free'){const s=snap(moveLeft,moveTop,rect.width,rect.height,'move',pid);moveLeft+=s.x;moveTop+=s.y;}else guides.replaceChildren();
        Object.assign(overlay.style,{left:`${moveLeft}px`,top:`${moveTop}px`,clipPath:'none'});
        say(`이동 · ${target?.dataset.kind==='frame'?'프레임 안으로':'앞에 삽입'} · ${target?.getAttribute('aria-label')??'Page root'} · Alt 스냅 해제 · Esc 취소`);
      }else if(moved){
        next=resizeBox(start,delta,handle as Handle,free);
        const origin={x:rect.left-scrollDelta.x,y:rect.top-scrollDelta.y};
        const s=snap(origin.x+(next.x-start.x)*scale,origin.y+(next.y-start.y)*scale,next.width*scale,next.height*scale,handle!,block!.parentId);
        next=resizeBox(start,{x:delta.x+s.x/scale,y:delta.y+s.y/scale},handle as Handle,free);
        el.style.width=`${next.width}px`;el.style.height=`${next.height}px`;el.style.overflow='auto';
        if(free){el.style.left=`${next.x}px`;el.style.top=`${next.y}px`;}
        const r=el.getBoundingClientRect();Object.assign(overlay.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});
        say(`${next.width} × ${next.height} px${guides.childElementCount?' · 스냅':''}`);
      }
      if(schedule)frame=requestAnimationFrame(()=>paint());
    }
    frame=requestAnimationFrame(()=>paint());
    const gesture=new AbortController(),gs=gesture.signal;
    function commitKeepingViewport(command:EditorCommand){
      const left=scroll.scrollLeft,top=scroll.scrollTop;
      const changed=o.commit(command);
      const replacement=document.querySelector<HTMLElement>('.canvas-scroll');
      if(replacement){replacement.scrollLeft=left;replacement.scrollTop=top;replacement.dispatchEvent(new Event('scroll'));}
      return changed;
    }
    function finish(cancel:boolean){
      if(!active)return;active=false;cancelAnimationFrame(frame);gesture.abort();shield.remove();restoreStyle();restore=undefined;
      if(overlay.hasPointerCapture(e.pointerId))overlay.releasePointerCapture(e.pointerId);
      if(cancel||!moved){o.report?.({outcome:cancel?'cancelled':'no-op',gesture:handle!});position();if(cancel)say('취소됨 · 변경 사항 없음',true);else hud.hidden=true;return;}
      if(handle!=='move'){
        const layout={...block!.layout,widthPx:next.width,height:next.height};if(free){layout.x=next.x;layout.y=next.y;}
        if(commitKeepingViewport({type:'resize',id:block!.id,layout}))o.announce(`크기 저장됨 · ${next.width} × ${next.height}px`);else o.announce('변경 사항 없음 · 기존 크기 유지');
      }else{
        const r=canvas.getBoundingClientRect();
        if(last.x<r.left||last.x>r.right||last.y<r.top||last.y>r.bottom){o.report?.({outcome:'rejected',gesture:'move'});position();say('캔버스 밖입니다 · 이동 취소',true);return;}
        const t=o.blocks.find(b=>b.id===target?.dataset.blockId),parentId=t?.kind==='frame'?t.id:t?.parentId;
        const parent=o.blocks.find(b=>b.id===parentId);
        let x:number|undefined,y:number|undefined;
        if(parent?.layout?.mode==='free'){
          const container=canvas.querySelector<HTMLElement>(`[data-block-id="${parent.id}"] .layout-frame`)!;const pr=container.getBoundingClientRect();
          x=clamp(Math.round((moveLeft-pr.left)/scale),0,1500);y=clamp(Math.round((moveTop-pr.top)/scale),0,1500);
        }
        if(commitKeepingViewport({type:'move',id:block!.id,parentId,beforeId:t?.kind==='frame'?undefined:t?.id,x,y}))o.announce('컴포넌트 이동됨 · Undo로 복구');else o.announce('이동할 수 없습니다 · 기존 위치 유지');
      }
    }
    overlay.addEventListener('pointermove',ev=>{if(ev.pointerId===e.pointerId){last={x:ev.clientX,y:ev.clientY};alt=ev.altKey;}},{signal:gs});
    overlay.addEventListener('pointerup',ev=>{if(ev.pointerId!==e.pointerId)return;last={x:ev.clientX,y:ev.clientY};alt=ev.altKey;paint(false);finish(false);},{signal:gs});
    overlay.addEventListener('pointercancel',()=>finish(true),{signal:gs});
    overlay.addEventListener('lostpointercapture',()=>finish(true),{signal:gs});
    window.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopImmediatePropagation();finish(true);}else if(ev.metaKey||ev.ctrlKey){ev.preventDefault();ev.stopImmediatePropagation();}},{capture:true,signal:gs});
    window.addEventListener('blur',()=>finish(true),{signal:gs});
    signal.addEventListener('abort',()=>{gesture.abort();shield.remove();},{once:true});
  },{signal});
  document.addEventListener('scroll',position,{capture:true,signal});window.addEventListener('resize',position,{signal});
  const observer=new ResizeObserver(position);observer.observe(canvas);if(item())observer.observe(item()!);
  const modalObserver=new MutationObserver(position);modalObserver.observe(document.querySelector('#app')!,{attributes:true,attributeFilter:['inert']});
  position();
  return ()=>{active=false;cancelAnimationFrame(frame);restore?.();abort.abort();observer.disconnect();modalObserver.disconnect();overlay.remove();hud.remove();guides.remove();canvas.classList.remove('editor-design');};
}
