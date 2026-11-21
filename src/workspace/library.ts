import {parseProject,uid,MAX_PROJECT,type Project} from '../model';
import {halfPairIn} from '../text';
import {fitSaved} from '../ledger/ledger';
import {LEDGER_RESERVE} from '../ledger/types';
import {DEFAULT_WORKSPACE_ID} from './workspaces';
export const LIBRARY_KEY='aphrodite-project-library-v1';
export const LEGACY_KEY='aphrodite-mela-project-v1';
const WORKSPACE_ID=/^[a-zA-Z0-9_-]{1,60}$/;
export type ProjectEntry={project:Project;updatedAt:string;createdAt:string;pinned:boolean;archived:boolean;openedAt?:string;workspaceId?:string};
export type Library={version:1;entries:ProjectEntry[]};
export type LocalStore=Pick<Storage,'getItem'|'setItem'>;
function requireWorkspaceId(id:string){if(!WORKSPACE_ID.test(id))throw new Error('프로젝트 메타데이터가 올바르지 않습니다.');return id;}
export function readLibrary(storage:LocalStore):Library{
  const raw=storage.getItem(LIBRARY_KEY);
  if(raw!==null){
    if(raw.length>40_000_000)throw new Error('프로젝트 보관함이 너무 큽니다. 원본은 보존됩니다.');
    const value=JSON.parse(raw);
    if(value?.version!==1||!Array.isArray(value.entries)||value.entries.length>200)throw new Error('프로젝트 보관함 형식을 읽지 못했습니다.');
    const seen=new Set<string>();
    const entries=value.entries.map((e:ProjectEntry)=>{
      if(!e||typeof e.pinned!=='boolean'||typeof e.archived!=='boolean'||typeof e.updatedAt!=='string'||typeof e.createdAt!=='string'||!Number.isFinite(Date.parse(e.updatedAt))||!Number.isFinite(Date.parse(e.createdAt)))throw new Error('프로젝트 메타데이터가 올바르지 않습니다.');
      if(e.openedAt!==undefined&&(typeof e.openedAt!=='string'||!Number.isFinite(Date.parse(e.openedAt))))throw new Error('프로젝트 메타데이터가 올바르지 않습니다.');
      if(e.workspaceId!==undefined&&(typeof e.workspaceId!=='string'||!WORKSPACE_ID.test(e.workspaceId)))throw new Error('프로젝트 메타데이터가 올바르지 않습니다.');
      const project=parseProject(JSON.stringify(e.project));
      if(seen.has(project.id))throw new Error('중복 프로젝트 ID가 있습니다.');seen.add(project.id);
      return {...e,project};
    });return {version:1,entries};
  }
  const legacy=storage.getItem(LEGACY_KEY);
  // Read-only migration; preserve the legacy key verbatim as a recovery copy.
  return {version:1,entries:legacy?[entryFor(parseProject(legacy))]:[]};
}
export function entryFor(project:Project,now=new Date().toISOString(),workspaceId?:string,raw=JSON.stringify(project)):ProjectEntry{
  const entry:ProjectEntry={project:parseProject(raw),createdAt:now,updatedAt:now,pinned:false,archived:false};
  if(workspaceId!==undefined)entry.workspaceId=requireWorkspaceId(workspaceId);
  return entry;
}
/**
 * The library with `project` saved into it. The project is serialized once; only when that is over what
 * a project holds does its history give way, in place (fitSaved), and it is serialized again — so what
 * stays in memory is what was saved, and the next save does not meet the same history.
 */
export function upsertProject(library:Library,project:Project,now=new Date().toISOString(),workspaceId?:string):Library{
  const existing=library.entries.find(e=>e.project.id===project.id);
  if(!existing&&library.entries.length>=200)throw new Error('최대 200개 프로젝트를 지원합니다.');
  if(workspaceId!==undefined)requireWorkspaceId(workspaceId);
  let raw=JSON.stringify(project);
  if(raw.length>MAX_PROJECT&&project.ledger){fitSaved(project);raw=JSON.stringify(project);}
  const next=existing?{...existing,project:parseProject(raw),updatedAt:now,...(workspaceId!==undefined?{workspaceId}:{})}:entryFor(project,now,workspaceId,raw);
  return {version:1,entries:existing?library.entries.map(e=>e===existing?next:e):[next,...library.entries]};
}
/** What the app's own library file takes at most, in UTF-8 bytes: the number src-tauri/src/workspace.rs refuses to write past (tests/library-limit.test.ts holds the two together). */
export const LIBRARY_LIMIT_BYTES=40_000_000;
/**
 * A guess at what a browser keeps in local storage for one site, in characters. Browsers differ, and the
 * other keys this app keeps there count too, so this only turns away what would plainly not fit; the real
 * guard in the browser build is the toast the person sees when a save fails.
 */
export const BROWSER_LIBRARY_ESTIMATE=5_000_000;
/** How many bytes `text` takes as UTF-8, without encoding it. */
export function utf8Length(text:string):number{
  let n=0;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<0x80)n++;else if(c<0x800)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&(text.charCodeAt(i+1)&0xfc00)===0xdc00){n+=4;i++;}else n+=3;}
  return n;
}
export type LibraryLimit={limit:number;unit:'bytes'|'chars'};
/**
 * How long each library was, in characters, when it was handed to storage (main.ts saveLibrary). Kept
 * with the object rather than beside it: a library read again from disk, imported or swapped is another
 * object, so nothing is remembered for it and the next batch measures it.
 */
const savedChars=new WeakMap<Library,number>();
export function rememberSaved(library:Library,chars:number):void{savedChars.set(library,chars);}
/**
 * Why saving the library with `after` (a design) in place of `before` would not fit where it is kept, or
 * undefined when it would — measured from above, without recording the change: the library with this
 * project's design and no history, plus the most a history can take (LEDGER_RESERVE characters, three
 * bytes each at worst). When this very library was saved (rememberSaved) and the caller gives the new
 * design's length, even the sum of the two leaving room answers without measuring the library again. A change that does not
 * grow the design is never refused for this: making something smaller is always taken.
 */
export function libraryRefusal(library:Library,before:Project,after:Project,{limit,unit}:LibraryLimit,designChars?:number):string|undefined{
  const measure=unit==='bytes'?utf8Length:(s:string)=>s.length,most=unit==='bytes'?3:1,libraryChars=savedChars.get(library);
  if(libraryChars!==undefined&&designChars!==undefined&&most*(libraryChars+designChars+LEDGER_RESERVE)<=limit)return undefined;
  const design={...after,ledger:undefined};
  const size=measure(JSON.stringify(upsertProject(library,design)))+most*LEDGER_RESERVE;
  if(size<=limit)return undefined;
  if(measure(JSON.stringify(design))<=measure(JSON.stringify({...before,ledger:undefined})))return undefined;
  return `with this change the saved projects could come to ${size.toLocaleString('en')} ${unit==='bytes'?'bytes':'characters'}, past the ${limit.toLocaleString('en')} ${unit==='bytes'?'the app\'s library file':'this browser\'s storage is estimated to'} hold. Make the page smaller or split it, or ask the person to export or remove a project.`;
}
export function writeLibrary(storage:LocalStore,library:Library):void{writeLibraryText(storage,JSON.stringify(library));}
/** The library, already serialized, in one atomic localStorage write: quota errors cannot leave a half-written index. */
export function writeLibraryText(storage:LocalStore,raw:string):void{
  if(raw.length>40_000_000)throw new Error('프로젝트 보관함이 너무 큽니다. 프로젝트를 파일로 내보내주세요.');
  storage.setItem(LIBRARY_KEY,raw);
}
/**
 * A project file someone opened from disk, as it comes into this library: read like any saved project, a copy
 * when its id is one this library has, and never approved. No file can make an approval (0.3-P3-fix1).
 */
export function importedProject(raw:string,library:Library):Project{
  // Half a surrogate pair on its own is looked for in the values: the desktop cannot save it (src/text.ts).
  let values:unknown;try{values=JSON.parse(raw);}catch{values=undefined;}
  const half=values&&typeof values==='object'?halfPairIn(values):undefined;
  if(half)throw new Error(`${half} holds half of a surrogate pair on its own, which this Mac cannot save.`);
  const loaded=parseProject(raw);
  const project=library.entries.some(e=>e.project.id===loaded.id)?cloneProject(loaded):loaded;
  delete project.approvedFingerprint;
  return project;
}
export function cloneProject(project:Project):Project{
  const copy=parseProject(JSON.stringify(project));copy.id=uid();copy.name=`${copy.name} copy`.slice(0,100);delete copy.approvedFingerprint;return copy;
}
export type LibraryFilter='recent'|'pinned'|'archived';
/** Most recently opened first; entries never opened fall back to their last save. */
function lastOpened(e:ProjectEntry){return e.openedAt&&e.openedAt>e.updatedAt?e.openedAt:e.updatedAt;}
export function markOpened(library:Library,projectId:string,now=new Date().toISOString()):Library{return {version:1,entries:library.entries.map(e=>e.project.id===projectId?{...e,openedAt:now}:e)};}
function entryWorkspace(e:ProjectEntry){return e.workspaceId??DEFAULT_WORKSPACE_ID;}
export function visibleEntries(library:Library,filter:LibraryFilter,query:string,workspaceId?:string):ProjectEntry[]{
  const q=query.trim().toLocaleLowerCase();
  return library.entries.filter(e=>(workspaceId===undefined||entryWorkspace(e)===workspaceId)&&(filter==='archived'?e.archived:!e.archived)&&(filter!=='pinned'||e.pinned)&&(!q||`${e.project.name} ${e.project.brief} ${e.project.system.name}`.toLocaleLowerCase().includes(q))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||lastOpened(b).localeCompare(lastOpened(a)));
}
export function moveEntries(library:Library,fromWorkspaceId:string,toWorkspaceId:string):Library{
  return {version:1,entries:library.entries.map(e=>entryWorkspace(e)===fromWorkspaceId?{...e,workspaceId:toWorkspaceId}:e)};
}
/**
 * One project to another workspace.
 *
 * `moveEntries` empties a whole workspace into a sibling, which is what deleting one needs. This is
 * the other shape — the person picked a single card and said where it belongs — and until now there
 * was no way to ask for it, so a project's workspace was fixed from the moment it was made unless
 * you deleted the workspace around it.
 *
 * Unknown ids leave the library untouched rather than throwing: the menu is built from the same
 * book that is being read here, so a mismatch means something went stale, and dropping a click is a
 * better answer than losing the entry.
 */
export function moveEntry(library:Library,projectId:string,toWorkspaceId:string):Library{
  return {version:1,entries:library.entries.map(e=>e.project.id===projectId?{...e,workspaceId:toWorkspaceId}:e)};
}
export function workspaceCounts(library:Library):Record<string,number>{
  const counts:Record<string,number>={};
  for(const e of library.entries){if(e.archived)continue;const id=entryWorkspace(e);counts[id]=(counts[id]??0)+1;}
  return counts;
}
