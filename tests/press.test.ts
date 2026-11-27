import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import type {Dialog} from 'playwright-core';
import {keyboardBrowser} from './support/keyboard-browser';

let rig:Awaited<ReturnType<typeof keyboardBrowser>>;
before(async()=>{rig=await keyboardBrowser();});
after(async()=>{await rig?.browser.close();});
const scene=(command:string)=>rig.page.evaluate('scene.'+command+'()');
const focused=()=>rig.page.evaluate(()=> (document.activeElement as HTMLElement)?.dataset.action);
beforeEach(async()=>{
  if(rig.page.url()!=='about:blank')await rig.page.evaluate(()=>localStorage.clear());
  await rig.page.goto('http://localhost/');
  await scene('board');
});
test('reloading after reading an unreadable store only warns if this window has unsaved changes',async()=>{
  const {page}=rig;
  const key='aphrodite-project-library-v1';
  await scene('edit');
  const saved=await page.evaluate(key=>localStorage.getItem(key)!,key);
  assert.ok(saved);
  await page.evaluate(key=>localStorage.setItem(key,'{unreadable'),key);
  await page.reload();
  await page.locator('#modal-root [data-action="close-modal"].ui-btn-md').click();
  await page.locator('.notice-mark-trouble').click();
  await page.locator('#modal-root [data-action="close-modal"].ui-btn-md').click();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),'{unreadable');

  await page.evaluate(([key,value])=>localStorage.setItem(key,value),[key,saved]);
  const prompts:string[]=[];
  const accept=async(dialog:Dialog)=>{prompts.push(dialog.type());await dialog.accept();};
  page.on('dialog',accept);
  try{await page.reload();}finally{page.off('dialog',accept);}
  assert.deepEqual(prompts,[]);
  assert.equal(await page.locator('.notice-mark-trouble').count(),0);
  await scene('board');await scene('refuse');
  assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false,
    'a refused edit still needs a warning');
});
test('Space held before the request, including its native button click on release, never allows',async()=>{
  const {page}=rig;
  await page.keyboard.down('Space');await scene('request');await page.waitForTimeout(10);
  assert.equal(await focused(),'ask-allow');
  await page.keyboard.down('Space');await page.keyboard.up('Space');
  assert.equal(await page.locator('.ask-modal').count(),1);
  await page.keyboard.down('Space');assert.equal(await page.locator('.ask-modal').count(),1);
  await page.keyboard.up('Space');assert.equal(await page.locator('.ask-modal').count(),0);
});
test('Enter on Draw again never redoes an approval on the palette exposed by redraw',async()=>{
  const {page}=rig;
  // The approval and its Undo are ordinary trusted presses, leaving a real Redo on the palette.
  await page.locator('[data-action="approve"]').focus();await page.keyboard.press('Enter');
  assert.equal(await scene('approved'),true);await page.keyboard.press('Control+z');assert.equal(await scene('approved'),false);
  await scene('palette');const redo=page.locator('[data-palette][data-action="redo"]');await redo.focus();
  await redo.evaluate(el=>el.classList.add('is-active'));await scene('sheet');
  await page.keyboard.down('Enter');await page.keyboard.up('Enter');
  assert.equal(await page.locator('.fatal-scrim').count(),0);assert.equal(await scene('approved'),false);
  assert.equal(await page.locator('#command-list').count(),1);
});
test('palette navigation leaves a focused toast alone',async()=>{
  const {page}=rig;await scene('palette');await scene('toast');const toast=page.locator('#toast button').last();await toast.focus();
  await page.keyboard.press('ArrowDown');assert.ok(await toast.evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Enter');assert.equal(await page.locator('#command-list').count(),1);
});
test('an edit request waits behind the sheet and Tab skips Copy inside its collapsed details',async()=>{
  const {page}=rig;await scene('sheet');await scene('request');await page.waitForTimeout(20);
  assert.equal(await page.locator('.ask-modal').count(),0);assert.equal(await focused(),'fatal-redraw');
  await page.locator('.fatal-scrim summary').focus();await page.keyboard.press('Tab');assert.equal(await focused(),'fatal-close');
  await page.keyboard.press('Escape');await page.waitForTimeout(10);assert.equal(await focused(),'ask-allow');
});
test('forward Tab from the collapsed sheet summary skips the hidden Copy button',async()=>{
  const {page}=rig;await scene('sheet');await page.locator('.fatal-scrim summary').focus();await page.keyboard.press('Tab');
  assert.equal(await focused(),'fatal-close');
});
test('the deferred request focus cannot steal the keys from a later sheet',async()=>{
  const {page}=rig;await page.evaluate('scene.request();scene.sheet()');await page.waitForTimeout(20);
  assert.equal(await focused(),'fatal-redraw');await page.keyboard.press('Escape');assert.equal(await focused(),'ask-allow');
});
test('a late font dialog keeps the edit request focused until the person answers',async()=>{
  const {page}=rig;await scene('request');
  assert.equal(await focused(),'ask-allow');
  await page.locator('#app [data-action="font-picker"]').evaluate(el=>(el as HTMLElement).click());
  const search=page.locator('#font-search');
  await search.waitFor({state:'attached'});
  assert.equal(await focused(),'ask-allow');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.ask-dialog').count(),0);
  assert.ok(await search.evaluate(el=>el===document.activeElement));
});
test('Escape released under delegation leaves the next request a fresh Escape',async()=>{
  const {page}=rig;await scene('lock');await scene('sheet');await page.keyboard.down('Escape');
  assert.equal(await page.locator('.fatal-scrim').count(),0);
  await page.keyboard.up('Escape');await scene('unlock');await scene('request');await page.waitForTimeout(10);
  assert.equal(await focused(),'ask-allow');await page.keyboard.press('Escape');assert.equal(await page.locator('.ask-modal').count(),0);
});
test('Escape closes the open connection popover and returns to its summary',async()=>{
  const {page}=rig;await scene('mark');const summary=page.locator('.connect-mark summary').first();await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('.connect-mark[open]').count(),1);
  await page.locator('.connect-mark[open] button').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.connect-mark[open]').count(),0);assert.ok(await summary.evaluate(el=>el===document.activeElement));
});

for(const focusInside of [false,true]){
  test('a connected agent pressing Escape '+(focusInside?'closes the focused mark':'leaves the unfocused mark open for the person'),async()=>{
    const {page}=rig;
    await scene('mark');
    await page.locator('.connect-mark > summary').click();
    const open=page.locator('.connect-mark[open]');
    const focus=focusInside?open.locator('button'):page.locator('#component-search');
    await focus.focus();
    assert.ok(await focus.evaluate(el=>el===document.activeElement));
    assert.ok(await open.isVisible());
    const reply=await page.evaluate<{error?:string}>("window.aphroditeAgent.run('key',{key:'Escape'})");
    assert.equal(reply.error,undefined);
    if(!focusInside){
      assert.ok(await open.isVisible());
      assert.ok(await focus.evaluate(el=>el===document.activeElement));
      await page.keyboard.press('Escape');
    }
    assert.equal(await open.count(),0);
  });
}

for(const menu of ['connected mark','dock group','editor help','folio-ws','folio-lang','folio-theme','folio-help','folio-more']){
  test('Escape closes the dialog first, then the unfocused '+menu,async()=>{
    const {page}=rig,home=menu.startsWith('folio-');
    if(home){await scene('edit');await scene('home');}
    if(menu==='connected mark')await scene('mark');
    const details=home?'.'+menu:menu==='connected mark'?'.connect-mark':'.help-fab';
    const dock=menu==='dock group';
    const trigger=page.locator(dock?'[data-action="dock-group"]':details+' > summary').first();
    const open=page.locator(dock?'.dock-menu':details+'[open]').first();
    await trigger.click();
    const outside=page.locator(home?'#project-search':'#component-search');
    await outside.focus();
    assert.ok(await outside.evaluate(el=>el===document.activeElement));
    assert.ok(await open.isVisible());

    await scene('welcome');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal-root .modal').count(),0);
    assert.ok(await open.isVisible(),'the dialog received the first Escape');
    assert.ok(await outside.evaluate(el=>el===document.activeElement));
    await page.keyboard.press('Escape');
    assert.equal(await open.count(),0);
  });
}

test('dialog Tab wraps in both directions and Escape restores its opener',async()=>{
  const {page}=rig;
  const opener=page.locator('[data-action="project"]').first();await opener.focus();await page.keyboard.press('Enter');
  const buttons=page.locator('#modal-root button:visible');
  await buttons.last().focus();await page.keyboard.press('Tab');assert.ok(await buttons.first().evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Shift+Tab');assert.ok(await buttons.last().evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Escape');assert.ok(await opener.evaluate(el=>el===document.activeElement));
  assert.equal(await page.locator('#app').evaluate(el=>(el as HTMLElement).inert),false);
});
test('untrusted key events cannot answer a request, and changing focus cancels a trusted press',async()=>{
  const {page}=rig;await scene('request');await page.waitForTimeout(10);
  const allow=page.locator('[data-action="ask-allow"]');
  await allow.evaluate(el=>{for(const type of ['keydown','keyup'])el.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));});
  assert.equal(await allow.count(),1);await page.keyboard.down('Enter');
  await page.locator('[data-action="ask-decline"]').focus();await allow.focus();await page.keyboard.up('Enter');
  assert.equal(await allow.count(),1);await page.keyboard.press('Enter');assert.equal(await allow.count(),0);
});
test('Not now answers only when the person presses the button on the request',async()=>{
  const {page}=rig;await scene('request');
  const decline=page.locator('.ask-modal [data-action="ask-decline"]');
  await decline.evaluate(el=>(el as HTMLElement).click());
  assert.equal(await decline.count(),1,'a page-made click on the real button left the request open');
  await page.evaluate(()=>{
    const other=document.createElement('button');
    other.dataset.action='ask-allow';other.id='outside-request';
    Object.assign(other.style,{position:'fixed',top:'0',left:'0',zIndex:'2147483647'});
    other.textContent='Allow';document.body.append(other);
  });
  await page.locator('#outside-request').click();
  assert.equal(await decline.count(),1,'a trusted click outside the request left it open');
  await decline.focus();await page.keyboard.press('Enter');
  assert.equal(await decline.count(),0);
  assert.equal((await scene('request') as {status:string}).status,'declined');
});
test('the sheet replaces failure feedback and Copy contains only the diagnostics',async()=>{
  const {page}=rig;await scene('sheet');await page.locator('.fatal-scrim summary').click();
  await page.evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('clipboard refused')}}});
    window.__TAURI_INTERNALS__={invoke:async(cmd)=>{if(cmd==='plugin:dialog|save')return '/backup';throw Error('disk refused')}};
  `);
  const copy=page.locator('[data-action="fatal-copy"]'),status=page.locator('[data-fatal-status]');
  await copy.click();await copy.click();assert.equal(await status.count(),1);
  assert.match((await status.textContent())!,/Could not copy\. Select the text and copy it\.|복사하지 못했어요\. 글을 선택해서 복사해 주세요\./);
  await page.locator('[data-action="fatal-backup"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-fatal-detail]')?.textContent?.includes('disk refused'));
  assert.match((await status.textContent())!,/The file could not be saved\.|파일로 저장하지 못했어요\./);
  await page.evaluate(`navigator.clipboard.writeText=async text=>window.copied=text`);await copy.click();
  const copied=await page.evaluate<string>('window.copied');
  assert.match(copied,/test diagnostic/);assert.match(copied,/disk refused/);
  assert.doesNotMatch(copied,/Could not copy|복사하지 못했어요|could not be saved|저장하지 못했어요/);
});
test('the standalone page and editor show the allowed scope after an agent writes',async()=>{
  const {page}=rig;await scene('mark');
  const editor=page.locator('#app [data-connect-who]').first();const allowed=await editor.textContent();
  await scene('wrote');await scene('page');
  assert.equal(await page.locator('.page-view [data-connect-who]').textContent(),allowed);
  assert.equal(await editor.textContent(),allowed);
  await scene('wrote');
  assert.deepEqual(await page.locator('[data-connect-who]').allTextContents(),[allowed,allowed]);
});
test('a repeated key on Allow stays inert until a new press',async()=>{
  const {page}=rig;await scene('request');await page.waitForTimeout(10);assert.equal(await focused(),'ask-allow');
  await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
  assert.equal(await page.locator('.ask-modal').count(),1);
  await page.keyboard.press('Enter');assert.equal(await page.locator('.ask-modal').count(),0);
});

test('the real badge agrees on first paint, receipt and redraw after an empty read or refusal',async()=>{
  const {page}=rig;
  const badge=()=>page.locator('[data-save-badge]').getAttribute('data-save-badge');
  assert.equal(await badge(),'saved');
  await scene('disk');await scene('reloadDisk');assert.equal(await badge(),'unsaved');
  await scene('redraw');assert.equal(await badge(),'unsaved');
  await scene('edit');assert.equal(await badge(),'saving');
  await scene('refuse');assert.equal(await badge(),'unsaved');
  await page.evaluate('finishWrite(1)');await scene('redraw');assert.equal(await badge(),'unsaved');
});

test('a focused toast returns focus to the palette when it expires',async()=>{
  const {page}=rig;await page.clock.install();await scene('palette');
  const search=page.locator('#command-search');await search.focus();await scene('toast');
  await page.locator('#toast button').last().focus();await page.clock.fastForward(11_000);
  assert.equal(await page.locator('#toast button').count(),0);
  assert.ok(await search.evaluate(el=>el===document.activeElement));
});

test('focus sent below a dialog, palette or request returns to its last focused control',async()=>{
  const {page}=rig;
  for(const open of ['dialog','palette','request']){
    if(open==='dialog')await page.locator('[data-action="project"]').first().click();
    else await scene(open);
    const onTop=page.locator('#modal-root button:visible').last();
    await onTop.focus();
    await page.evaluate(()=>{
      const lower=document.createElement('button');document.body.append(lower);
      lower.focus();lower.remove();
    });
    assert.ok(await onTop.evaluate(el=>el===document.activeElement),open);
    await page.keyboard.press('Escape');
  }
});

for(const surface of ['board dialog','palette']){
  test('a composing Enter and its release leave the '+surface+' text field alone',async()=>{
    const {page}=rig;
    if(surface==='palette')await scene('palette');
    else await page.locator('[data-action="project"]').first().click();
    const field=page.locator(surface==='palette'?'#command-search':'#rename-form input');
    await field.fill('한글');
    if(surface==='palette'){
      // Select a real command without moving focus out of the search field.
      await field.fill('');
      await page.locator('[data-palette]:visible').first().evaluate(el=>el.classList.add('is-active'));
    }
    // Keep the actual event and inspect it after every capture listener has run.
    await page.evaluate(()=>window.addEventListener('keydown',e=>Object.assign(window,{composingDown:e}),{capture:true,once:true}));
    const session=await page.context().newCDPSession(page);
    try{
      await session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Process',code:'Enter',windowsVirtualKeyCode:229});
      await session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert.equal(await page.evaluate('window.composingDown.defaultPrevented'),false);
      assert.equal(await field.count(),1);
      assert.ok(await field.evaluate(el=>el===document.activeElement));
    }finally{await session.detach();}
  });
}

test('an open connection mark leaves Space, Tab and Enter at the focus outside it',async()=>{
  const {page}=rig;await scene('mark');
  const search=page.locator('#component-search'),summary=page.locator('.connect-mark summary').first();
  await search.focus();await page.keyboard.press('Tab');
  const next=await page.evaluateHandle(()=>document.activeElement);
  await summary.click();await search.click();await page.keyboard.press('Tab');
  assert.ok(await next.evaluate(el=>el===document.activeElement));
  await search.focus();await page.keyboard.type('a b');
  assert.equal(await search.inputValue(),'a b');
  assert.equal(await page.locator('.connect-mark[open]').count(),1);
  await page.locator('[data-action="project"]').first().focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#rename-form').count(),1);
});

test('the dock group opened by keyboard keeps focus across its redraw and Escape closes it',async()=>{
  const {page}=rig,group=page.locator('.dock [data-action="dock-group"]').first();
  await group.focus();await page.keyboard.press('Enter');
  assert.ok(await group.evaluate(el=>el===document.activeElement));
  assert.equal(await page.locator('.dock-menu').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.dock-menu').count(),0);
  assert.ok(await group.evaluate(el=>el===document.activeElement));
});

test('Space pans over a focused editor button and never approves the board',async()=>{
  const {page}=rig;await page.locator('[data-action="approve"]').focus();
  await page.keyboard.down('Space');
  assert.equal(await page.locator('#canvas-scroll.pan-ready').count(),1);
  await page.keyboard.up('Space');
  assert.equal(await page.locator('#canvas-scroll.pan-ready').count(),0);
  assert.equal(await scene('approved'),false);
});

test('Space dismisses the focused toast without panning',async()=>{
  const {page}=rig;await scene('toast');
  const dismiss=page.locator('#toast button').last();await dismiss.focus();
  await page.keyboard.down('Space');
  assert.equal(await page.locator('#canvas-scroll.pan-ready').count(),0);
  await page.keyboard.up('Space');
  assert.equal(await page.locator('#toast button').count(),0);
});

test('page-made Space events cannot start pan mode or release the person’s Space',async()=>{
  const {page}=rig;
  const send=(type:string)=>page.evaluate(type=>document.body.dispatchEvent(
    new KeyboardEvent(type,{key:' ',code:'Space',bubbles:true,cancelable:true})),type);
  const pan=page.locator('#canvas-scroll.pan-ready');
  await send('keydown');await send('keyup');assert.equal(await pan.count(),0);
  await page.keyboard.down('Space');await send('keyup');assert.equal(await pan.count(),1);
  await page.keyboard.up('Space');assert.equal(await pan.count(),0);
});

test('home storage shows the same pending, saved and failed state on first paint, receipt and redraw',async()=>{
  const {page}=rig,meta=page.locator('[data-storage-state]'),warning=page.locator('.ui-home-storage .ui-dot-warn');
  await scene('disk');await scene('edit');await scene('home');
  const states=[
    {text:/Saving to disk…|디스크에 저장 중…/,warn:0},
    {text:/Saved to disk|디스크에 저장됨/,warn:0},
    {text:/Unsaved · export a backup|저장되지 않음 · 백업을 내보내세요/,warn:1},
  ];
  for(const [index,state] of states.entries()){
    if(index===1)await page.evaluate('finishWrite(7)');
    if(index===2){await scene('saveHome');await page.evaluate("failWrite(new Error('disk full'))");}
    for(const redraw of [false,true]){
      if(redraw)await scene('redraw');
      assert.match((await meta.textContent())!,state.text);
      assert.equal(await warning.count(),state.warn);
    }
  }
});

test('a failed browser storage write shows an unsaved badge through redraw',async()=>{
  const {page}=rig;
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};});
  await scene('edit');
  const badge=page.locator('[data-save-badge]');
  assert.equal(await badge.getAttribute('data-save-badge'),'unsaved');
  await scene('redraw');assert.equal(await badge.getAttribute('data-save-badge'),'unsaved');
});

for(const lost of ['blur','Meta release']){
  test('a fresh Enter on the request still works after a lost keyup and '+lost,async()=>{
    const {page}=rig;await scene('request');
    const session=await page.context().newCDPSession(page);
    const enter={key:'Enter',code:'Enter',windowsVirtualKeyCode:13};
    try{
      if(lost==='Meta release')await page.keyboard.down('Meta');
      await session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...enter,modifiers:lost==='blur'?0:4});
      if(lost==='blur'){
        await page.evaluate(()=>{
          const frame=document.createElement('iframe');document.body.append(frame);
          frame.contentWindow!.focus();frame.remove();
        });
        await page.locator('.ask-modal [data-action="ask-allow"]').focus();
      }else await page.keyboard.up('Meta');
      assert.equal(await page.locator('.ask-modal').count(),1);
      // macOS never sent the old Enter release. The next physical down is not a repeat.
      await session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...enter});
      await session.send('Input.dispatchKeyEvent',{type:'keyUp',...enter});
      assert.equal(await page.locator('.ask-modal').count(),0);
    }finally{await session.detach();}
  });
}

test('the sheet permits native copy of its selected details and blocks a plain key aimed underneath',async()=>{
  const {page}=rig;await scene('sheet');await page.locator('.fatal-scrim summary').click();
  const detail=page.locator('[data-fatal-detail]');
  const selection=await detail.evaluate(el=>{
    const range=document.createRange();range.selectNodeContents(el);
    const s=window.getSelection()!;s.removeAllRanges();s.addRange(range);
    return s.toString();
  });
  assert.match(selection,/test diagnostic/);
  const copy=page.evaluate(()=>new Promise<string>(resolve=>{
    document.addEventListener('copy',e=>{
      // Observe the native copy without replacing the developer's system clipboard.
      e.preventDefault();resolve(e.isTrusted?window.getSelection()!.toString():'');
    },{once:true});
  }));
  const session=await page.context().newCDPSession(page);
  try{
    await session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'c',code:'KeyC',windowsVirtualKeyCode:67,modifiers:4,commands:['copy']});
    await session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'c',code:'KeyC',modifiers:4});
    assert.equal(await copy,selection);
  }finally{await session.detach();}
  const passed=await page.locator('#app').evaluate(el=>el.dispatchEvent(
    new KeyboardEvent('keydown',{key:'a',code:'KeyA',bubbles:true,cancelable:true})));
  assert.equal(passed,false);
});

test('the delegated input gate still receives composing keys before the keyboard router',async()=>{
  const {page}=rig;
  await page.addInitScript(()=>{
    window.addEventListener('keydown',e=>{
      if(e.keyCode===229)Object.assign(window,{composingDown:e});
    },true);
  });
  await page.reload();await scene('board');await scene('lock');
  const session=await page.context().newCDPSession(page);
  try{
    await session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Process',code:'Enter',windowsVirtualKeyCode:229});
    await session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await page.evaluate('window.composingDown.defaultPrevented'),true);
  }finally{await session.detach();}
});

const connectedMark=()=>rig.page.locator('#app .connect-mark').evaluate(el=>({
  allowed:el.querySelector('[data-connect-who]')?.textContent,
  count:el.querySelector('[data-connect-writes]')?.textContent,
  logo:el.querySelector('[data-connect-mark] img')?.getAttribute('src')??null,
}));
test('forgetting the agent who wrote clears its logo beside the other allowed agent',async()=>{
  const {page}=rig;
  for(const caller of ['claude-code','codex']){
    await page.evaluate(`window.aphroditeAgent.run('connect',{},${JSON.stringify(caller)})`);
    await page.locator('[data-action="ask-allow"]').click();
  }
  const edit=await page.evaluate<{ok:boolean}>("scene.titleEdit('New title')");
  assert.equal(edit.ok,true);
  assert.deepEqual(await connectedMark(),{allowed:'Claude Code, Codex',count:'1',logo:'/brand/agents/claude-spark-clay.svg'});
  await scene('connections');
  await page.locator('[data-action="agent-forget"][data-name="claude-code"]').click();
  assert.deepEqual(await connectedMark(),{allowed:'Codex',count:'1',logo:null});
});

test('setting the current title leaves the connected mark at zero with no writer',async()=>{
  await scene('mark');
  const reply=await rig.page.evaluate<{ok:boolean;seq:number}>('scene.titleEdit()');
  assert.equal(reply.ok,true);
  assert.equal(reply.seq,0);
  assert.deepEqual(await connectedMark(),{allowed:'any agent',count:'0',logo:null});
});

test('batches, system changes and undo count once per recorded change',async()=>{
  const {page}=rig;
  await scene('mark');
  const run=async(kind:string,payload:object,count:number)=>{
    const reply=await page.evaluate<{error?:string}>(`window.aphroditeAgent.run(${JSON.stringify(kind)},${JSON.stringify(payload)},'claude-code')`);
    assert.equal(reply.error,undefined);
    assert.equal(await page.evaluate("window.aphroditeAgent.run('state').then(r=>r.seq)"),count);
    assert.equal((await connectedMark()).count,String(count));
  };
  const refused=await page.evaluate<{status:number;error:string}>(`window.aphroditeAgent.run('apply',{
    reason:'Rename the selected block',base_revision:'r2:1:2:3',ops:[{op:'update',block_id:'selection',fields:{title:'New title'}}]
  },'claude-code')`);
  assert.equal(refused.status,400);
  assert.match(refused.error,/selection/);
  assert.deepEqual(await connectedMark(),{allowed:'any agent',count:'0',logo:null});
  const batch={ops:[{op:'add',component_kind:'cta'}],reason:'Add a call to action'};
  await run('apply',batch,1);
  await run('system',{id:'mono',reason:'Use the mono system'},2);
  await run('system',{id:'mono',reason:'Keep the mono system'},2);
  await run('act',{action:'undo'},3);
  await run('act',{action:'redo'},4);
});

async function reconnect(){
  await scene('connections');
  const toggle=rig.page.locator('.connect-switch [data-action="agent-connect-toggle"]');
  await toggle.click({force:true});
  await toggle.click({force:true});
}
test('a new connection stays at zero when a recorded edit finishes replying',async()=>{
  const {page}=rig;
  await scene('mark');
  await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));
  try{
    await page.evaluate("window.oldEdit=scene.titleEdit('Landed before disconnect');void 0");
    assert.equal(await page.evaluate("window.aphroditeAgent.run('state').then(r=>r.seq)"),1);
    assert.equal((await connectedMark()).count,'1');
    await reconnect();
    await page.clock.runFor(100);
    assert.equal(await page.evaluate('window.oldEdit.then(r=>r.ok)'),true);
    assert.deepEqual(await connectedMark(),{allowed:'any agent',count:'0',logo:null});
  }finally{await page.clock.resume();}
});

test('a command waiting for a picture credits only the connection it started under',async()=>{
  const {page}=rig;
  await scene('mark');
  let release!:()=>void;
  const held=new Promise<void>(yes=>{release=yes;});
  const sample='**/assets/demo-reference.jpg';
  await page.route(sample,async route=>{
    await held;
    await route.fulfill({path:'public/assets/demo-reference.jpg',contentType:'image/jpeg'});
  },{times:1});
  const requested=page.waitForRequest(sample,{timeout:10_000});
  const edit=page.evaluate<{ok:boolean;seq:number}>(`window.aphroditeAgent.run('act',{action:'demo-reference'},'claude-code')`);
  try{await requested;await reconnect();}finally{release();}
  const reply=await edit;
  assert.equal(reply.ok,true);
  assert.equal(reply.seq,1);
  assert.deepEqual(await connectedMark(),{allowed:'any agent',count:'0',logo:null});
});

test('the connection keeps its count and writer across board changes and disk reloads',async()=>{
  const {page}=rig;
  await scene('mark');
  assert.equal(await page.evaluate("scene.titleEdit('First board change').then(r=>r.ok)"),true);
  const mark={allowed:'any agent',count:'1',logo:'/brand/agents/claude-spark-clay.svg'};
  await page.evaluate("scene.disk(localStorage.getItem('aphrodite-project-library-v1'))");
  await page.evaluate("scene.board('Second board')");
  assert.equal(await page.locator('#app').getAttribute('data-project'),'Second board');
  assert.deepEqual(await connectedMark(),mark);
  // Only the first board was saved. Reading that library from disk returns the editor to Home.
  await scene('reloadDisk');
  assert.equal(await page.locator('#app').getAttribute('data-screen'),'home');
  assert.deepEqual(await connectedMark(),mark);
});
