import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,isStarterPage} from '../src/editor/starter';
import {frameWidth} from '../src/editor/space';
import {personAt} from '../src/agent/dispatch';
import {stepForScreen} from '../src/ledger/session';
import {hopLimit} from '../src/page-hops';
import {isFreePage} from '../src/free-page';
import {esc} from '../src/html';
import {editorActions,editorCalls,noop} from './support/editor-calls';

test('a frame link opens the hidden page for viewing and only Edit in the app records its reveal',async()=>{
  const project=newBoard('Board'),starter=project.activePageId,person=personAt({isTrusted:true})!;
  const fits:string[]=[],saves:string[]=[],notices:string[]=[];
  const events=new Map<string,Function>(),listen=(type:string,fn:Function)=>events.set(type,fn);
  let surface='.space-frame.entered',previewOpen=false;
  const frame={contentWindow:{},closest:(s:string)=>s.split(',').includes(surface),focus:noop,blur:noop};
  const section={querySelector:()=>frame,classList:{add:noop,remove:noop}};
  const pageViewRoot={innerHTML:'',querySelector:()=>({querySelector:noop})};
  const screen={...editorActions(project),who:personAt,boardSection:()=>section,enteredPage:'',
    document:{addEventListener:listen,querySelectorAll:()=>[frame]},addEventListener:listen,fitFrame:(id:string)=>fits.push(id),
    askOpen:()=>false,closeModal:()=>{previewOpen=false;},pageView:undefined,pageViewRoot,pageViewKey:()=>'',pageViewEntered:false,
    pageViewStopped:false,pageViewHops:hopLimit(2),ui:(en:string)=>en,esc,icon:noop,hydrateIconsIn:noop,syncStateAttributes:noop,
    isStarterPage,isFreePage,freePageFrame:()=>Promise.resolve({isConnected:false}),mountPagePreview:noop,
    persist:()=>saves.push(JSON.stringify(project)),toast:(s:string)=>notices.push(s)};
  editorCalls(['function commit(','function enterPage(','function leavePage(','function openPageView(','function closePageView(',
    'async function action(',"document.addEventListener('dblclick'","addEventListener('message'"],screen);
  const {commit,action,closePageView}=screen as typeof screen & {commit:Function;action:Function;closePageView:Function};
  commit(()=>{project.pages.push({id:'article',name:'Article',blocks:[],kind:'html',html:'<p>Article</p>'});project.activePageId='article';},person,'edit.page-add');
  const before=JSON.stringify(project),history=JSON.stringify(screen.edits),saved=[...saves];
  function enter(){events.get('dblclick')!({isTrusted:true,target:{closest:()=>({dataset:{boardShield:'article'}})}});}
  function link(id:string){events.get('message')!({source:frame.contentWindow,data:{aphrodite:'frame',kind:'page',id}});}
  function unchanged(){
    assert.equal(JSON.stringify(project),before,'includes board, frame coordinates, starter and ledger');
    assert.equal(JSON.stringify(screen.edits),history,'includes undo and redo');
    assert.deepEqual(saves,saved);
  }
  enter();link('article');unchanged();assert.deepEqual(fits,['article']);assert.equal(pageViewRoot.innerHTML,'');
  enter();link(starter);unchanged();assert.ok(pageViewRoot.innerHTML.includes(`data-page-view="${starter}"`));
  closePageView();surface='.preview-modal';previewOpen=true;
  link(starter);unchanged();assert.equal(previewOpen,false);assert.ok(pageViewRoot.innerHTML.includes(`data-page-view="${starter}"`));
  surface='.page-view';
  await action({dataset:{action:'page-view',id:'article'}},person,true);
  screen.pageViewEntered=true;link(starter);unchanged();
  assert.ok(pageViewRoot.innerHTML.includes(`data-page-view="${starter}"`));
  await action({dataset:{action:'page-view',id:'article'}},person,true);
  for(let i=0;i<2;i++){screen.pageViewEntered=true;link('article');assert.equal(screen.pageViewEntered,false);}
  screen.pageViewEntered=true;link(starter);link(starter);
  assert.equal(screen.pageViewStopped,true);assert.equal(notices.length,1);
  assert.ok(pageViewRoot.innerHTML.includes('data-page-view="article"'));unchanged();
  closePageView();surface='.space-frame.entered';enter();link(starter);
  await action({dataset:{action:'page-view-edit'}},person,true);
  assert.equal(pageViewRoot.innerHTML,'');assert.equal(project.activePageId,starter);assert.equal(project.starter,undefined);
  const frames=project.space!.frames;
  assert.ok(frames[starter].x>=frames.article.x+frameWidth(frames.article));
  assert.equal(screen.edits.undo.length,2);assert.equal(project.ledger?.seq,2);
  assert.deepEqual(project.ledger?.changes.at(-1)?.author,person.author);
  const undone=stepForScreen(project,'undo',screen.edits,person.author)!.project;
  assert.equal(undone.activePageId,'article');assert.equal(undone.starter,undefined);
  assert.deepEqual(undone.space!.frames,frames);assert.equal(screen.edits.undo.length,1);
});
