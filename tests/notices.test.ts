import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {NOTICE_PLACES,troubleKind,troubleDialog,troubleMarkHtml,connectMarkHtml,renderFailedHtml,noticeCardHtml,type Trouble} from '../src/ui/notices';

/**
 * 0.3-G2b: a notice has four places and no fifth. A short notice (toast) says a thing is done or refused; a card
 * stays for what the person may decide (the new version); a dialog stops the work only when leaving it would
 * lose work; a mark on the top line says how things stand now. These tests hold the shape of each.
 */

test('there are four places for a notice',()=>{
  assert.deepEqual([...NOTICE_PLACES],['toast','card','dialog','mark']);
});

test('a save that failed is read as the disk being full, the store changing under the window, or anything else',()=>{
  assert.equal(troubleKind('No space left on device (os error 28)'),'full');
  assert.equal(troubleKind('Another window changed this workspace. Export unsaved work, then reopen the app.'),'conflict');
  assert.equal(troubleKind('Permission denied (os error 13)'),'failed');
  assert.equal(troubleKind(''),'failed');
});

const vanished:Trouble={kind:'vanished',path:'/Users/someone/Library/Application Support/Aphrodite/workspace-v1',boards:6};
const full:Trouble={kind:'full',detail:'No space left on device (os error 28)'};
const conflict:Trouble={kind:'conflict',detail:'Another window changed this workspace. Export unsaved work, then reopen the app.'};
const failed:Trouble={kind:'failed',detail:'Permission denied (os error 13)'};
const unread:Trouble={kind:'unread',detail:'파일 저장소를 열지 못했습니다. 원본은 보존됩니다. expected value at line 1 column 1'};
const actionsOf=(html:string)=>[...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]);
const firstFocus=(html:string)=>html.match(/<button[^>]*data-first-focus[^>]*data-action="([^"]+)"|<button[^>]*data-action="([^"]+)"[^>]*data-first-focus/)?.slice(1).find(Boolean);

test('the missing folder offers looking again before starting fresh, and the first focus loses nothing',()=>{
  for(const ko of [false,true]){
    const d=troubleDialog(vanished,'home',ko);
    const acts=actionsOf(d.body);
    assert.ok(acts.indexOf('disk-reload')>=0&&acts.indexOf('disk-reload')<acts.indexOf('disk-start-fresh'),'the safe action comes first');
    assert.equal(firstFocus(d.body),'close-modal','a dialog the person did not open starts on Later, not on a door that changes anything');
    assert.ok(d.body.includes(vanished.kind==='vanished'?vanished.path:''),'it says where it looked');
  }
  assert.match(troubleDialog(vanished,'home',false).body,/The app does not delete the old folder/);
  assert.match(troubleDialog(vanished,'home',false).body,/6 boards/);
  assert.match(troubleDialog({...vanished,replaced:true} as Trouble,'home',true).body,/새 폴더를 만들어 저장하고 있어요/,'once this window has saved there, it says so rather than warning it might');
});

test('a save that stopped says the work is only in this window, and offers keeping it before reloading',()=>{
  for(const t of [full,conflict,failed])for(const ko of [false,true]){
    const editor=troubleDialog(t,'editor',ko),home=troubleDialog(t,'home',ko);
    const e=actionsOf(editor.body),h=actionsOf(home.body);
    assert.equal(firstFocus(editor.body),'disk-backup','the open board as a file is first, and focused');
    assert.ok(e.indexOf('hub-backup')>0&&e.indexOf('hub-backup')<e.indexOf('disk-reload'),'every board as one file comes before reloading');
    assert.ok(!h.includes('disk-backup'),'off the editor no board is open, so none is offered as a file');
    assert.ok(h.indexOf('hub-recovery')>h.indexOf('hub-backup')&&h.indexOf('hub-recovery')<h.indexOf('disk-reload'),'home keeps the raw files it offered before, after the backup and before reloading');
    assert.equal(firstFocus(home.body),'hub-backup');
    assert.ok(h.indexOf('hub-backup')<h.indexOf('disk-reload'));
    for(const d of [editor,home]){
      assert.ok(!/os error|Another window|Permission denied/.test(d.title+d.subtitle),'the error as the system wrote it is never the headline');
      assert.ok(!d.body.includes('data-first-focus data-action="disk-reload"'));
    }
  }
  const raw=troubleDialog(failed,'editor',false).body;
  assert.match(raw,/<details[^>]*>[\s\S]*Permission denied \(os error 13\)[\s\S]*<\/details>/,'the words the system gave stay folded away for a report');
});

test('stored boards that could not be read offer their files untouched first, and say nothing is saved until then',()=>{
  for(const where of ['home','editor'] as const)for(const ko of [false,true]){
    const d=troubleDialog(unread,where,ko);
    assert.deepEqual(actionsOf(d.body),['hub-recovery','disk-reload','close-modal']);
    assert.equal(firstFocus(d.body),'hub-recovery');
    assert.ok(!/파일 저장소를 열지/.test(d.title+d.subtitle));
  }
});

test('a dialog says only what the code knows about the files it offers, and offers nothing the build cannot do',()=>{
  const ko=troubleDialog(full,'editor',true).body;
  assert.match(ko,/그림·영상 파일은 들어 있지 않아요/,'what a backup leaves out is said');
  assert.doesNotMatch(ko,/가져오기로 다시 열 수/,'re-import is promised only when the file is one the importer takes');
  assert.match(troubleDialog(full,'editor',true,{reimport:true}).body,/보드 가져오기로 다시 열 수 있어요\(승인은 다시 해야 해요\)/);
  assert.match(ko,/보드 가져오기로 여는 파일은 아니에요/,'every board as one file is a file to keep, not one Import board opens');
  assert.ok(!actionsOf(troubleDialog(unread,'home',false,{native:false}).body).includes('disk-reload'),'the browser build reads no disk, so it offers no reload');
  assert.match(troubleDialog(vanished,'home',true).subtitle,/^앱은 아무것도 지우지 않았어요/,'it says what the app knows: it deleted nothing');
  assert.match(troubleDialog(vanished,'home',true,{windowBoards:2}).body,/이 창에 있는 것\(보드 2개\)을 그 자리에 새 폴더로 저장해요/,'starting fresh saves what the window holds, not an empty library');
});

test('nothing in a dialog promises a save that the code does not make',()=>{
  for(const t of [vanished,full,conflict,failed,unread])for(const where of ['home','editor'] as const)for(const ko of [false,true]){
    const d=troubleDialog(t,where,ko),text=(d.title+d.subtitle+d.body);
    assert.doesNotMatch(text,/automatically|by itself|저절로|자동으로 다시/,'a failed save stays stopped until the person reloads');
  }
  assert.match(troubleDialog(full,'editor',true).body,/저장하지 못한 변경은 버려지고, 그 전에 한 번 더 물어요/,'reloading says what it throws away, and that it asks first');
});

test('the mark that reopens a dialog is a button the person presses, and there is none when nothing is wrong',()=>{
  assert.equal(troubleMarkHtml(undefined,false),'');
  const html=troubleMarkHtml(full,true);
  assert.deepEqual(actionsOf(html),['notice-open']);
  assert.match(html,/저장 안 됨/);
});

test('the connected mark keeps disconnecting the person\'s own door, by the same name',()=>{
  const html=connectMarkHtml({who:'Claude Code',holder:'',writes:2,allowed:'Claude Code',channel:'127.0.0.1:4410'},false);
  assert.deepEqual(actionsOf(html),['agent-disconnect']);
  assert.match(html,/data-connect-writes[^>]*>2</);
  assert.match(html,/<summary[\s\S]*Claude Code[\s\S]*<\/summary>/,'who is let in is on the mark itself, not only behind it');
  assert.match(html,/⌘Z/,'it says how to take an agent\'s change back');
});

test('a screen that could not be drawn says so in a sheet, with the words the system wrote folded away',()=>{
  const html=renderFailedHtml('TypeError: x is undefined\nmain.ts:1:1',{ko:true,board:true});
  assert.match(html,/화면을 그리다가 멈췄어요/);
  assert.deepEqual(actionsOf(html),['fatal-redraw','disk-backup','hub-backup','fatal-copy','fatal-close']);
  assert.match(html,/<details[\s\S]*TypeError: x is undefined[\s\S]*<\/details>/);
  assert.doesNotMatch(renderFailedHtml('<img src=x onerror=1>',{ko:false,board:false}),/<img/);
  assert.ok(!actionsOf(renderFailedHtml('e',{ko:false,board:false})).includes('disk-backup'),'with no board open, no board is offered as a file');
});

test('the new version is told in the one card, through the card place',async()=>{
  const {updateNoticeHtml}=await import('../src/update-notice');
  const html=updateNoticeHtml({current:'0.3.0',latest:'0.3.1',newer:true,name:'a.dmg',url:'https://example.test/a.dmg'},'offer','ko');
  assert.match(html,/^<div class="update-card ui-update ui-card ui-notice-card" role="status" aria-live="polite" data-state="offer">/);
  assert.equal(noticeCardHtml('x','failed','<p>y</p>'),'<div class="x ui-card ui-notice-card" role="status" aria-live="polite" data-state="failed"><p>y</p></div>');
});

/* The person goes on editing after a save failed: every edit queues a write that fails the same way. The dialog opened
   once and was put away with Later; it does not come back with each edit, and the mark stays. */
test('a save that keeps failing opens its dialog once, however many edits follow',async()=>{
  const {editorCalls,noop}=await import('./support/editor-calls');
  const {DurableQueue}=await import('../src/workspace/durable');
  let opened=0;const toasts:string[]=[];let marks=0;
  const screen:Record<string,unknown>={DurableQueue,invoke:()=>Promise.reject(new Error('No space left on device (os error 28)')),
    writeBreadcrumb:noop,crumbFor:noop,storagePath:'/s',diskQueue:undefined,library:{entries:[]},syncStateAttributes:noop,
    document:{querySelectorAll:()=>[],activeElement:null},HTMLElement:Object,showModal:()=>{opened++;},troubleDialog:()=>({title:'',subtitle:'',body:''}),icon:()=>'',uiLanguage:'en',nativeDesktop:true,project:{},TextEncoder,control:(s:string)=>s,saveBadge:()=>'',saveState:noop,hydrateIconsIn:noop,app:{},paintMarks:()=>{marks++;},
    toast:(m:string)=>{toasts.push(m);},ui:(en:string)=>en,troubleKind,boardWords:(s:string)=>s,modalRoot:{children:[]},askOpen:()=>false,
    vanished:undefined,startupError:'',lastSaved:true,storageIssue:'',screen:'editor'};
  editorCalls(['let troubleSeen','let saveTrouble','let replacedStore','function attachDiskQueue(','function troubleNow(','function troubleKey(','function typing(','function openTrouble(','function troubleOpened('],screen);
  const queue=(screen.attachDiskQueue as (r:number)=>InstanceType<typeof DurableQueue>)(1);
  const settle=()=>new Promise(r=>setTimeout(r,5));
  queue.enqueue('one');await settle();
  assert.equal(opened,1,'the first failure opens the dialog');
  for(const edit of ['two','three','four']){queue.enqueue(edit);await settle();}
  assert.equal(opened,1,'Later is not undone by the next edit');
  assert.deepEqual(toasts,[],'and no toast repeats what the dialog said');
  assert.ok((screen.troubleNow as ()=>unknown)(),'the mark still has its trouble to show');
  assert.ok(marks>0);
});

test('a mark stays where it can be seen when the panel it sits in is folded',async()=>{
  const {workspaceHome}=await import('../src/workspace/home');
  const mark=troubleMarkHtml(full,true),lib={version:1 as const,entries:[]};
  const open=workspaceHome(lib,'recent','',mark,'system','ko','grid',true,undefined,'open');
  const folded=workspaceHome(lib,'recent','',mark,'system','ko','grid',true,undefined,'collapsed');
  const outsideSide=(html:string)=>html.replace(/<aside[\s\S]*?<\/aside>/,'');
  assert.equal((open.match(/data-action="notice-open"/g)??[]).length,1);
  assert.doesNotMatch(outsideSide(open),/notice-open/,'with the side list open it is in the list, by the agent switch');
  assert.equal((folded.match(/data-action="notice-open"/g)??[]).length,1,'drawn once');
  assert.match(outsideSide(folded),/notice-open/,'with the side list folded it is drawn outside it');
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main.slice(main.indexOf('function toggleHomeSidebar(){'),main.indexOf('function toggleHomeSidebar(){')+1500),/classList\.(add|toggle)\('ui-home-marks-float'/,'folding the side list in place takes the marks with it');
  assert.match(main,/panels\.right==='collapsed'\?`<div class="board-actions board-marks"><span class="ui-notice-marks" data-notice-marks>/,'with the inspector folded the marks sit over the board, where Preview sits on a board of pages');
});

/* Astra high 2: what the render-failed sheet offers is the person's: an agent can neither copy its details to the
   clipboard nor put the sheet away before the person has read it. Each case asks for a real press as well. */
test('the render-failed sheet\'s buttons are the person\'s alone, and each asks for a real press',async()=>{
  const {personOnlyRow}=await import('../src/agent/commands.mjs');
  assert.equal(personOnlyRow('fatal-copy'),'outside.copy-diagnostics');
  assert.equal(personOnlyRow('fatal-redraw'),'human.render-failed');
  assert.equal(personOnlyRow('fatal-close'),'human.render-failed');
  const main=readFileSync('src/main.ts','utf8');
  for(const [name,row] of [['fatal-redraw','human.render-failed'],['fatal-close','human.render-failed'],['fatal-copy','outside.copy-diagnostics']])
    assert.match(main,new RegExp("case '"+name+"': (\\{)?if\\(!trusted\\|\\|refusal\\(d,'"+row.replace('.','\\.')+"'\\)\\)break;"),name);
});

/* Astra high 3: Undo on a toast takes back the change that toast is about and nothing else. commit() hands back what
   it recorded; a change that recorded nothing gets no button; and a press saves what is being typed first, then looks
   again at whether that change is still the last one. */
test('a toast offers Undo only for the change it reports, and checks it again after typing is saved',async()=>{
  const {editorCalls}=await import('./support/editor-calls');
  const pushed:{undo?:string}[]=[];
  const screen:Record<string,unknown>={askOpen:()=>false,toasts:[],expireToasts:(l:unknown[])=>l,pushToast:(l:unknown[],m:string,at:number,id:number,o:{undo?:string})=>{pushed.push(o);return l;},
    boardWords:(s:string)=>s,toastId:0,paintToasts:()=>{},screen:'editor',editSession:3,project:{id:'b'},edits:{undo:[{seq:7}]}};
  editorCalls(['function undoToken(','function undoable('],screen);
  const undoable=screen.undoable as (m:string,c:{seq:number;author:{kind:string}}|null)=>void,token=screen.undoToken as ()=>string,you={kind:'person'};
  undoable('Moved.',{seq:7,author:you});
  assert.equal(pushed[0].undo,token(),'the change it reports is the last one, so Undo is offered');
  undoable('Moved.',null);
  assert.equal(pushed[1].undo,undefined,'nothing recorded, no Undo: it would take back an earlier change');
  undoable('Moved.',{seq:6,author:you});
  assert.notEqual(pushed[2].undo,token(),'an earlier change is never offered as the last one');
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/function commit\([^]*?\n  return recorded;\n\}/,'commit hands back what it recorded');
  assert.equal((main.match(/undoable\(/g)??[]).length-1,(main.match(/undoable\([^;]*,(done|moved)\)/g)??[]).length,'every Undo toast names the change it reports');
  assert.match(main,/function persist\(\) \{ if\(screen!=='editor'\)return;\n[^\n]*\n  if\(toasts\.some\(t=>t\.undo\)\)paintToasts\(\);/,'another change or a step takes a stale Undo off its toast');
  assert.match(main,/function history\([^)]*expect\?:string\) \{\n[^\n]*\n[^\n]*\n  saveTyping\(\);\n  if\(expect!==undefined&&expect!==undoToken\(\)\)/,'typing is saved before the check, and the check is the step\'s own');
  assert.match(main,/case 'undo': history\('undo',d,el\.dataset\.undoFor\);/,'the toast\'s change goes to the step');
});

/* Astra high 4 and 5: reloading counts as saved only when something was read, the folder that went missing and the last
   write are kept apart, and a reload that would throw away unsaved work asks first. */
const reloadScreen=(o:Record<string,unknown>)=>{
  const said:string[]=[];
  const screen:Record<string,unknown>={modalRoot:{querySelector:()=>null,children:[]},closeModal:()=>{},bounded:(p:unknown)=>p,storagePath:'',
    readBreadcrumb:()=>({path:'/old',revision:9,entries:6,at:''}),store:{},storeVanished:(s:{data:unknown})=>s.data===null?{path:'/old',revision:9,entries:6,at:''}:undefined,
    readLibrary:()=>({version:1,entries:[{project:{id:'disk'}}]}),attachDiskQueue:()=>'fresh queue',readTidied:()=>false,queueLibrary:()=>true,LIBRARY_KEY:'k',
    project:{id:'b'},screen:'home',openProject:()=>{},newHistory:()=>({}),render:()=>{},paintMarks:()=>{},toast:(m:string)=>{said.push(m);},ui:(en:string)=>en,
    library:{version:1,entries:[{project:{id:'window'}}]},diskQueue:'failed queue',storageIssue:'x',saveTrouble:'No space left on device (os error 28)',startupError:'',lastSaved:false,troubleSeen:'k',
    vanished:undefined,replacedStore:false,...o};
  editorCalls(['async function reloadFromDiskNow('],screen);
  return {screen,said,run:screen.reloadFromDiskNow as ()=>Promise<void>};
};
import {editorCalls} from './support/editor-calls';
test('a reload that read nothing leaves the window as it was: still unsaved, still in trouble',async()=>{
  const {screen,said,run}=reloadScreen({invoke:async()=>({revision:0,data:null,path:'/old'})});
  await run();
  assert.equal(screen.lastSaved,false,'nothing read, so nothing in the window is counted as saved');
  assert.equal(screen.saveTrouble,'No space left on device (os error 28)');
  assert.equal(screen.diskQueue,'failed queue','no fresh queue: that would be starting fresh without its question');
  assert.deepEqual((screen.library as {entries:{project:{id:string}}[]}).entries.map(e=>e.project.id),['window']);
  assert.match(said.join(' '),/not there|nothing saved/i);
});
test('a folder this window saved into after the old one went missing is not called the old one come back',async()=>{
  const {screen,said,run}=reloadScreen({invoke:async()=>({revision:3,data:'{}',path:'/old'}),vanished:{path:'/old',revision:9,entries:6,at:''},replacedStore:true,saveTrouble:'',lastSaved:true});
  await run();
  assert.ok(screen.vanished,'the old folder is still missing');
  assert.doesNotMatch(said.join(' '),/are back|Found it/);
  const back=reloadScreen({invoke:async()=>({revision:9,data:'{}',path:'/old'}),vanished:{path:'/old',revision:9,entries:6,at:''},replacedStore:false,saveTrouble:'',lastSaved:true});
  await back.run();
  assert.equal(back.screen.vanished,undefined,'read without this window having written there: the folder is back');
});
test('a failed save comes before the missing folder, so the backup choices are always reached; a reload that would lose work asks',()=>{
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/function troubleNow\(\):Trouble\|undefined\{if\(saveTrouble\)/,'unsaved work first');
  assert.match(main,/if\(saved&&!error&&vanished\)replacedStore=true;/,'a write that lands while the folder is missing made a new one');
  const reload=main.slice(main.indexOf('async function reloadFromDisk(){'),main.indexOf('async function reloadFromDiskNow(){'));
  assert.match(reload,/if\(\(!lastSaved\|\|saveTrouble\)&&!modalRoot\.querySelector\('\[data-reload-confirm\]'\)\)\{const c=reloadConfirm\(uiLanguage==='ko'\);showModal\(/);
});

/* Astra medium 7: a trouble that could not be shown (another dialog was open, the request to edit was up, the person was
   typing) is shown once those are done; and opening it from its mark counts as having seen it. */
test('a trouble put off for a dialog or for typing is shown once they are done, and opening it by hand counts as seen',async()=>{
  const {editorCalls}=await import('./support/editor-calls');
  let opened=0;let active:{matches:(s:string)=>boolean}|null={matches:()=>true};
  const screen:Record<string,unknown>={troubleSeen:'',modalRoot:{children:[],contains:()=>false},askOpen:()=>false,document:{get activeElement(){return active;}},HTMLElement:Object,
    troubleNow:()=>({kind:'full',detail:'No space left on device (os error 28)'}),showModal:()=>{opened++;},troubleDialog:()=>({title:'',subtitle:'',body:''}),icon:()=>'',
    screen:'editor',uiLanguage:'ko',nativeDesktop:true,library:{entries:[]},project:{},TextEncoder};
  editorCalls(['function troubleKey(','function typing(','function openTrouble(','function troubleOpened('],screen);
  const shown=screen.troubleOpened as ()=>boolean;
  assert.equal(shown(),false,'the person is typing: it waits');
  assert.equal(opened,0);
  active=null;
  assert.equal(shown(),true);assert.equal(opened,1,'typing over, it shows');
  assert.equal(shown(),true);assert.equal(opened,1,'once');
  screen.troubleSeen='';(screen.openTrouble as ()=>void)();
  assert.equal(screen.troubleSeen,'full:No space left on device (os error 28)','opened by hand is seen, so Later is not undone by the next failure');
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/function closeModal\(\)[^]*?offerAsk\(\);\n  offerTrouble\(\);\n\}/,'closing a dialog gives a waiting trouble its turn, after a waiting request');
  assert.match(main,/document\.addEventListener\('focusout',\(\)=>offerTrouble\(\)\);/,'and so does leaving a field');
  assert.match(main,/case 'notice-open': if\(!modalRoot\.children\.length\)openTrouble\(\); break;/,'the mark opens nothing over a dialog someone is in, whoever presses it');
});

/* Astra medium 8: the sheet answers its own buttons, from a real press, without the window's click handler (which may be
   what broke); Draw again takes the sheet away only once the screen was drawn, and otherwise says what stopped it now. */
test('Draw again keeps the sheet until the screen is drawn, and the sheet answers its own buttons',async()=>{
  const {editorCalls}=await import('./support/editor-calls');
  let removed=0,drawn=0;const pre={textContent:'first'};
  const sheet={remove:()=>{removed++;},querySelector:(s:string)=>s==='[data-fatal-detail]'?pre:null};
  const screen:Record<string,unknown>={render:()=>{drawn++;if(drawn===1)throw new TypeError('still broken');},String,Error};
  editorCalls(['function fatalPress('],screen);
  const press=screen.fatalPress as (a:string,s:typeof sheet)=>void;
  press('fatal-redraw',sheet);
  assert.equal(removed,0,'the redraw threw, so the sheet stays');
  assert.match(pre.textContent,/still broken/,'and says what stopped it this time');
  press('fatal-redraw',sheet);
  assert.equal(removed,1,'drawn, it goes');
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/sheet\.addEventListener\('click',e=>\{const b=\(e\.target as HTMLElement\)\.closest<HTMLElement>\('button\[data-action\]'\);if\(!b\)return;e\.stopPropagation\(\);e\.preventDefault\(\);if\(!e\.isTrusted\)return;/,'its own handler, a real press only');
  assert.doesNotMatch(renderFailedHtml('x',{ko:true,board:true}),/그대로 있어요/,'it claims nothing it cannot know when the app stopped');
});

/* Astra medium 11: a page seen on its own covers the editor, so its bar carries the marks too, and a write updates every
   copy; the connected mark's popover is placed in the window, never clipped by a narrow panel. */
test('the marks ride on the page seen on its own, every copy counts writes, and the popover stays in the window',()=>{
  const main=readFileSync('src/main.ts','utf8');
  const bar=main.slice(main.indexOf('function openPageView('),main.indexOf('function closePageView('));
  assert.match(bar,/<span class="ui-notice-marks" data-notice-marks>\$\{marksHtml\(\)\}<\/span><button type="button" class="page-view-edit/,'beside Edit in the app');
  const bump=main.slice(main.indexOf('function bumpConnect('),main.indexOf('let tokensOpen'));
  assert.doesNotMatch(bump,/app\.querySelector/,'a write is counted on every mark, the page view\'s too');
  assert.match(main,/document\.addEventListener\('toggle',e=>\{const d=e\.target;if\(!\(d instanceof HTMLDetailsElement\)\|\|!d\.matches\('\.notice-mark-connect'\)\|\|!d\.open\)return;placeMarkPopover\(d\);\},true\);/);
  const css=readFileSync('src/ui/screens/shell.css','utf8');
  assert.match(css,/\.ui-popover\.notice-pop\.is-placed \{ position: fixed;/);
});

/* No fifth place: a strip across the top of the window, a red box, a banner shouting at the page. The only strip
   left is agent mode's, which goes with agent mode when the command table is finished. */
const appSource=()=>{const out:string[]=[];const walk=(dir:string)=>{for(const n of readdirSync(dir)){const p=join(dir,n);if(statSync(p).isDirectory()){if(n!=='vendor'&&n!=='generated')walk(p);}else if(/\.ts$/.test(n)&&!/library-render\.ts$/.test(n))out.push(p);}};walk('src');return out;};
test('no notice is drawn outside its four places',()=>{
  const strips:string[]=[],alerts:string[]=[];
  for(const file of appSource()){
    const src=readFileSync(file,'utf8');
    for(const m of src.matchAll(/class="((?:[^"]*\s)?ui-strip(?:\s[^"]*)?)"/g))strips.push(file+': '+m[1]);
    if(/role="alert"/.test(src)&&!file.endsWith('src/ui/notices.ts'))alerts.push(file);
  }
  assert.deepEqual(strips,['src/main.ts: agent-banner ui-strip ui-strip-agent'],'agent mode keeps its strip until it goes; nothing else draws one');
  assert.deepEqual(alerts,[],'an alert is a dialog or the sheet, drawn by src/ui/notices.ts');
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/function bannersHtml\(\)\{return agentBannerHtml\(\);\}/,'the slot over the screen holds agent mode and nothing else');
  assert.doesNotMatch(main,/className='fatal-error'/,'the red box is gone');
});
