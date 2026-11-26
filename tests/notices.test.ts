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
  assert.match(troubleDialog(vanished,'home',false).body,/old folder untouched/);
  assert.match(troubleDialog(vanished,'home',false).body,/6 boards/);
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

test('nothing in a dialog promises a save that the code does not make',()=>{
  for(const t of [vanished,full,conflict,failed,unread])for(const where of ['home','editor'] as const)for(const ko of [false,true]){
    const d=troubleDialog(t,where,ko),text=(d.title+d.subtitle+d.body);
    assert.doesNotMatch(text,/automatically|by itself|저절로|자동으로 다시/,'a failed save stays stopped until the person reloads');
  }
  assert.match(troubleDialog(full,'editor',true).body,/저장하지 못한 변경은 버려져요/,'reloading says what it throws away');
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
    document:{querySelectorAll:()=>[]},control:(s:string)=>s,saveBadge:()=>'',saveState:noop,hydrateIconsIn:noop,app:{},paintMarks:()=>{marks++;},
    toast:(m:string)=>{toasts.push(m);},ui:(en:string)=>en,troubleKind,boardWords:(s:string)=>s,modalRoot:{children:[]},askOpen:()=>false,openTrouble:()=>{opened++;},
    vanished:undefined,startupError:'',lastSaved:true,storageIssue:'',screen:'editor'};
  editorCalls(['let troubleSeen','let saveTrouble','function attachDiskQueue(','function troubleNow(','function troubleOpened('],screen);
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
