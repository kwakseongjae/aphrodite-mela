import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {deleteDialogHtml,renameDialogHtml,workspaceDeleteDialogHtml} from '../src/workspace/home-dialogs';
import {linkOut} from '../src/free-page';
import {esc} from '../src/html';
import {exportBodyHtml} from '../src/editor/export-view';
import {commandPaletteHtml} from '../src/editor/command-palette';
import {troubleDialog} from '../src/ui/notices';
import {editorCalls,noop} from './support/editor-calls';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');

/**
 * A sheet nobody asked for.
 *
 * On 2026-09-10 the brand kit was noted as "already open" on a first run, and two clean installs
 * since have found it closed. Rather than close the item on not reproducing it, this pins the thing
 * that makes it impossible: the brand kit has one call site and it sits inside the action switch, so
 * the only way to it is a click on `data-action="brand-kit"`. Nothing at boot can reach it.
 *
 * If someone later opens it from a timer, a first-run branch or a restored state, this fails and
 * they have to say so on purpose.
 */
test('the brand kit can only be opened by someone clicking it',()=>{
  const opens=[...main.matchAll(/brandHtml\(/g)];
  assert.equal(opens.length,1,`the brand kit is built in ${opens.length} places; it used to be one`);
  const line=main.split('\n').find(l=>l.includes('brandHtml('))!;
  assert.match(line,/case 'brand-kit':/,'its one call site has to be an action, not something that runs on its own');
});

/**
 * The same question for every other sheet: which of them can appear without being asked for?
 * `welcomeModal` may — a first run is exactly when it should — and nothing else should join it
 * without a deliberate change here.
 */
test('only the welcome sheet opens itself',()=>{
  const selfOpening=new Set<string>();
  for(const [,name] of main.matchAll(/(?:^|[^.\w])([a-zA-Z]+Modal)\(\)/gm)){
    const uses=main.split('\n').filter(l=>l.includes(`${name}()`)&&!l.startsWith(`function ${name}`)&&!l.startsWith(`async function ${name}`));
    // A call that is not inside the action switch and not inside another modal's own body.
    if(uses.some(l=>!l.includes('case ')&&!l.trimStart().startsWith('//')&&l.includes('boot')))selfOpening.add(name);
  }
  assert.deepEqual([...selfOpening],[],`these open without being asked: ${[...selfOpening].join(', ')}`);
  assert.match(main,/welcomeModal/,'the welcome sheet still exists for a first run');
});

test('opening a dialog focuses its first field, primary action or keep answer and respects the request and palette',()=>{
  let focused='',markup='',later=()=>{};
  const target=(name:string)=>({focus:()=>{focused=name;}});
  function controls(){
    return [...markup.split('ui-modal-body">')[1].matchAll(/<(input|textarea|select|button)\b([^>]*)>/g)].map(([,tag,attrs])=>{
      const attr=(key:string)=>attrs.match(new RegExp(` ${key}="([^"]*)"`))?.[1];
      const action=attr('data-action');
      return {...target(action??attr('id')??attr('name')??tag),tagName:tag.toUpperCase(),dataset:{action,...(/ data-first-focus\b/.test(attrs)?{firstFocus:''}:{})},
        classList:{contains:(name:string)=>attr('class')?.split(' ').includes(name)},
        matches:(selector:string)=>selector===':disabled'&&attrs.includes(' disabled'),
        getClientRects:()=>attr('type')==='hidden'||attrs.includes(' hidden')?[]:[{}]};
    });
  }
  const modalRoot={children:[],contains:()=>!!focused,
    set innerHTML(value:string){markup=value;},
    querySelector:(selector:string)=>{
      if(selector==='.modal-content')return {querySelectorAll:controls};
      if(selector==='.modal')return target('dialog');
      if(selector.includes('ask-allow'))return target('ask-allow');
      if(selector==='input,textarea,button')return target('header-close');
      return null;
    }};
  const frame={contentWindow:{},closest:()=>true};
  let message:(e:object)=>void=noop;
  const screen={modalRoot,app:{},document:{activeElement:null,querySelectorAll:()=>[frame]},window:{},modalReturnFocus:null,comparisonObserver:null,fatalUp:()=>false,
    addEventListener:(_name:string,fn:typeof message)=>{message=fn;},ui:(en:string)=>en,linkOut,esc,leavePage:noop,
    askOpen:()=>markup.includes('class="ask-dialog"'),control:(s:string)=>s,icon:()=>'',hydrateIcons:noop,hydrateNativeLibraries:noop,syncStateAttributes:noop,
    setTimeout:(fn:()=>void)=>{later=fn;}};
  editorCalls(['function showModal(','function focusModal(','function offerLink(',"addEventListener('message'"],screen);
  const {showModal}=screen as typeof screen & {showModal:Function};
  const project={id:'board',name:'Board'};
  const exported=exportBodyHtml({sections:true,ko:false,approved:false,shown:'board',view:'prompt',code:'',pageCard:'',pages:1,boardExtension:'aphrodite',labels:{copyPrompt:'Copy',bundle:'Save ZIP'}});
  const cases=[
    [renameDialogHtml('en',project),'name'],['<button>Back</button><textarea hidden></textarea><select disabled></select><textarea name="brief"></textarea>','brief'],
    ['<button>Back</button><select name="language"></select>','language'],[exported,'download-bundle'],
    [deleteDialogHtml('en',project),'close-modal'],[workspaceDeleteDialogHtml('ko','w',2),'close-modal'],
    ['<iframe></iframe>','dialog'],['<div class="connect-switch"><button type="button" class="ui-btn ui-btn-primary ui-btn-md" data-action="agent-connect-toggle" aria-pressed="true">On</button></div>','dialog'],[commandPaletteHtml([],'','en'),'command-search'],
    // 0.3-G2b: a dialog that opens without a press starts on what loses nothing, which it names.
    [troubleDialog({kind:'vanished',path:'/a',boards:2},'home',false).body,'close-modal'],[troubleDialog({kind:'full',detail:'os error 28'},'editor',true).body,'disk-backup'],['<div class="ask-dialog"><button data-action="ask-allow">Allow</button></div>','ask-allow']
  ];
  for(const [body,expected] of cases){
    focused=''; markup=''; showModal('Title','',body);
    assert.match(markup,/<button[^>]+data-action="close-modal"[^>]*>/,'the header close is still a button');
    later();
    assert.equal(focused,expected);
  }
  focused='';markup='';
  message({source:frame.contentWindow,data:{aphrodite:'frame',kind:'link',href:'https://example.org/article'}});
  assert.match(markup,/data-action="open-link"/);
  later();assert.equal(focused,'close-modal','Enter or Space on the first focused answer stays in the app');
  focused='';markup='';showModal('Commands','',commandPaletteHtml([],'','en'));
  focused='command-search';later();
  assert.equal(focused,'command-search','the deferred focus preserves a field already focused by its opener');
});

test('Tab can return to the close button and Escape returns focus to the opener',()=>{
  let key:(e:Record<string,unknown>)=>void=()=>{};
  const document={activeElement:{} as {focus:()=>void},querySelector:()=>null,addEventListener:(_type:string,listener:typeof key)=>{key=listener;}};
  const button=()=>({focus(){document.activeElement=this;}});
  const opener=button(),close=button(),primary=button(),dialog=button();
  const modalRoot={children:[dialog],innerHTML:'',contains:(el:unknown)=>[close,primary,dialog].some(c=>c===el),
    querySelector:(s:string)=>s==='.modal'?dialog:null,querySelectorAll:()=>[close,primary]};
  const screen={document,app:{inert:true},modalRoot,modalReturnFocus:opener,comparisonObserver:null,analysisGeneration:0,
    leaving:0,pageView:null,enteredPage:'',dockGroupOpen:false,helpOpen:false,askOpen:()=>false,tourActive:()=>false,screen:'editor',offerAsk:noop,syncStateAttributes:noop,fatalUp:()=>false,offerTrouble:noop,heldKeys:new Set<string>()};
  editorCalls(['function closeModal(',"document.addEventListener('keydown'"],screen);
  for(const [from,shiftKey,to] of [[primary,false,close],[close,true,primary],[dialog,true,primary]] as const){
    from.focus(); key({key:'Tab',shiftKey,preventDefault:noop}); assert.equal(document.activeElement,to);
  }
  key({key:'Escape'});
  assert.equal(document.activeElement,opener);
  assert.equal(screen.app.inert,false);
});
