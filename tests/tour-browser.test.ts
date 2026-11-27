import {after,before,beforeEach,test} from 'node:test';
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

test('one Escape on the sample board dismisses the first tour even as it is about to appear',async()=>{
  const {page}=rig;
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.locator('[data-action="welcome-sample"]').click();
  await page.locator('.space-frame.active').waitFor();
  await page.keyboard.press('Escape');
  await page.clock.fastForward(1000);
  await page.clock.resume();
  assert.equal(await page.locator('.tour-card').isVisible(),false);
  assert.equal(await page.locator('#app').getAttribute('data-onboarding'),'done');
});

test('a dialog opened during the first tour delay gets Escape before the tour starts',async()=>{
  const {page}=rig;
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.locator('[data-action="welcome-sample"]').click();
  await page.locator('[data-action="project"]').first().click();
  await page.clock.fastForward(1000);
  const card=page.locator('.tour-card');
  assert.equal(await card.count(),0);
  await page.keyboard.down('Escape');
  assert.equal(await page.locator('#rename-form').count(),0);
  await page.keyboard.down('Escape'); // A held dismissal still belongs to the dialog.
  await page.keyboard.up('Escape');
  await page.clock.fastForward(400);
  await page.clock.resume();
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
