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
  assert.match((await status.textContent())!,/Could not copy|복사하지 못했습니다/);
  await page.locator('[data-action="fatal-backup"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-fatal-detail]')?.textContent?.includes('disk refused'));
  assert.match((await status.textContent())!,/The file could not be saved\.|파일로 저장하지 못했어요\./);
  await page.evaluate(`navigator.clipboard.writeText=async text=>window.copied=text`);await copy.click();
  const copied=await page.evaluate<string>('window.copied');
  assert.match(copied,/test diagnostic/);assert.match(copied,/disk refused/);
  assert.doesNotMatch(copied,/Could not copy|복사하지 못했습니다|could not be saved|저장하지 못했어요/);
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
  await scene('disk');await scene('empty');assert.equal(await badge(),'unsaved');
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
