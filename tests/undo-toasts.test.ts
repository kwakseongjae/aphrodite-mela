/**
 * 0.3-G2b fix 2 (the owner's answer to question 11): every toast that reports a change the person just made, one the
 * shortcut takes back in one step, offers Undo, and Undo takes back that change and nothing before it. Each kind of
 * change runs through the editor's own commit(), its toast and its Undo, as the page runs them.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,isApproved,systems,canonicalSystem,currentPage,catalog,makeBlock,type Project} from '../src/model';
import {pushToast,expireToasts,toastHtml,settleUndo,type Toast} from '../src/design/toasts';
import {stepForScreen,HumanOnlyStep,StepDoesNotFit} from '../src/ledger/session';
import {ensureSpace,tidyFrames} from '../src/editor/space';
import {visiblePages} from '../src/editor/starter';
import {sampleSrc,sampleImages} from '../src/design/sample-images';
import {applyEditorCommand} from '../src/editor/commands';
import {themeProposal,applyThemeProposal} from '../src/design/theme-proposal';
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
/** Undo on that toast, pressed as the page presses it: the change it names goes along, and the step itself checks it. True when a step was taken. */
async function pressUndo(s:Screen){const t=s.toasts.at(-1)!;if(!t.undo)return false;const steps=s.edits.undo.length;await s.action(press('undo',{undoFor:t.undo}),person(),true);return s.edits.undo.length<steps;}
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

test('changing the layer order offers Undo for that move',async()=>{
  const p=board(),s=editor(p,['function layerCommit(','function commandDone('],{applyEditorCommand,app:{querySelector:()=>null}});
  const blocks=currentPage(p).blocks,top=blocks.filter(b=>!b.parentId);
  const command=layerMove(blocks,top[0].id,top[1].id,true)!;assert.ok(command);
  const layerCommit=s.layerCommit as (c:unknown,e:unknown)=>unknown,commandDone=s.commandDone as (m:string,c?:unknown)=>void;
  await oneStep(s,q=>currentPage(q).blocks.map(b=>b.id),()=>commandDone('The layer order was changed.',layerCommit(command,{isTrusted:true})));
});

test('moving or resizing on the canvas offers Undo for that gesture',async()=>{
  const p=board(),s=editor(p,['function layoutCommit(','function commandDone('],{applyEditorCommand});
  const b=hero(p),layoutCommit=s.layoutCommit as (c:unknown,e:unknown)=>unknown,commandDone=s.commandDone as (m:string,c?:unknown)=>void;
  await oneStep(s,q=>hero(q).layout,()=>commandDone('The size was changed to 640 × 420 px.',layoutCommit({type:'resize',id:b.id,layout:{...b.layout,widthPx:640,height:420}},{isTrusted:true})));
  commandDone('No change.',layoutCommit({type:'resize',id:b.id,layout:{widthPx:1}},{isTrusted:true}));
  assert.equal(shown(s).undo,false,'a gesture that changed nothing says so, with no Undo');
});

test('tidying the frames offers Undo for the tidy',async()=>{
  const p=board();p.pages.push({id:'second',name:'Second',blocks:[]});ensureSpace(p);p.space!.frames.second={...p.space!.frames.second,x:4000,y:2600};
  const s=editor(p,[],{tidyFrames,visiblePages});
  await oneStep(s,q=>q.space,()=>s.action(press('tidy-frames'),person(),true));
});

test('choosing a design system and a heading font each offer Undo',async()=>{
  const p=board(),other=systems.find(x=>x.id!==p.system.id)!;
  const s=editor(p,[],{systems,canonicalSystem,sanitizeFamily:(f:string)=>f});
  await oneStep(s,q=>q.system,()=>s.action(press('choose-system',{system:other.id}),person(),true));
  await oneStep(s,q=>q.system,()=>s.action(press('font-choose',{family:'Fraunces'}),person(),true));
});

test('putting a picture on a component offers Undo for the picture',async()=>{
  const p=board(),s=editor(p,[],{sampleSrc});s.selected=hero(p).id;
  const id=sampleImages[0].id;
  await oneStep(s,q=>hero(q).image,()=>s.action(press('apply-sample',{sample:id}),person(),true));
});

test('placing a component offers Undo for that one',async()=>{
  const p=board(),s=editor(p,['function addBlock('],{catalog,makeBlock,explorerBlock,canParent,supportsProvider,nodePath,insertionTarget:()=>undefined,document:{querySelector:()=>null}});
  const said=await oneStep(s,q=>currentPage(q).blocks.length,()=>(s.addBlock as (k:string,d:unknown)=>void)('cta',person()));
  assert.match(said,/was added to the page\.$/,'a component at the top of the page is said to be on the page, not on its root');
});


test('applying a theme draft offers Undo for the draft, and approves nothing',async()=>{
  const p=board(),s=editor(p,[],{applyThemeProposal});
  await oneStep(s,q=>q.system,()=>{s.themeDraft=themeProposal(s.project,'#2255cc','serif');return s.action(press('proposal-apply'),person(),true);});
  assert.equal(isApproved(s.project),false,'nothing was approved along the way');
});

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

test('another change landing takes the Undo off a toast',async()=>{
  const p=board(),other=systems.find(x=>x.id!==p.system.id)!,s=editor(p,[],{systems,canonicalSystem});
  await s.action(press('choose-system',{system:other.id}),person(),true);
  assert.equal(shown(s).undo,true);
  earlier(s);
  assert.equal(/data-action="undo"/.test(toastHtml(s.toasts,{undo:s.undoToken()})),false,'its Undo would take back the later change, so it goes');
  assert.equal(await pressUndo(s),false);
});

/* Astra recheck 2: the click is checked, then action() waits on the update and archive handlers before the step. An edit
   that lands in that wait is the last change by the time the step runs, so the step itself compares the toast's change. */
test('an edit landing while Undo waits to run is not what Undo takes back',async()=>{
  const p=board(),other=systems.find(x=>x.id!==p.system.id)!,s=editor(p,[],{systems,canonicalSystem});
  await s.action(press('choose-system',{system:other.id}),person(),true);
  const token=s.toasts.at(-1)!.undo!;assert.ok(token);
  s.updates={handle:async()=>{s.commit(()=>{s.project.name='Renamed while Undo waited';},person(),'edit.project-rename');return false;}};
  const steps=s.edits.undo.length;
  await s.action(press('undo',{undoFor:token}),person(),true);
  assert.equal(s.project.name,'Renamed while Undo waited','the edit that landed in the wait stays');
  assert.equal(s.project.system.id,other.id,'and so does the change the toast named, as it is no longer the last');
  assert.equal(s.edits.undo.length,steps+1,'no step was taken');
});

/* Astra recheck 3: the same sentence twice keeps one line, and that line's Undo is the newest change's or none; once
   history moves past a change, its Undo is gone for good. */
test('a repeated toast carries the newest change\'s Undo or none, and a button history moved past never comes back',async()=>{
  const p=board(),s=editor(p,['function persist('],{settleUndo,editorLibrary:()=>({}),saveLibrary:()=>{},upsertProject:()=>({}),library:{entries:[]},workspaces:{activeId:'w'},diskQueue:undefined,lastSaved:true});
  const undoable=s.undoable as (m:string,c:unknown)=>void,history=s.history as (dir:string,d:unknown)=>void;
  const first=s.commit(()=>{s.project.name='First';},person(),'edit.project-rename');
  undoable('The board was renamed.',first);
  assert.equal(shown(s).undo,true);
  undoable('The board was renamed.',null);
  assert.equal(s.toasts.length,1,'one line, counted twice');
  assert.equal(shown(s).undo,false,'the second time changed nothing, so the line offers nothing to take back');
  const second=s.commit(()=>{s.project.name='Second';},person(),'edit.project-rename');
  undoable('The name changed again.',second);
  assert.equal(s.toasts[0].undo,undefined,'the first line\'s Undo went when the next change landed');
  history('undo',person());
  assert.equal(s.project.name,'First');
  assert.ok(s.toasts.every(t=>!t.undo||t.undo===s.undoToken()),'no line holds an Undo for a change that is not the last');
  assert.equal(/data-action="undo"/.test(toastHtml(s.toasts,{undo:s.undoToken()})),false,'and the first line does not get its button back now that its change is last again');
});

test('Undo stays inert when an intervening edit is undone during dispatch',async()=>{
  const p=board(),s=editor(p);
  const first=s.commit(()=>{p.name='First';},person(),'edit.project-rename');
  (s.undoable as Function)('Renamed.',first);
  const token=s.toasts.at(-1)!.undo!;
  s.updates={handle:async()=>{s.commit(()=>{s.project.name='Second';},person(),'edit.project-rename');(s.history as Function)('undo',person());return false;}};
  await s.action(press('undo',{undoFor:token}),person(),true);
  assert.equal(s.project.name,'First');assert.equal(s.edits.undo.length,1);
});
