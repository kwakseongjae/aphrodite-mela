import type {Block} from '../model';
import {canParent,validLayout,type Layout} from '../layout';
export type EditorCommand={type:'resize';id:string;layout:Layout}|{type:'move';id:string;parentId?:string;beforeId?:string;x?:number;y?:number};
export function applyEditorCommand(blocks:Block[],command:EditorCommand):boolean {
  const b=blocks.find(b=>b.id===command.id);if(!b)return false;
  if(command.type==='resize'){
    if(!validLayout(command.layout))return false;
    if(JSON.stringify(b.layout)===JSON.stringify(command.layout))return false;
    b.layout={...command.layout};return true;
  }
  if(!canParent(blocks,b.id,command.parentId))return false;
  if(command.beforeId===b.id)return false;
  const before=command.beforeId?blocks.find(x=>x.id===command.beforeId):undefined;
  if(command.beforeId&&(!before||before.parentId!==command.parentId))return false;
  const layout={...b.layout};
  if(command.x!==undefined)layout.x=command.x;
  if(command.y!==undefined)layout.y=command.y;
  if(!validLayout(layout))return false;
  const siblings=blocks.filter(n=>n.parentId===b.parentId);
  if(b.parentId===command.parentId&&siblings[siblings.indexOf(b)+1]?.id===command.beforeId&&JSON.stringify(layout)===JSON.stringify(b.layout??{}))return false;
  b.parentId=command.parentId;if(b.layout||Object.keys(layout).length)b.layout=layout;
  blocks.splice(blocks.indexOf(b),1);const index=before?blocks.indexOf(before):-1;
  blocks.splice(index<0?blocks.length:index,0,b);return true;
}
