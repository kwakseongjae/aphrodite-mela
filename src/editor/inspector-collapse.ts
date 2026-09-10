export const INSPECTOR_COLLAPSED_KEY='aphrodite-inspector-collapsed';

export function readInspectorCollapsed(storage:Pick<Storage,'getItem'>):boolean{
 try{return storage.getItem(INSPECTOR_COLLAPSED_KEY)==='true';}catch{return false;}
}

export function writeInspectorCollapsed(storage:Pick<Storage,'setItem'>,value:boolean):void{
 try{storage.setItem(INSPECTOR_COLLAPSED_KEY,String(value));}catch{}
}

export function inspectorToggleHtml(collapsed:boolean,label:{show:string,hide:string}):string{
 return `<button type="button" class="inspector-toggle" data-action="inspector-toggle" aria-expanded="${collapsed?'false':'true'}">${collapsed?label.show:label.hide}</button>`;
}

export function bindInspectorCollapse(root:ParentNode,storage:Pick<Storage,'getItem'|'setItem'>,labels:{show:string,hide:string}):void{
 const studio=root.querySelector('.studio');
 if(!studio)return;
 const inspector=studio.querySelector('.inspector');
 if(!inspector)return;
 let found=inspector.querySelector<HTMLButtonElement>('.inspector-toggle');
 const collapsed=readInspectorCollapsed(storage);
 if(!found){
  inspector.insertAdjacentHTML('afterbegin',inspectorToggleHtml(collapsed,labels));
  found=inspector.querySelector<HTMLButtonElement>('.inspector-toggle');
 }
 if(!found)return;
 const toggle=found;
 const sync=(next:boolean)=>{
  studio.classList.toggle('inspector-collapsed',next);
  toggle.setAttribute('aria-expanded',next?'false':'true');
  toggle.textContent=next?labels.show:labels.hide;
 };
 sync(collapsed);
 toggle.onclick=()=>{
  const next=!studio.classList.contains('inspector-collapsed');
  sync(next);
  writeInspectorCollapsed(storage,next);
 };
}
