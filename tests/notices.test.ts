import {windowWithDisk} from './support/save-window';
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
  assert.match(ko,/별도 파일이라 들어 있지 않아요/,'what a backup leaves out is said');
  assert.doesNotMatch(ko,/가져오기로 다시 열 수/,'re-import is promised only when the file is one the importer takes');
  assert.match(troubleDialog(full,'editor',true,{reimport:true}).body,/보드 가져오기가 읽는 형식의 파일이에요\(승인은 다시 해야 해요\)/);
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
  const html=connectMarkHtml({writes:2,allowed:'Claude Code',channel:'127.0.0.1:4410'},false);
  assert.deepEqual(actionsOf(html),['agent-disconnect']);
  assert.match(html,/data-connect-writes[^>]*>2</);
  assert.match(html,/<summary[\s\S]*Claude Code[\s\S]*<\/summary>/,'who is let in is on the mark itself, not only behind it');
  assert.match(html,/⌘Z/,'it says how to take an agent\'s change back');
});

test('a screen that could not be drawn says so in a sheet, with the words the system wrote folded away',()=>{
  const html=renderFailedHtml('TypeError: x is undefined\nmain.ts:1:1',{ko:true,board:true});
  assert.match(html,/화면을 그리다가 멈췄어요/);
  assert.deepEqual(actionsOf(html),['fatal-redraw','fatal-backup','fatal-backup-all','fatal-copy','fatal-close']);
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
  const {s,edit,writes,questions}=windowWithDisk();
  Object.assign(s,{typing:()=>false,troubleKey:(t:Trouble)=>t.kind,openTrouble:(t:Trouble)=>{s.troubleSeen=t.kind;questions.push(t.kind);}});
  editorCalls(['function troubleOpened('],s);s.modalRoot.children=[];
  edit('one');await Promise.resolve();writes[0].done.reject(new Error('No space left on device (os error 28)'));
  await s.saves.flush().catch(()=>{});
  for(const name of ['two','three','four']){edit(name);await s.saves.flush().catch(()=>{});}
  assert.deepEqual(questions,['full']);assert.equal(s.troubleNow().kind,'full');
});

test('a mark stays where it can be seen when the panel it sits in is folded',async()=>{
  const {workspaceHome}=await import('../src/workspace/home');
  const mark=troubleMarkHtml(full,true),lib={version:1 as const,entries:[]};
  const open=workspaceHome(lib,'recent','',mark,'system','ko','grid',undefined,undefined,'open');
  const folded=workspaceHome(lib,'recent','',mark,'system','ko','grid',undefined,undefined,'collapsed');
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
  assert.match(main,/function persist\(edit=true\) \{ if\(screen!=='editor'\)return;\n  if\(toasts\.some\(t=>t\.undo\)\)\{toasts=settleUndo\(toasts,undoToken\(\)\);paintToasts\(\);\}/,'another change or a step takes a stale Undo off its toast for good');
  assert.match(main,/function history\([^)]*expect\?:string\) \{\n[^\n]*\n[^\n]*\n  saveTyping\(\);\n  if\(expect!==undefined&&expect!==undoToken\(\)\)/,'typing is saved before the check, and the check is the step\'s own');
  assert.match(main,/case 'undo': history\('undo',d,el\.dataset\.undoFor\);/,'the toast\'s change goes to the step');
});

/* Astra high 4 and 5: reloading counts as saved only when something was read, the folder that went missing and the last
   write are kept apart, and a reload that would throw away unsaved work asks first. */
import {editorCalls} from './support/editor-calls';
test('empty reads preserve the live boards and a stopped queue; the failed save leads the dialog',async()=>{
  const {s,edit,reads,writes}=windowWithDisk();
  edit('work');await Promise.resolve();writes[0].done.reject(new Error('disk full'));await s.saves.flush().catch(()=>{});
  const read=s.reloadFromDiskNow();reads[0].resolve({revision:0,data:null,path:'/old'});await read;
  assert.equal(s.saves.saved,false);assert.equal(s.saves.noCopy,true);assert.equal(s.project.name,'work');
  assert.match(s.troubleNow().detail,/disk full/);edit('more');await assert.rejects(s.saves.flush());assert.equal(writes.length,1);
});
test('only a replacement written by this window keeps the old folder reminder after a read',async()=>{
  for(const replaced of [false,true]){
    const {s,edit,writes,reads,said}=windowWithDisk('missing');
    if(replaced){edit('A');await Promise.resolve();writes[0].done.resolve(1);await s.saves.flush();}
    const read=s.reloadFromDiskNow();reads[0].resolve({revision:2,path:'/old',data:JSON.stringify(s.library)});await read;
    assert.equal(!!s.saves.missing,replaced);assert.doesNotMatch(said.join(' '),/are back|Found it/);
  }
});
/* Astra medium 7: a trouble that could not be shown (another dialog was open, the request to edit was up, the person was
   typing) is shown once those are done; and opening it from its mark counts as having seen it. */
test('a trouble put off for a dialog or for typing is shown once they are done, and opening it by hand counts as seen',async()=>{
  const {editorCalls}=await import('./support/editor-calls');
  let opened=0;let active:{matches:(s:string)=>boolean}|null={matches:()=>true};
  const screen:Record<string,unknown>={troubleSeen:'',modalRoot:{children:[],contains:()=>false},askOpen:()=>false,document:{get activeElement(){return active;}},HTMLElement:Object,
    troubleNow:()=>({kind:'full',detail:'No space left on device (os error 28)'}),showModal:()=>{opened++;},troubleDialog:()=>({title:'',subtitle:'',body:''}),icon:()=>'',
    screen:'editor',uiLanguage:'ko',nativeDesktop:true,library:{entries:[]},project:{},TextEncoder,refreshBackupFormat:()=>{},reimportable:()=>false,pageView:undefined,fatalUp:()=>false};
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
  assert.match(main,/case 'notice-open': if\(!modalRoot\.children\.length&&!fatalUp\(\)\)openTrouble\(\); break;/,'the mark opens nothing over a dialog someone is in, whoever presses it');
});

/* Astra medium 8: the sheet answers its own buttons, from a real press, without the window's click handler (which may be
   what broke); Draw again takes the sheet away only once the screen was drawn, and otherwise says what stopped it now. */
test('Draw again keeps the sheet until the screen is drawn, and the sheet answers its own buttons',async()=>{
  const {editorCalls}=await import('./support/editor-calls');
  let removed=0,drawn=0;const pre={textContent:'first'};
  const sheet={remove:()=>{removed++;},querySelector:(s:string)=>s==='[data-fatal-cause]'?pre:null};
  const screen:Record<string,unknown>={render:()=>{drawn++;if(drawn===1)throw new TypeError('still broken');},String,Error};
  screen.dismissSheet=(sheet:{remove:()=>void})=>sheet.remove();
  editorCalls(['function fatalPress('],screen);
  const press=screen.fatalPress as (a:string,s:typeof sheet)=>void;
  press('fatal-redraw',sheet);
  assert.equal(removed,0,'the redraw threw, so the sheet stays');
  assert.match(pre.textContent,/still broken/,'and says what stopped it this time');
  press('fatal-redraw',sheet);
  assert.equal(removed,1,'drawn, it goes');
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/sheet\.addEventListener\('click',async e=>\{[^]*?if\(!pressOrigin\(e\)\.isTrusted\)return;/,'its own handler, a real press only');
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

/* Astra recheck 5: while the old folder is missing, write A lands (it made a folder in that place) and write B fails. The
   queue reports success only for its latest write, so each landed write is recorded on its own: the folder this window
   made is never read back as the old one, and the failed write still comes first. */
test('a write that lands while the folder is missing is remembered even when a later write fails',async()=>{
  const {s,edit,writes}=windowWithDisk('missing');
  edit('A');edit('B');await Promise.resolve();writes[0].done.resolve(1);
  await new Promise(r=>setImmediate(r));writes[1].done.reject(new Error('No space left on device'));await s.saves.flush().catch(()=>{});
  assert.equal(s.saves.replaced,true);assert.equal(s.troubleNow().kind,'full');
});
test('a refused edit outranks the missing folder and offers backups before reload',()=>{
  const {s,edit}=windowWithDisk('missing');edit('bad\uD800');
  const trouble=s.troubleNow();assert.equal(trouble.retries,true);assert.equal(trouble.kind,'failed');
  const d=troubleDialog(trouble,'editor',false);assert.match(d.subtitle,/next change tries saving again/);
  assert.deepEqual(actionsOf(d.body).filter(a=>a!=='close-modal'),['disk-backup','hub-backup','disk-reload']);
});
test('each empty reread offers the backup dialog again',async()=>{
  const {s,reads}=windowWithDisk();let count=0;s.openTrouble=()=>count++;
  for(let i=0;i<2;i++){const read=s.reloadFromDiskNow();reads[i].resolve({data:null,path:'/old',revision:0});await read;}
  assert.equal(count,2);const d=troubleDialog(s.troubleNow(),'editor',false);
  assert.equal(firstFocus(d.body),'disk-backup');assert.deepEqual(actionsOf(d.body).slice(0,3),['disk-backup','hub-backup','disk-reload']);assert.doesNotMatch(d.subtitle,/stopped/);
});

/* Astra recheck 6: an edit the disk refused before it was queued changed the open board but not the window's list of boards.
   Save every board keeps the board as it is on screen, so the file holds the change the dialog says it holds. */
test('every board saved as a backup holds the open board as it is on screen, the refused change included',async()=>{
  const {editorActions}=await import('./support/editor-calls');
  const {initialProject}=await import('../src/model');
  const p=initialProject(),kept={...p,name:'Before the refused change'};
  const saved:string[]=[];
  const screen:Record<string,unknown>={...editorActions(p),library:{version:1,entries:[{project:kept,updatedAt:'',createdAt:'',pinned:false,archived:false}]},workspaces:{activeId:'w'},
    saveFile:async(_n:string,text:string)=>{saved.push(text);return true;},toast:()=>{},ui:(en:string)=>en};
  editorCalls(['function liveLibrary(','function backupLibrary(','async function action('],screen);
  p.name='After the refused change';
  const {personAt}=await import('../src/agent/dispatch');
  await (screen.action as Function)({dataset:{action:'hub-backup'}},personAt({isTrusted:true}),true);
  const file=JSON.parse(saved[0]);
  assert.deepEqual(file.entries.map((e:{project:{name:string}})=>e.project.name),['After the refused change']);
});

/* Astra recheck 7: "Import board opens it again" is said only of a file the importer takes, found by running the importer on
   the very text the backup writes; and what a backup leaves out is the files kept apart from the board, not every picture. */
test('a backup is said to open again only when the importer takes its text, and it names what it leaves out',async()=>{
  const {importedProject}=await import('../src/workspace/library');
  const {initialProject}=await import('../src/model');
  const screen:Record<string,unknown>={importedProject,library:{version:1,entries:[]},TextEncoder};
  editorCalls(['function reimportable('],screen);
  const reimportable=screen.reimportable as (text:string)=>boolean;
  const p=initialProject();
  assert.equal(reimportable(JSON.stringify(p,null,2)),true);
  const broken={...p,name:'half \uD800 pair'};
  assert.equal(reimportable(JSON.stringify(broken,null,2)),false,'the importer refuses it, so the dialog does not promise it');
  const main=readFileSync('src/main.ts','utf8');

  for(const ko of [false,true]){
    const d=troubleDialog(full,'editor',ko,{reimport:true});
    assert.doesNotMatch(d.body,/Pictures and videos placed on (it|boards) are not in|보드에 놓인 그림·영상 파일은 들어 있지 않/,'not every picture is left out');
    assert.match(d.body,ko?/따로 놓은 그림·영상과 이미지 라이브러리의 그림은 별도 파일/:/placed on the board by themselves, and pictures from the image library, are separate files/);
  }
});

/* Astra recheck 8: every button on the render-failed sheet is the person's alone. Its two saves have actions of their own,
   refused to an agent, and copying and saving are answered before action() reads anything of the app's state, which may
   be what broke (here the open page cannot even be read). */
test('the sheet saves and copies before the app\'s state is read, with actions an agent is refused',async()=>{
  const {personOnlyRow}=await import('../src/agent/commands.mjs');
  for(const a of ['fatal-backup','fatal-backup-all'])assert.equal(personOnlyRow(a),'outside.render-failed-backup',a);
  const {editorCalls}=await import('./support/editor-calls');
  const {personAt,agentDispatch,refusal}=await import('../src/agent/dispatch');
  const {humanOnlyBlocked,isDoorAction}=await import('../src/agent/authority');
  const saved:[string,string][]=[];const copied:string[]=[];const pre={textContent:'TypeError: x'};
  const screen:Record<string,unknown>={humanOnlyBlocked,isDoorAction,refusal,editorMode:'agent',delegation:{scope:{}},isBlockedWhileDelegated:()=>true,NOBODY:{author:{kind:'unknown',name:''},surface:'ui'},JSON,
    currentPage:()=>{throw new Error('the open page cannot be read');},project:{id:'p',name:'Live'},fileName:(_p:unknown,n:string)=>n,liveLibrary:()=>({version:1,entries:['live']}),
    saveFile:async(n:string,text:string)=>{saved.push([n,text]);return true;},navigator:{clipboard:{writeText:async(t:string)=>{copied.push(t);}}},
    document:{querySelector:(q:string)=>q==='[data-fatal-detail]'?pre:null},toast:()=>{},ui:(en:string)=>en};
  editorCalls(['async function action('],screen);
  const action=screen.action as (el:unknown,d:unknown,trusted:boolean)=>Promise<void>;
  const press=(a:string)=>({dataset:{action:a}});
  for(const a of ['fatal-backup','fatal-backup-all','fatal-copy'])await action(press(a),agentDispatch('Astra','mcp'),false);
  assert.deepEqual([saved.length,copied.length],[0,0],'an agent saves and copies nothing');
  for(const a of ['fatal-backup','fatal-backup-all','fatal-copy'])await action(press(a),personAt({isTrusted:true}),true);
  assert.deepEqual(saved.map(x=>x[0]),['aphrodite.json','aphrodite-workspace.json']);
  assert.deepEqual(JSON.parse(saved[1][1]).entries,['live'],'every board as it is now');
  assert.deepEqual(copied,['TypeError: x'],'and all of it while an agent holds the screen: the sheet is the person\'s');
});

/* Astra recheck 9 and 11: while the render-failed sheet is up it owns the keyboard and the pointer, in both phases, and a
   save trouble neither opens nor takes focus behind it; once the sheet goes, the trouble gets its turn. ⌘C still copies. */
test('save trouble waits behind the sheet, then gets its turn on dismissal',()=>{
  let offered=0;
  const screen:Record<string,unknown>={fatalUp:()=>true,troubleNow:()=>full,troubleKey:()=>'full',troubleSeen:'',typing:()=>false,
    askOpen:()=>false,modalRoot:{children:[]},offerTrouble:()=>offered++,offerAsk:()=>{},takeReturnFocus:()=>null,restoreFocus:()=>true};
  editorCalls(['function troubleOpened(','function dismissSheet('],screen);
  assert.equal((screen.troubleOpened as Function)(),false);
  (screen.dismissSheet as Function)({remove(){}});
  assert.equal(offered,1);
});

/* Astra recheck 10: Start fresh forgets the missing folder only once what the window holds has landed on disk; a write that
   cannot be queued or fails keeps the folder's record and says nothing of a fresh start. Once this window has made a folder
   in that place, the question says it saves there, not in a new folder. */
test('starting fresh keeps the missing folder until the save lands, and names the folder it saves into',async()=>{
  const {s,edit,press,writes,questions,said}=windowWithDisk('missing');
  edit('A');await Promise.resolve();writes[0].done.resolve(1);await s.saves.flush();
  const starting=press('disk-start-fresh');await new Promise(r=>setImmediate(r));writes[1].done.reject(new Error('full'));await starting;
  assert.ok(s.saves.missing);assert.doesNotMatch(said.join(' '),/Started fresh/);assert.match(questions[0],/the folder this window made at/);
});

/* Astra recheck 12: each sentence says only what the code knows. The raw copy holds the save before the last only if there
   is one; a full disk is the disk the boards are on, not the whole Mac; a stopped window stops saving boards, not every file;
   the page seen on its own has its mark beside Edit. Space on a toast's button presses it, and an open popover is placed
   again when the window changes size. */
test('the dialogs scope what they claim, and Space and a resized window leave the toast and the popover usable',()=>{
  for(const ko of [false,true]){
    const home=troubleDialog(unread,'home',ko).body;
    assert.match(home,ko?/있다면 그 직전 저장본/:/the save before it if there is one/);
    const f=troubleDialog(full,'editor',ko);
    assert.doesNotMatch(f.title,ko?/이 Mac의 저장 공간/:/Your Mac is out of space/);
    assert.match(f.title,ko?/보드를 저장하는 디스크/:/The disk the boards are saved on/);
    for(const t of [full,conflict,failed])assert.match(troubleDialog(t,'editor',ko).subtitle,ko?/보드를 디스크에 더 저장하지 않아요/:/saves no more boards to disk/);
    const page=troubleDialog(full,'page',ko);
    assert.match(page.body,ko?/"앱에서 편집" 옆의 표시/:/a mark beside Edit in the app/);
    assert.deepEqual(actionsOf(page.body).filter(a=>a!=='close-modal'),['disk-backup','hub-backup','disk-reload'],'the board is open there too');
  }
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/troubleDialog\(t,screen==='home'\?'home':pageView\?'page':'editor'/);
  assert.match(main,/window\.addEventListener\('resize',\(\)=>document\.querySelectorAll<HTMLDetailsElement>\('details\.connect-mark\[open\]'\)\.forEach\(placeMarkPopover\)\);/);
});

/* The browser build has no disk line or missing folder: a refused save there says so in its toast and opens no dialog over
   the person's work. */
test('in the browser build a refused save is a toast, not a dialog',async()=>{
  const {s,edit,said}=windowWithDisk('browser-full');let opened=0;
  s.troubleOpened=()=>{opened++;return true;};
  edit('browser');assert.equal(s.saves.saved,false);assert.equal(opened,0);assert.equal(s.troubleNow(),undefined);
  assert.match(said.join(' '),/Could not save on this device/);
});
test('only the refused-save reload description explains the discard without repeating the retry',()=>{
  for(const ko of [false,true]){
    const sentence=ko?'디스크에 저장된 마지막 상태로 돌아가요. 저장하지 못한 변경은 버려지고, 그 전에 한 번 더 물어요.':'This goes back to what was last saved on disk. Unsaved changes are thrown away, and you are asked first.';
    assert.ok(troubleDialog({...failed,retries:true},'editor',ko).body.includes(sentence));
    assert.ok(!troubleDialog(failed,'editor',ko).body.includes(sentence));
  }
});

/* A placed mark popover is fixed in the window at the top main.ts gives it, and nothing pins its bottom too: on Home the
   rule that opens the unplaced popover upward set a bottom as well, so the placed one was squeezed between the two and
   its surface stopped after the title while its text ran on below. */
test('a placed mark popover keeps its whole content on its surface, on Home as in the editor',async()=>{
  const {rules,value,el}=await import('./support/css');
  const {readdirSync}=await import('node:fs');
  const src=new URL('../src/',import.meta.url);
  const sheets=readdirSync(src,{recursive:true}).map(String).filter(f=>f.startsWith('ui/')&&f.endsWith('.css')&&f!=='ui/tokens.css').sort();
  const all=rules(sheets.map(f=>readFileSync(new URL(f,src),'utf8')).join('\n'));
  const pop=(placed:boolean)=>el(['ui-popover','notice-pop',...(placed?['is-placed']:[])]);
  for(const host of ['ui-home-marks','ui-notice-marks']){
    const chain=[el([host]),el(['ui-notice-mark','notice-mark-connect','connect-mark']),pop(true)];
    assert.equal(value(all,chain,'bottom'),'auto',host+': placed, only its top is set');
    assert.equal(value(all,chain,'position'),'fixed',host);
  }
  assert.match(value(all,[el(['ui-home-marks']),el(['ui-notice-mark','notice-mark-connect','connect-mark']),pop(false)],'bottom')??'',/100%/,'unplaced on Home, it still opens upward');
});

/* The connected mark's logo is the agent whose change it last counted, kept with the count: a mark drawn afresh (the page
   seen on its own, opened by the person's press, which takes the screen back) shows the same logo as one a write updated in
   place, and with no change counted yet there is none, on every view alike. */
test('every connected mark shows the logo of the agent whose change it counted, however it was drawn',async()=>{
  const {editorCalls,noop}=await import('./support/editor-calls');
  const painted:string[]=[];
  const screen:Record<string,unknown>={agentMode:()=>'connected',agentEndpoint:undefined,nativeDesktop:false,ui:(en:string)=>en,HUMAN:'human',lease:null,connectWrites:0,connectWriter:'',
    callerMarkHtml:(who:string)=>'<logo '+who+'>',allowedText:()=>'any agent',uiLanguage:'en',connectMarkHtml:(s:{holderMark:string})=>'mark['+s.holderMark+']',
    document:{querySelectorAll:(q:string)=>q==='[data-connect-writes]'?[{}]:q==='[data-connect-mark]'?[{set innerHTML(v:string){painted.push(v);}}]:[]},hydrateIconsIn:noop,render:noop,String};
  editorCalls(['function bumpConnect(','function connectMarkNow('],screen);
  const mark=screen.connectMarkNow as ()=>string;
  assert.equal(mark(),'mark[]','nothing counted yet: no logo');
  (screen.bumpConnect as (by:string)=>void)('claude-code');
  assert.deepEqual(painted,['<logo claude-code>'],'the marks on screen take the logo in place');
  screen.lease={label:'human',since:0};
  assert.equal(mark(),'mark[<logo claude-code>]','drawn afresh after the person took the screen back, it shows the same logo');
  const main=readFileSync('src/main.ts','utf8');
  assert.equal((main.match(/(?<!let )connectWrites=0;/g)??[]).length,(main.match(/connectWrites=0;connectWriter='';/g)??[]).length,'the logo is forgotten wherever the count is');
});

/* The sheet's two failure lines speak alike: the copy one in the same polite ending as the save one. */
test('the render-failed sheet says a failed copy as it says a failed save',()=>{
  const main=readFileSync('src/main.ts','utf8');
  assert.match(main,/status\.textContent=ko\?'복사하지 못했어요\. 글을 선택해서 복사해 주세요\.':'Could not copy\. Select the text and copy it\.';/);
  assert.match(main,/status\.textContent=ko\?'파일로 저장하지 못했어요\.':'The file could not be saved\.';/);
  assert.doesNotMatch(main,/복사하지 못했습니다\. 글을 선택해 복사하세요\./,'the old line is nowhere');
});
