import {after,before,beforeEach,test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {keyboardBrowser} from './support/keyboard-browser';

let rig:Awaited<ReturnType<typeof keyboardBrowser>>;
before(async()=>{rig=await keyboardBrowser();});
after(async()=>{await rig?.browser.close();});
beforeEach(async()=>{
  const {page}=rig;
  if(page.url()!=='about:blank')await page.evaluate(()=>localStorage.clear());
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://localhost/');
});

async function openSampleDuringDelay(t:TestContext){
  const {page}=rig;
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  t.after(()=>page.clock.resume());
  await page.locator('[data-action="welcome-sample"]').click();
  await page.locator('.space-frame.active').waitFor();
  assert.equal(await page.locator('.tour-card').count(),0);
}

async function assertFirstTourVisible(){
  const {page}=rig;
  assert.equal(await page.locator('#app').getAttribute('data-onboarding'),'tour-pending');
  assert.ok(await page.locator('.tour-card').isVisible());
}

test('Escape during the first tour delay leaves it pending and one Escape on the visible card ends it',async t=>{
  const {page}=rig;
  await openSampleDuringDelay(t);
  await page.keyboard.press('Escape');
  await page.clock.fastForward(400);
  await assertFirstTourVisible();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tour-card').isVisible(),false);
  assert.equal(await page.locator('#app').getAttribute('data-onboarding'),'done');
});

test('a second Escape 100 ms after closing the Board dialog still lets the first tour appear',async t=>{
  const {page}=rig;
  await openSampleDuringDelay(t);
  await page.locator('[data-action="project"]').first().click();
  assert.ok(await page.locator('#rename-form').isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#rename-form').count(),0);
  await page.clock.fastForward(100);
  await page.keyboard.press('Escape');
  await page.clock.fastForward(300);
  await assertFirstTourVisible();
});

test('a connected agent pressing Escape during the delay still lets the first tour appear',async t=>{
  const {page}=rig;
  await openSampleDuringDelay(t);
  await page.evaluate('scene.mark()');
  // Dispatch while paused, then run both the agent reply timer and the tour timer.
  const reply=await page.evaluateHandle<{result:Promise<{error?:string}>}>("({result: window.aphroditeAgent.run('key',{key:'Escape'})})");
  await page.clock.runFor(400);
  assert.equal((await reply.evaluate(r=>r.result)).error,undefined);
  await assertFirstTourVisible();
});

test('a dialog opened during the first tour delay gets Escape before the tour starts',async t=>{
  const {page}=rig;
  await openSampleDuringDelay(t);
  await page.locator('[data-action="project"]').first().click();
  await page.clock.fastForward(1000);
  const card=page.locator('.tour-card');
  assert.equal(await card.count(),0);
  await page.keyboard.down('Escape');
  assert.equal(await page.locator('#rename-form').count(),0);
  await page.keyboard.down('Escape'); // A held dismissal still belongs to the dialog.
  await page.keyboard.up('Escape');
  await page.clock.fastForward(400);
  assert.ok(await card.isVisible());
  await page.locator('#component-search').focus();
  await page.keyboard.press('Escape');
  assert.equal(await card.isVisible(),false);
  assert.equal(await page.locator('#app').getAttribute('data-onboarding'),'done');
});

test('the first tour leaves the directions dialog and its proposal button exposed',async()=>{
  const {page}=rig;
  await page.locator('[data-action="welcome-sample"]').click();
  const card=page.locator('.tour-card');
  await card.waitFor();
  await page.route('**/assets/demo-reference.jpg',route=>route.fulfill({path:'public/assets/demo-reference.jpg'}));
  await page.keyboard.press('r');
  await page.locator('[data-action="demo-reference"]').click();
  await page.locator('[data-action="analyze-reference"]').click();
  await page.locator('[data-action="compare-directions"]').click();
  await page.locator('[data-action="choose-direction"]').first().click();
  await page.keyboard.press('r');
  await page.locator('[data-action="analyze-reference"]').click();
  await page.locator('[data-action="compare-directions"]').click();
  const propose=page.locator('#modal-root [data-action="propose-directions"]');
  await propose.scrollIntoViewIfNeeded();
  const hit=await propose.evaluate(el=>{
    const r=el.getBoundingClientRect(),node=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return el.contains(node)?'button':node?.closest('.tour-card')?'tour card':node?.tagName;
  });
  assert.equal(hit,'button');
  await propose.click();
  assert.ok(await page.locator('[data-action="proposal-keep"]').count()>0);
  assert.ok(await card.isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await card.isVisible(),false);
});

test('Space on the focused tour Skip button finishes the tour',async()=>{
  const {page}=rig;
  await page.locator('[data-action="welcome-sample"]').click();
  const skip=page.locator('.tour-card [data-action="tour-skip"]');
  await skip.waitFor();
  await skip.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#app').getAttribute('data-onboarding'),'done');
});

test('Escape goes to the dialog, the exposed tour, and then the open help menu',async()=>{
  const {page}=rig;
  await page.locator('[data-action="welcome-sample"]').click();
  const card=page.locator('.tour-card'),help=page.locator('.help-fab[open]');
  await card.waitFor();
  await page.locator('.help-fab > summary').click();
  await page.locator('#component-search').focus();
  await page.keyboard.press('Control+k');
  await page.locator('#command-search').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#command-search').count(),0);
  assert.ok(await card.isVisible());
  assert.ok(await help.isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await card.count(),0);
  assert.ok(await help.isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await help.count(),0);
});
