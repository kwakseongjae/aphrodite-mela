import {esc} from '../html';
import {uid} from '../model';

export type WorkspaceAvatar =
  | {kind:'color'; value:string}
  | {kind:'emoji'; value:string}
  | {kind:'image'; value:string};
export type Workspace = {id:string; name:string; avatar:WorkspaceAvatar; createdAt:string};
export type WorkspaceBook = {version:1; workspaces:Workspace[]; activeId:string};
export const WORKSPACES_KEY='aphrodite-workspaces-v1';
export const MAX_WORKSPACES=20;
export const DEFAULT_WORKSPACE_ID='personal';
/** Muted olive / umber / slate / brick / pine / taupe — studio brand, not project tokens. */
export const WORKSPACE_COLORS=['#3a4531','#5c4a3a','#44515c','#6b4548','#3f5348','#5a4e3c'] as const;

const ID=/^[a-zA-Z0-9_-]{1,60}$/;
const COLOR=/^#[0-9a-fA-F]{6}$/;
const IMAGE=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const IMAGE_MAX=2_000_000;

function isRecord(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object';}
function isControl(ch:string){const c=ch.codePointAt(0)!;return c<=0x1f||(c>=0x7f&&c<=0x9f);}
function validAvatar(v:unknown):v is WorkspaceAvatar{
  if(!isRecord(v)||typeof v.kind!=='string'||typeof v.value!=='string')return false;
  if(v.kind==='color')return COLOR.test(v.value);
  if(v.kind==='emoji'){const n=[...v.value].length;return n>=1&&n<=4&&![...v.value].some(isControl);}
  if(v.kind==='image')return v.value.length<=IMAGE_MAX&&IMAGE.test(v.value);
  return false;
}
function requireName(name:string):string{
  const n=name.trim();
  if(!n)throw new Error('Workspace needs a name');
  if(n.length>60)throw new Error('Workspace name is too long');
  return n;
}
function requireAvatar(avatar:unknown):WorkspaceAvatar{
  if(!validAvatar(avatar))throw new Error('Workspace avatar is invalid');
  return avatar;
}
function defaultColor(count:number):string{return WORKSPACE_COLORS[count%WORKSPACE_COLORS.length];}
function resolveAvatar(avatar:Partial<WorkspaceAvatar>|WorkspaceAvatar|undefined,count:number):WorkspaceAvatar{
  if(avatar===undefined)return {kind:'color',value:defaultColor(count)};
  const kind=avatar.kind??'color';
  const value=typeof avatar.value==='string'?avatar.value:kind==='color'?defaultColor(count):'';
  return requireAvatar({kind,value});
}

export function defaultBook(language:'en'|'ko'):WorkspaceBook{
  const id=DEFAULT_WORKSPACE_ID;
  return {version:1,workspaces:[{id,name:language==='ko'?'개인 작업 공간':'Personal workspace',avatar:{kind:'color',value:'#3a4531'},createdAt:new Date().toISOString()}],activeId:id};
}
export function validWorkspace(v:unknown):v is Workspace{
  if(!isRecord(v)||typeof v.id!=='string'||!ID.test(v.id)||typeof v.name!=='string'||typeof v.createdAt!=='string')return false;
  const name=v.name.trim();
  if(!name||name.length>60||!Number.isFinite(Date.parse(v.createdAt)))return false;
  return validAvatar(v.avatar);
}
export function sanitizeBook(v:unknown,language:'en'|'ko'):WorkspaceBook{
  if(!isRecord(v)||!Array.isArray(v.workspaces))return defaultBook(language);
  const seen=new Set<string>();
  const workspaces:Workspace[]=[];
  for(const item of v.workspaces){
    if(!validWorkspace(item)||seen.has(item.id))continue;
    seen.add(item.id);
    workspaces.push({id:item.id,name:item.name.trim(),avatar:item.avatar,createdAt:item.createdAt});
    if(workspaces.length>=MAX_WORKSPACES)break;
  }
  if(!workspaces.length)return defaultBook(language);
  const activeId=typeof v.activeId==='string'&&seen.has(v.activeId)?v.activeId:workspaces[0].id;
  return {version:1,workspaces,activeId};
}
export function readWorkspaces(storage:Pick<Storage,'getItem'>,language:'en'|'ko'):WorkspaceBook{
  try{
    const raw=storage.getItem(WORKSPACES_KEY);
    if(!raw)return defaultBook(language);
    return sanitizeBook(JSON.parse(raw) as unknown,language);
  }catch{return defaultBook(language);}
}
export function writeWorkspaces(storage:Pick<Storage,'setItem'>,book:WorkspaceBook):void{
  try{storage.setItem(WORKSPACES_KEY,JSON.stringify(book));}catch{/* quota / private mode */}
}
export function createWorkspace(book:WorkspaceBook,name:string,avatar?:Partial<WorkspaceAvatar>|WorkspaceAvatar):WorkspaceBook{
  if(book.workspaces.length>=MAX_WORKSPACES)throw new Error('Workspace limit');
  const ws:Workspace={id:uid(),name:requireName(name),avatar:resolveAvatar(avatar,book.workspaces.length),createdAt:new Date().toISOString()};
  return {version:1,workspaces:[...book.workspaces,ws],activeId:ws.id};
}
export function renameWorkspace(book:WorkspaceBook,id:string,name:string):WorkspaceBook{
  if(!book.workspaces.some(w=>w.id===id))return book;
  const next=requireName(name);
  return {version:1,activeId:book.activeId,workspaces:book.workspaces.map(w=>w.id===id?{...w,name:next}:w)};
}
export function setWorkspaceAvatar(book:WorkspaceBook,id:string,avatar:WorkspaceAvatar):WorkspaceBook{
  if(!book.workspaces.some(w=>w.id===id))return book;
  const next=requireAvatar(avatar);
  return {version:1,activeId:book.activeId,workspaces:book.workspaces.map(w=>w.id===id?{...w,avatar:next}:w)};
}
export function setActiveWorkspace(book:WorkspaceBook,id:string):WorkspaceBook{
  if(book.activeId===id||!book.workspaces.some(w=>w.id===id))return book;
  return {version:1,workspaces:book.workspaces,activeId:id};
}
export function deleteWorkspace(book:WorkspaceBook,id:string):{book:WorkspaceBook; movedTo:string}{
  const i=book.workspaces.findIndex(w=>w.id===id);
  if(i<0)return {book,movedTo:book.activeId};
  if(book.workspaces.length<=1)throw new Error('The last workspace stays');
  const movedTo=i>0?book.workspaces[i-1].id:book.workspaces[1].id;
  const workspaces=book.workspaces.filter(w=>w.id!==id);
  return {book:{version:1,workspaces,activeId:book.activeId===id?movedTo:book.activeId},movedTo};
}
export function workspaceInitials(name:string):string{
  return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>{
    const ch=[...word][0]??'';
    return ch.toUpperCase()!==ch.toLowerCase()?ch.toUpperCase():ch;
  }).join('');
}
export function avatarStyle(ws:Workspace):string{
  const a=ws.avatar;
  if(a.kind==='color')return `background:${esc(a.value)};color:#fff`;
  if(a.kind==='image')return `background-image:url(${esc(a.value)});background-size:cover`;
  return 'background:#f0efe8';
}
export function avatarContent(ws:Workspace):string{
  if(ws.avatar.kind==='emoji')return esc(ws.avatar.value);
  if(ws.avatar.kind==='color')return esc(workspaceInitials(ws.name));
  return '';
}
