import {parseProject,uid,type Project} from '../model';
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
export function entryFor(project:Project,now=new Date().toISOString(),workspaceId?:string):ProjectEntry{
  const entry:ProjectEntry={project:parseProject(JSON.stringify(project)),createdAt:now,updatedAt:now,pinned:false,archived:false};
  if(workspaceId!==undefined)entry.workspaceId=requireWorkspaceId(workspaceId);
  return entry;
}
export function upsertProject(library:Library,project:Project,now=new Date().toISOString(),workspaceId?:string):Library{
  const existing=library.entries.find(e=>e.project.id===project.id);
  if(!existing&&library.entries.length>=200)throw new Error('최대 200개 프로젝트를 지원합니다.');
  if(workspaceId!==undefined)requireWorkspaceId(workspaceId);
  const next=existing?{...existing,project:parseProject(JSON.stringify(project)),updatedAt:now,...(workspaceId!==undefined?{workspaceId}:{})}:entryFor(project,now,workspaceId);
  return {version:1,entries:existing?library.entries.map(e=>e===existing?next:e):[next,...library.entries]};
}
export function writeLibrary(storage:LocalStore,library:Library):void{
  // One atomic localStorage write: quota errors cannot leave a half-written index.
  const raw=JSON.stringify(library);
  if(raw.length>40_000_000)throw new Error('프로젝트 보관함이 너무 큽니다. 프로젝트를 파일로 내보내주세요.');
  storage.setItem(LIBRARY_KEY,raw);
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
export function workspaceCounts(library:Library):Record<string,number>{
  const counts:Record<string,number>={};
  for(const e of library.entries){if(e.archived)continue;const id=entryWorkspace(e);counts[id]=(counts[id]??0)+1;}
  return counts;
}
