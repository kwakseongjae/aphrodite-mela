/** Keyboard ownership follows the visible DOM. A key held through a change of control or surface has no new owner. */
import {dispatchOf,send} from '../agent/dispatch';

const controls='button,input:not([type="hidden"]),textarea,select,a[href],summary,[tabindex],[contenteditable="true"]';
const popovers='details[open]:is(.connect-mark,.menu-select,.help-fab,.folio-ws,.folio-more,.folio-lang,.folio-theme,.folio-help,.top-lang),.dock-slot:has(.dock-menu)';
type Kind='sheet'|'dialog'|'ask'|'palette'|'popover'|'toast'|'page'|'editor';
type Surface={kind:Kind;root:HTMLElement};
type Origin={root:HTMLElement;focus:Element|null;control:HTMLElement|null;cancelled?:boolean};
const keyboardClicks=new WeakMap<Event,KeyboardEvent>();

/** Available only during dispatch of this single click, after its trusted release passed every ownership check. */
export function pressOrigin(e:Event){return keyboardClicks.get(e)??e;}

function visible(el:HTMLElement){
  if(el.matches(':disabled,[aria-disabled="true"]')||el.closest('[inert],[hidden],[aria-hidden="true"]')||!el.getClientRects().length)return false;
  for(let d=el.closest('details:not([open])');d;d=d.parentElement?.closest('details:not([open])')??null){
    if(!d.querySelector(':scope > summary')?.contains(el))return false;
  }
  return getComputedStyle(el).visibility==='visible';
}

export function topSurface():Surface{
  const sheet=document.querySelector<HTMLElement>('.fatal-scrim');
  if(sheet)return {kind:'sheet',root:sheet};
  const toast=document.activeElement?.closest<HTMLElement>('[data-toast]');
  if(toast)return {kind:'toast',root:toast};
  const modal=document.querySelector<HTMLElement>('#modal-root > :last-child .modal');
  const page=document.querySelector<HTMLElement>('#page-view-root .page-view');
  const root=modal??page??document.body;
  const menus=[...root.querySelectorAll<HTMLElement>(popovers)].filter(visible).reverse();
  const menu=menus.find(el=>el.contains(document.activeElement))??menus[0];
  if(menu)return {kind:'popover',root:menu};
  if(modal)return {kind:modal.matches('.ask-modal')?'ask':modal.querySelector('#command-list')?'palette':'dialog',root};
  return {kind:page?'page':'editor',root};
}

export function focusOnSurface(el:HTMLElement|null|undefined){
  if(!el?.isConnected||!topSurface().root.contains(el)||!visible(el))return false;
  el.focus();
  return document.activeElement===el;
}

const returns=new Map<Kind,HTMLElement>();
const lastFocus=new WeakMap<HTMLElement,HTMLElement>();
export function rememberFocus(kind:Kind){
  if(!returns.has(kind)&&document.activeElement instanceof HTMLElement)returns.set(kind,document.activeElement);
}
export function takeReturnFocus(kind:Kind){
  const el=returns.get(kind);returns.delete(kind);return el;
}
export function restoreFocus(preferred?:HTMLElement|null){
  return focusOnSurface(preferred)||focusOnSurface(lastFocus.get(topSurface().root));
}

function cycle(root:HTMLElement,back:boolean){
  const items=[...root.querySelectorAll<HTMLElement>(controls)].filter(el=>!el.matches('[tabindex="-1"]')&&visible(el));
  const i=items.indexOf(document.activeElement as HTMLElement);
  const next=i<0?(back?items.length-1:0):(i+(back?-1:1)+items.length)%items.length;
  items[next]?.focus();
}

function keyName(e:KeyboardEvent){
  if(e.code==='Enter'||e.code==='NumpadEnter'||e.keyCode===13)return 'Enter';
  if(e.code==='Space')return ' ';
  if(e.code==='ArrowDown'||e.key==='Down'||e.keyCode===40)return 'ArrowDown';
  if(e.code==='ArrowUp'||e.key==='Up'||e.keyCode===38)return 'ArrowUp';
  return e.code==='Escape'?'Escape':e.key==='Process'?e.code:e.key;
}
function stop(e:Event){e.preventDefault();e.stopImmediatePropagation();}

function buttonFor(surface:Surface,key:string){
  const on=document.activeElement;
  if(!(on instanceof HTMLElement)||!surface.root.contains(on)||!visible(on))return null;
  if(on.matches('button,summary,[role="button"],input:is([type="submit"],[type="button"],[type="reset"],[type="checkbox"],[type="radio"])')||
    (key==='Enter'&&on.matches('a[href]')))return on;
  if(key==='Enter'&&surface.kind==='palette'&&on.id==='command-search'){
    const items=[...surface.root.querySelectorAll<HTMLButtonElement>('[data-palette]')].filter(visible);
    return items.find(el=>el.classList.contains('is-active'))??(items.length===1||(on as HTMLInputElement).value.trim()?items[0]:null)??null;
  }
  if(key==='Enter'&&on instanceof HTMLInputElement&&on.form){
    return on.form.querySelector<HTMLElement>('button:not([type]),button[type="submit"],input[type="submit"]');
  }
  return null;
}

type Actions={
  escape:(surface:Surface,e:KeyboardEvent)=>void;
  paletteArrow:(key:'ArrowDown'|'ArrowUp',e:KeyboardEvent)=>void;
  releaseSpace:()=>void;
};

/** Install before the delegated-input gate. Observe releases on window, then route at document capture only if the gate admits the key. */
export function installPress(actions:Actions){
  const held=new Map<string,Origin|null>();
  const releases=new WeakMap<KeyboardEvent,Origin|null>();
  const fresh=new WeakSet<KeyboardEvent>();
  window.addEventListener('keydown',e=>{
    if(!e.isTrusted)return;
    const id=e.code||e.key;
    if(!e.repeat&&!held.has(id))fresh.add(e);
    const key=keyName(e);
    if(key==='Enter'||key===' '){
      if(!held.has(id))held.set(id,{root:topSurface().root,focus:document.activeElement,control:null,cancelled:e.repeat});
      else{const origin=held.get(id);if(origin)origin.cancelled=true;}
    }else held.set(id,null);
  },true);
  window.addEventListener('keyup',e=>{
    if(!e.isTrusted)return;
    const id=e.code||e.key;
    if(held.has(id))releases.set(e,held.get(id)??null);
    held.delete(id);
    if(e.key==='Meta')held.clear();
    if(keyName(e)===' ')actions.releaseSpace();
  },true);
  window.addEventListener('blur',()=>{held.clear();actions.releaseSpace();});
  document.addEventListener('focusin',e=>{
    const surface=topSurface(),el=e.target;
    if(!(el instanceof HTMLElement))return;
    if(surface.root.contains(el))lastFocus.set(surface.root,el);
    else if(surface.kind==='sheet'&&!restoreFocus())focusOnSurface(surface.root.querySelector<HTMLElement>('[data-action="fatal-redraw"]'));
  },true);
  document.addEventListener('focusout',e=>{
    for(const origin of held.values())if(origin?.focus===e.target)origin.cancelled=true;
  },true);

  function route(e:KeyboardEvent){
    const key=keyName(e),down=e.type==='keydown',surface=topSurface();
    const inside=surface.root.contains(document.activeElement);
    if(key==='Enter'||key===' '){
      const control=buttonFor(surface,key);
      const origin=down?held.get(e.code||e.key):releases.get(e);
      const stale=!down&&(!origin||origin.cancelled||origin.root!==surface.root||origin.focus!==document.activeElement);
      if(!control&&!origin?.control&&!stale&&inside&&surface.kind!=='sheet'&&surface.kind!=='ask'&&
        !(surface.kind==='palette'&&key==='Enter'))return; // native typing, board panning
      stop(e);
      if(!e.isTrusted||!control||!visible(control)||e.target!==document.activeElement)return;
      if(down){
        if(fresh.has(e))held.set(e.code||e.key,{root:surface.root,focus:document.activeElement,control});
      }else if(!stale&&origin?.control===control){
        const click=new MouseEvent('click',{bubbles:true,cancelable:true,view:window});
        keyboardClicks.set(click,e);
        try{send(control,click,dispatchOf(e));}finally{keyboardClicks.delete(click);}
      }
      return;
    }
    if(key==='Escape'){
      // The editor also uses Escape to cancel an active pointer gesture.
      if(surface.kind==='editor')return;
      stop(e);
      const agentMayDismiss=surface.kind!=='ask'&&surface.kind!=='sheet'&&dispatchOf(e)?.author.kind==='agent';
      if(down&&(fresh.has(e)||agentMayDismiss)&&(surface.kind!=='ask'||inside))actions.escape(surface,e);
      return;
    }
    if(key==='Tab'){
      stop(e);if(down&&e.isTrusted)cycle(surface.root,e.shiftKey);return;
    }
    if(key==='ArrowDown'||key==='ArrowUp'){
      if(surface.kind==='palette'&&inside){
        stop(e);if(down||!releases.has(e))actions.paletteArrow(key,e);
      }else if(surface.kind==='toast')stop(e);
    }
    if(surface.kind==='sheet'&&!(inside&&(e.metaKey||e.ctrlKey)&&key.toLowerCase()==='c'))stop(e);
  }
  document.addEventListener('keydown',route,true);
  document.addEventListener('keyup',route,true);
}
