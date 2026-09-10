import {esc} from '../html';
import {icon} from '../design/icon';

/**
 * Custom dropdown that mirrors a native <select>. The native element stays in the DOM (hidden) so every
 * existing `change` handler and form submission keeps working; the menu just sets `select.value` and
 * dispatches a bubbling `change`. Selects inside iframes and `select[multiple]` are left alone.
 */
export type MenuOption={value:string;label:string;selected:boolean;disabled:boolean};

export function readOptions(select:HTMLSelectElement):MenuOption[]{
  return [...select.options].map(o=>({value:o.value,label:o.textContent??o.value,selected:o.selected,disabled:o.disabled}));
}

export function menuSelectHtml(options:MenuOption[],state:{disabled:boolean;label:string}):string{
  const current=options.find(o=>o.selected)??options[0];
  const items=options.map(o=>`<button type="button" role="menuitemradio" aria-checked="${o.selected}" data-value="${esc(o.value)}"${o.disabled?' disabled':''}>${esc(o.label)}${o.selected?icon('check'):''}</button>`).join('');
  return `<summary aria-label="${esc(state.label)}"${state.disabled?' aria-disabled="true"':''}><span>${esc(current?.label??'')}</span>${icon('chevron-down')}</summary><div class="menu-select-list" role="menu">${items}</div>`;
}

function build(select:HTMLSelectElement):HTMLDetailsElement{
  const details=document.createElement('details');
  details.className='menu-select';
  details.innerHTML=menuSelectHtml(readOptions(select),{disabled:select.disabled,label:select.getAttribute('aria-label')??select.name??''});
  return details;
}

function refresh(select:HTMLSelectElement){
  const details=select.previousElementSibling as HTMLDetailsElement|null;
  if(!details||!details.classList.contains('menu-select'))return;
  const open=details.open;
  details.innerHTML=menuSelectHtml(readOptions(select),{disabled:select.disabled,label:select.getAttribute('aria-label')??select.name??''});
  details.open=open;
}

function place(details:HTMLDetailsElement){
  const summary=details.querySelector<HTMLElement>('summary')!,list=details.querySelector<HTMLElement>('.menu-select-list')!;
  const r=summary.getBoundingClientRect();
  const width=Math.max(r.width,160);
  list.style.minWidth=`${width}px`;
  list.style.left=`${Math.min(r.left,innerWidth-width-8)}px`;
  const below=innerHeight-r.bottom-8;
  if(below<220&&r.top>below){list.style.top='auto';list.style.bottom=`${innerHeight-r.top+4}px`;list.style.maxHeight=`${Math.min(320,r.top-16)}px`;}
  else{list.style.bottom='auto';list.style.top=`${r.bottom+4}px`;list.style.maxHeight=`${Math.min(320,below)}px`;}
}

export function enhanceSelect(select:HTMLSelectElement):void{
  if(select.dataset.menuSelect||select.multiple||select.size>1||select.closest('.no-menu-select'))return;
  select.dataset.menuSelect='1';
  const details=build(select);
  select.insertAdjacentElement('beforebegin',details);
  select.classList.add('menu-select-native');select.setAttribute('aria-hidden','true');select.tabIndex=-1;
  details.addEventListener('toggle',()=>{if(details.open){document.querySelectorAll<HTMLDetailsElement>('details.menu-select[open]').forEach(d=>{if(d!==details)d.open=false;});place(details);(details.querySelector<HTMLElement>('[aria-checked="true"]')??details.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();}});
  details.addEventListener('click',e=>{
    const item=(e.target as HTMLElement).closest<HTMLButtonElement>('[role="menuitemradio"]');
    if(!item||item.disabled)return;
    e.preventDefault();e.stopPropagation();
    const value=item.dataset.value??'';
    details.open=false;
    if(select.value!==value){select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
    refresh(select);
  });
  details.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===' ')&&(e.target as HTMLElement).tagName==='SUMMARY'){e.preventDefault();e.stopPropagation();details.open=!details.open;return;}
    const items=[...details.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not([disabled])')];
    const i=items.indexOf(document.activeElement as HTMLButtonElement);
    if(e.key==='ArrowDown'){e.preventDefault();(items[i+1]??items[0])?.focus();}
    else if(e.key==='ArrowUp'){e.preventDefault();(items[i-1]??items.at(-1))?.focus();}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();details.open=false;details.querySelector<HTMLElement>('summary')?.focus();}
  });
  select.addEventListener('change',()=>refresh(select));
}

let observer:MutationObserver|undefined;
/** Enhance every select under `root` now and whenever the DOM changes. Safe to call more than once. */
export function installMenuSelects(root:ParentNode=document):void{
  const sweep=()=>root.querySelectorAll<HTMLSelectElement>('select:not([data-menu-select])').forEach(enhanceSelect);
  sweep();
  if(observer)return;
  observer=new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))sweep();});
  observer.observe(root===document?document.body:root as Node,{childList:true,subtree:true});
  document.addEventListener('click',e=>{document.querySelectorAll<HTMLDetailsElement>('details.menu-select[open]').forEach(d=>{if(!d.contains(e.target as Node))d.open=false;});},{capture:true});
  document.addEventListener('scroll',e=>{const t=e.target as HTMLElement;document.querySelectorAll<HTMLDetailsElement>('details.menu-select[open]').forEach(d=>{if(!(t instanceof HTMLElement)||!d.contains(t))d.open=false;});},{capture:true,passive:true});
}
