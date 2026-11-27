import assert from 'node:assert/strict';
import {currentPage,initialProject} from '../../src/model';
import {libraryText,upsertProject,readLibrary,rememberSaved,LIBRARY_KEY} from '../../src/workspace/library';
import {WindowSaves} from '../../src/workspace/save-state';
import {troubleKind,backupFormat,reloadConfirm} from '../../src/ui/notices';
import {personAt} from '../../src/agent/dispatch';
import {editorCalls,editorActions,noop} from './editor-calls';

export function deferred<T>(){
  let resolve!:(value:T)=>void,reject!:(error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const missing={path:'/old',revision:9,entries:2,at:''};
export function windowWithDisk(){
  const board=initialProject(),other=initialProject(); other.id='other';
  const library=upsertProject(upsertProject({version:1,entries:[]},other),board);
  const writes:{text:string;done:ReturnType<typeof deferred<number>>}[]=[];
  const reads:ReturnType<typeof deferred<{revision:number;data:string|null;path:string}>>[]=[];
  const said:string[]=[],questions:string[]=[],files:string[]=[];
  const s:Record<string,any>={...editorActions(board),library,libraryText,upsertProject,readLibrary,rememberSaved,LIBRARY_KEY,
    nativeDesktop:true,workspaces:{activeId:'default'},storagePath:missing.path,
    toasts:[],failImportWrite:false,troubleSeen:'',heldWrites:undefined,
    invoke:(op:string,args:{data:string})=>{if(op==='workspace_read'){const read=deferred<{revision:number;data:string|null;path:string}>();reads.push(read);return read.promise;}
      assert.equal(op,'workspace_write');const done=deferred<number>();writes.push({text:args.data,done});return done.promise;},
    writeBreadcrumb:noop,crumbFor:noop,store:{},readBreadcrumb:()=>missing,storeVanished:(r:{data:unknown})=>r.data===null?missing:undefined,readTidied:()=>false,
    askOpen:()=>false,fatalUp:()=>false,openTrouble:noop,troubleOpened:()=>true,paintMarks:noop,paintSaveState:noop,
    toast:(m:string)=>said.push(m),notice:(m:string)=>said.push(m),ui:(en:string)=>en,uiLanguage:'en',boardWords:(s:string)=>s,troubleKind,
    modalRoot:{querySelector:()=>null},closeModal:noop,showModal:(m:string,_subtitle:string,html:string)=>{questions.push(m);s.confirmGeneration=html.match(/data-discard-generation="(\d+)"/)?.[1];},backupFormat,reloadConfirm,turn:(go:Function)=>go(),bounded:(p:Promise<unknown>)=>p,
    SAVE_LIMIT:1000,within:async(p:Promise<unknown>)=>{await p.catch(noop);return true;},nativeClose:()=>({ready:Promise.resolve(true),release:noop}),readImage:(v:unknown)=>v,
    selected:currentPage(board).blocks.find(b=>b.kind==='hero')!.id,undoable:noop,pickFile:(_accept:string,fn:Function)=>{s.finishImage=fn;},openProject:noop,newHistory:noop,
    confirm:(m:string)=>{questions.push(m);return true;},saveFile:async(_name:string,text:string)=>{files.push(text);return true;},fileName:()=>'board.json'};
  editorCalls(['function persist(','function saveLibrary(','function queueLibrary(','async function flushDisk(','function saveChanged(','function refreshBackupFormat(','function attachDiskQueue(','function backupLibrary(','function everyBoardLabel(','function liveLibrary(',
    'function troubleNow(','function askReload(','async function reloadFromDisk(','async function reloadFromDiskNow(','function closeWindow(','async function action(','function commit('],s);
  s.saves=new WindowSaves(noop,()=>s.saveChanged(),noop);s.attachDiskQueue(0);s.saves.emptyRead(missing,false);
  return {s,writes,reads,said,questions,files,edit:(name:string)=>{board.name=name;s.persist();},press:(action:string,data:Record<string,string>={})=>s.action({dataset:{action,...data}},personAt({isTrusted:true}),true)};
}

