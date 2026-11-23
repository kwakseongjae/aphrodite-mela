/**
 * Stage 2 gate: the semantic surface, against a running app.
 *
 * Reads the design contract, changes a page with one batched call, and checks the two properties the
 * whole tool surface rests on — that a batch lands as a single undo step, and that a batch with a bad
 * operation in it lands nothing at all.
 *
 *   node scripts/verify-agent-tools.mjs
 */
import assert from 'node:assert/strict';
import {openApp, runChecks, sleep} from './lib/headless.mjs';

const {agent, personClicks, personPresses: pressDoor, personSubmits, presses, evaluate, send, close} = await openApp({port: 4184, cdp: 9335, profile: '/tmp/aphrodite-tools-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const blockCount = () => evaluate(`document.querySelectorAll('#design-canvas [data-block-id]').length`);

check('a blank project opens and the door is opened by the person', async () => {
  await personClicks('welcome-blank');
  await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Harness'}), true, 'the new-project dialog was filled in');
  await sleep(600);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`), 'editor', 'the editor is open');
  await pressDoor('agent-connect-toggle');
  await sleep(250);
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), true);
  // Flipping the switch leaves its dialog open, as it does for a person; they close it to carry on.
  await presses('Escape');
  await sleep(250);
  assert.equal(await evaluate(`document.querySelector('#modal-root').children.length`), 0, 'no dialog is in the way');
});

check('the contract describes the project in design words', async () => {
  const contract = await agent('contract');
  assert.equal(contract.schema, 'aphrodite.contract/1');
  assert.ok(contract.project.project_id, 'the project has an id');
  assert.ok(Array.isArray(contract.pages) && contract.pages.length >= 1);
  assert.ok(contract.pages[0].frame.preset, 'a page is a frame with a preset');
  assert.equal(typeof contract.pages[0].block_count, 'number');
});

check('the tokens name the variables the page is painted with', async () => {
  const tokens = await agent('tokens');
  assert.equal(tokens.schema, 'aphrodite.tokens/1');
  assert.ok(tokens.tokens['--brand'], 'the brand token is there');
  assert.match(tokens.usage, /var\(--brand\)/);
});

check('the vocabulary lists the kinds an agent may add', async () => {
  const vocabulary = await agent('components');
  const hero = vocabulary.components.find(c => c.component_kind === 'hero');
  assert.ok(hero, 'hero is in the catalogue');
  assert.ok(hero.variants.includes('stacked'));
});

/** Every batch carries a reason now; it is shown to the person beside the change. */
const WHY = 'verify-agent-tools: checking the batch edit path.';

let beforeCount = 0;
check('one call adds three components', async () => {
  beforeCount = await blockCount();
  const result = await agent('apply', {reason: WHY, ops: [
    {op: 'add', component_kind: 'hero', variant: 'stacked', content: {title: '빛으로 완성하는 공간'}},
    {op: 'add', component_kind: 'features'},
    {op: 'add', component_kind: 'cta', content: {label: '자세히 보기'}},
  ]});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.applied, 3);
  assert.equal(await blockCount(), beforeCount + 3, 'three more components are on the canvas');
});

check('the receipt says what changed', async () => {
  const result = await agent('apply', {reason: WHY, ops: [{op: 'update', block_id: 'selection', fields: {label: '지금 보기'}}]});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.receipt, 'a receipt came back');
  assert.equal(result.receipt.changedNodes.length, 1, 'exactly one component changed');
  assert.ok(result.receipt.savedRevision, 'the receipt carries the new revision');
});

check('a batch without a reason is refused and nothing lands', async () => {
  const before = await blockCount();
  const result = await agent('apply', {ops: [{op: 'add', component_kind: 'cta'}]});
  assert.match(result.error ?? '', /reason/, JSON.stringify(result));
  assert.equal(await blockCount(), before);
});

check('the ledger names the agent and keeps its reason', async () => {
  const result = await agent('changes', {});
  assert.equal(result.ok, true, JSON.stringify(result));
  const last = result.changes.at(-1);
  assert.equal(last.author.kind, 'agent');
  assert.equal(last.reason, WHY);
  assert.equal(last.revision, result.revision, 'the newest change produced the revision on screen');
});

check('the batch is one undo step, not three', async () => {
  const before = await blockCount();
  await presses('z', 4); // ⌘Z
  await sleep(250);
  const afterOne = await blockCount();
  assert.equal(afterOne, before, 'the first undo takes back the single-op call');
  await presses('z', 4);
  await sleep(250);
  assert.equal(await blockCount(), beforeCount, 'the second undo takes back all three at once');
});

check('the undo just pressed was a person, so the screen is theirs for a moment', async () => {
  const refused = await agent('apply', {reason: WHY, ops: [{op: 'add', component_kind: 'hero'}]});
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /the person is using the screen/);
  await sleep(5_200); // their hold expires in five seconds; the rest of the run needs the lease back
});

check('a batch with a bad operation changes nothing at all', async () => {
  const before = await blockCount();
  const result = await agent('apply', {reason: WHY, ops: [
    {op: 'add', component_kind: 'hero'},
    {op: 'add', component_kind: 'testimonial'},
    {op: 'delete', block_id: 'no-such-block'},
  ]});
  assert.ok(result.error, 'the call was refused');
  assert.equal(result.applied, 0);
  assert.equal(result.failed_at, 2, 'it says which operation failed');
  assert.equal(await blockCount(), before, 'the two good operations did not land either');
});

check('an unknown component kind is refused with the real ones listed', async () => {
  const result = await agent('apply', {reason: WHY, ops: [{op: 'add', component_kind: 'hero-large'}]});
  assert.match(result.error, /unknown ops\[0\]\.component_kind "hero-large"/);
  assert.match(result.error, /Closest match: "hero"/);
});

const approval = () => evaluate(`document.querySelector('#app').dataset.approval`);
/** The person's own click on a real control: a trusted event, which approving needs. */
async function personPresses(selector) {
  const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return document.elementFromPoint(x, y)?.closest('[data-action]') === el.closest('[data-action]') ? {x, y} : null; })()`);
  assert.ok(at, `${selector} is on screen and nothing covers it`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: at.x, y: at.y, button: 'left', clickCount: 1});
}

check('an agent cannot put the approval back with redo, nor take it away with undo', async () => {
  await personPresses('.review-card [data-action=approve]');
  await sleep(250);
  assert.equal(await approval(), 'approved', 'the person approved');
  await presses('z', 4);
  await sleep(250);
  assert.equal(await approval(), 'draft', 'and took it back with ⌘Z');
  await sleep(5_200);
  for (const [kind, payload] of [['act', {action: 'redo'}], ['command', {query: 'Redo'}], ['key', {key: 'z', meta: true, shift: true}]]) {
    const refused = await agent(kind, payload);
    assert.equal(refused.status, 403, `${kind}: ${JSON.stringify(refused)}`);
    assert.match(refused.error, /person's decision/);
    assert.equal(await approval(), 'draft', `${kind} left it a draft`);
  }
  await agent('key', {key: 'k', meta: true});
  await sleep(150);
  const clicked = await agent('click', {selector: '#command-list [data-action=redo]'});
  assert.equal(clicked.status, 403, `click on the palette's Redo: ${JSON.stringify(clicked)}`);
  assert.equal(await approval(), 'draft');
  await presses('z', 4 | 8);
  await sleep(250);
  assert.equal(await approval(), 'approved', "the person's own ⌘⇧Z puts it back");
  await sleep(5_200);
  const undone = await agent('act', {action: 'undo'});
  assert.equal(undone.status, 403, JSON.stringify(undone));
  assert.equal(await approval(), 'approved');
});


/* 0.3-R ①: an approval is the person's. A patch that puts the content back after a change leaves the board a draft. */
check('Codex route 1: a patch that puts the brief back after a change leaves the approved board a draft', async () => {
  assert.equal(await approval(), 'approved', 'the person approved it above');
  const was = (await agent('contract', {format: 'detailed'})).project.brief;
  for (const value of ['A brief the agent tried', was]) {
    const r = await agent('apply', {reason: WHY, patch: [{op: 'set', on: 'project', field: 'brief', value}]});
    assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
    assert.equal(await approval(), 'draft', `after the brief became ${JSON.stringify(value)}`);
  }
  assert.equal((await agent('contract')).project.approved, false);
});

/* 0.3-R ②: the revision binds the board and its frames as well as the design. */
const library = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => ({id: e.project.id, name: e.project.name}))`);
check('a revision read on one board is refused on a copy with the same design (409, nothing changes)', async () => {
  const a = await agent('contract');
  const id = a.project.project_id, name = a.project.name, revision = a.revision;
  await pressDoor('home');
  await sleep(400);
  await pressDoor('hub-duplicate', {id});
  await sleep(300);
  const copy = (await library()).find(e => e.id !== id && e.name === `${name} copy`);
  assert.ok(copy, 'the person duplicated it');
  await pressDoor('hub-rename', {id: copy.id});
  await sleep(250);
  assert.equal(await personSubmits('#hub-rename-form', {name}), true);
  await sleep(300);
  await pressDoor('hub-open', {id: copy.id});
  await sleep(500);
  const b = await agent('contract');
  assert.equal(b.project.project_id, copy.id, 'the copy is open');
  assert.deepEqual([b.project.name, b.pages.map(p => p.page_id)], [name, a.pages.map(p => p.page_id)], 'with the same name and the same pages');
  await sleep(5_200);
  const {seq} = await agent('changes', {limit: 1});
  const refused = await agent('apply', {reason: WHY, base_revision: revision, patch: [{op: 'set', on: 'project', field: 'brief', value: 'Meant for the other board'}]});
  assert.equal(refused.status, 409, JSON.stringify(refused).slice(0, 300));
  assert.equal((await agent('changes', {limit: 1})).seq, seq, 'nothing changed');
  assert.notEqual((await agent('contract', {format: 'detailed'})).project.brief, 'Meant for the other board');
  // The copy keeps the history it was made from, so A's revision is in it: the 409 lists what changed since (the rename).
  assert.ok(refused.changes.some(c => c.source === 'home:rename'), JSON.stringify(refused.changes).slice(0, 300));
  const unknown = await agent('changes', {since: 'r2:0:0:0'});
  assert.deepEqual([unknown.unknown_since, unknown.changes.length], [true, 0], 'a revision no history here holds is said to be unknown, with no changes');
});

check('a revision read before the person resized a frame is refused (409, nothing changes)', async () => {
  const {revision} = await agent('contract');
  // The frame's size menu, with the person's own mouse; a window wide enough for the menu to open on screen.
  await send('Emulation.setDeviceMetricsOverride', {width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false});
  await sleep(300);
  const mouse = async selector => {
    const p = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block: 'center', inline: 'center'}); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return el.contains(document.elementFromPoint(x, y)) ? {x, y} : null; })()`);
    assert.ok(p, `${selector} is on screen and nothing covers it`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1});
    await sleep(300);
  };
  await mouse('.space-frame.active details.menu-select summary');
  await mouse('.space-frame.active .menu-select-list [data-value="mobile"]');
  await send('Emulation.clearDeviceMetricsOverride');
  const after = await agent('contract');
  assert.equal(after.pages[0].frame.preset, 'mobile', 'the person resized the frame');
  assert.notEqual(after.revision, revision);
  await sleep(5_200);
  const {seq} = await agent('changes', {limit: 1});
  const refused = await agent('apply', {reason: WHY, base_revision: revision, ops: [{op: 'frame', preset: 'desktop'}]});
  assert.equal(refused.status, 409, JSON.stringify(refused).slice(0, 300));
  assert.equal((await agent('changes', {limit: 1})).seq, seq, 'nothing changed');
  assert.equal((await agent('contract')).pages[0].frame.preset, 'mobile');
  const sent = await agent('apply', {reason: WHY, base_revision: refused.revision, ops: [{op: 'frame', preset: 'desktop'}]});
  assert.ok(sent.ok, `sent again with the revision the 409 gave, it lands: ${JSON.stringify(sent).slice(0, 300)}`);
  assert.equal(sent.receipt.savedRevision, sent.revision, 'the receipt and the reply name the same revision');
  const last = (await agent('changes', {since: sent.seq - 1})).changes.at(-1);
  assert.equal(last.revision, sent.revision, 'and so does the ledger');
});

check('reading needs no door, writing does', async () => {
  await pressDoor('agent-disconnect');
  await sleep(200);
  const contract = await agent('contract');
  assert.equal(contract.schema, 'aphrodite.contract/1', 'the contract still reads');
  const refused = await agent('apply', {reason: WHY, ops: [{op: 'add', component_kind: 'hero'}]});
  assert.equal(refused.status, 423, JSON.stringify(refused));
});

await runChecks(checks, close);
