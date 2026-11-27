/**
 * 0.3-G2b fix 2 (the owner's answer to question 11): every toast that reports a change the person just made, one the
 * shortcut takes back in one step, offers Undo, and Undo takes back that change and nothing before it. Each kind of
 * change runs through the editor's own commit(), its toast and its Undo, as the page runs them.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,systems,canonicalSystem,currentPage,catalog,makeBlock,type Project} from '../src/model';
import {pushToast,expireToasts,toastHtml,type Toast} from '../src/design/toasts';
import {stepForScreen,HumanOnlyStep,StepDoesNotFit} from '../src/ledger/session';
import {ensureSpace,tidyFrames} from '../src/editor/space';
import {visiblePages} from '../src/editor/starter';
import {sampleSrc,sampleImages} from '../src/design/sample-images';
import {applyEditorCommand} from '../src/editor/commands';
import {layerMove} from '../src/editor/layer-reorder';
import {canParent} from '../src/layout';
import {supportsProvider} from '../src/providers';
import {nodePath} from '../src/agent/context';
import {explorerBlock} from '../src/design/component-explorer';
import {personAt,agentDispatch} from '../src/agent/dispatch';
import {editorActions,editorCalls,noop} from './support/editor-calls';

type Screen=Record<string,unknown>&{project:Project;toasts:Toast[];edits:{undo:unknown[]};selected:string;
  action:(el:unknown,d:unknown,trusted?:boolean)=>Promise<void>;undoToken:()=>string;commit:(change:()=>void,d:unknown,row:string)=>unknown};
const person=()=>personAt({isTrusted:true})!;
function editor(project:Project,starts:string[]=[],extra:Record<string,unknown>={}):Screen{
  const screen:Record<string,unknown>={...editorActions(project),toasts:[],toastId:0,editSession:1,askOpen:()=>false,boardWords:(s:string)=>s,paintToasts:noop,pushToast,expireToasts,
    ui:(en:string)=>en,uiLanguage:'en',stepForScreen,HumanOnlyStep,StepDoesNotFit,stepRefusals:new Map(),closeModal:noop,fitAll:noop,fitFrame:noop,who:()=>person(),...extra};
  editorCalls(['function commit(','function toast(','function notice(','function undoToken(','function undoable(','function history(','async function action(',...starts],screen);
  return screen as Screen;
}
const press=(action:string,data:Record<string,string>={})=>({dataset:{action,...data}});
/** The toast a person sees last, and whether it is drawn with Undo now. */
function shown(s:Screen){const t=s.toasts.at(-1);assert.ok(t,'a toast was shown');return {message:t.message,undo:/data-action="undo"/.test(toastHtml([t],{undo:s.undoToken()}))};}
/** Undo on that toast, as the page presses it: the change it names is checked again, then the shortcut's one step. */
async function pressUndo(s:Screen){const t=s.toasts.at(-1)!;if(!t.undo||t.undo!==s.undoToken())return false;await s.action(press('undo',{undoFor:t.undo}),person(),true);return true;}
/** The person changed something just before, so Undo has a change of theirs to leave alone. */
function earlier(s:Screen){s.commit(()=>{s.project.name='Named a moment ago';},person(),'edit.project-rename');}
/** One change, end to end: its toast offers Undo and is a whole sentence, and Undo takes back that change only. */
async function oneStep(s:Screen,read:(p:Project)=>unknown,run:()=>unknown){
  earlier(s);
  const before=JSON.stringify(read(s.project)),steps=s.edits.undo.length;
  await run();
  assert.notEqual(JSON.stringify(read(s.project)),before,'the change landed');
  assert.equal(s.edits.undo.length,steps+1,'as one step');
  const toast=shown(s);
  assert.ok(toast.undo,`"${toast.message}" offers Undo`);
  assert.match(toast.message,/[.?!]$/,'and is a whole sentence');
  assert.doesNotMatch(toast.message,/ · |Undo available|실행 취소 가능|Undo로 복구/,'with no hint about undo tacked on');
  assert.ok(await pressUndo(s),'Undo is pressed');
  assert.equal(JSON.stringify(read(s.project)),before,'Undo takes back that change');
  assert.equal(s.project.name,'Named a moment ago','and not the one before it');
  assert.equal(s.edits.undo.length,steps);
  return toast.message;
}
const board=()=>{const p=initialProject();ensureSpace(p);return p;};
const hero=(p:Project)=>currentPage(p).blocks.find(b=>b.kind==='hero')!;

test('removing a component offers Undo for the removal',async()=>{
  const p=board(),s=editor(p);s.selected=hero(p).id;
  await oneStep(s,q=>currentPage(q).blocks.map(b=>b.id),()=>s.action(press('delete-block'),person(),true));
});

test('a change an agent made is never offered to the person to undo',async()=>{
  const p=board();p.pages.push({id:'second',name:'Second',blocks:[]});ensureSpace(p);p.space!.frames.second={...p.space!.frames.second,x:4000,y:2600};
  const s=editor(p,[],{tidyFrames,visiblePages});
  await s.action(press('tidy-frames'),agentDispatch('Astra','mcp'),false);
  assert.equal(s.edits.undo.length,1,'the agent\'s tidy landed');
  assert.equal(shown(s).undo,false,'its toast says so, with no Undo: the person did not press it');
  s.selected=hero(s.project).id;
  await s.action(press('delete-block'),agentDispatch('Astra','mcp'),false);
  assert.equal(shown(s).undo,false,'nor for an agent\'s removal');
});

