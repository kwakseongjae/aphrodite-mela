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

const {agent, personClicks, personSubmits, presses, evaluate, close} = await openApp({port: 4184, cdp: 9335, profile: '/tmp/aphrodite-tools-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const blockCount = () => evaluate(`document.querySelectorAll('#design-canvas [data-block-id]').length`);

check('a blank project opens and the door is opened by the person', async () => {
  await personClicks('welcome-blank');
  await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Harness'}), true, 'the new-project dialog was filled in');
  await sleep(600);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`), 'editor', 'the editor is open');
  await personClicks('agent-connect-toggle');
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

let beforeCount = 0;
check('one call adds three components', async () => {
  beforeCount = await blockCount();
  const result = await agent('apply', {ops: [
    {op: 'add', component_kind: 'hero', variant: 'stacked', content: {title: '빛으로 완성하는 공간'}},
    {op: 'add', component_kind: 'features'},
    {op: 'add', component_kind: 'cta', content: {label: '자세히 보기'}},
  ]});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.applied, 3);
  assert.equal(await blockCount(), beforeCount + 3, 'three more components are on the canvas');
});

check('the receipt says what changed', async () => {
  const result = await agent('apply', {ops: [{op: 'update', block_id: 'selection', fields: {label: '지금 보기'}}]});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.receipt, 'a receipt came back');
  assert.equal(result.receipt.changedNodes.length, 1, 'exactly one component changed');
  assert.ok(result.receipt.savedRevision, 'the receipt carries the new revision');
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
  const refused = await agent('apply', {ops: [{op: 'add', component_kind: 'hero'}]});
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /the person is using the screen/);
  await sleep(5_200); // their hold expires in five seconds; the rest of the run needs the lease back
});

check('a batch with a bad operation changes nothing at all', async () => {
  const before = await blockCount();
  const result = await agent('apply', {ops: [
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
  const result = await agent('apply', {ops: [{op: 'add', component_kind: 'hero-large'}]});
  assert.match(result.error, /unknown ops\[0\]\.component_kind "hero-large"/);
  assert.match(result.error, /Closest match: "hero"/);
});

check('reading needs no door, writing does', async () => {
  await personClicks('agent-disconnect');
  await sleep(200);
  const contract = await agent('contract');
  assert.equal(contract.schema, 'aphrodite.contract/1', 'the contract still reads');
  const refused = await agent('apply', {ops: [{op: 'add', component_kind: 'hero'}]});
  assert.equal(refused.status, 423, JSON.stringify(refused));
});

await runChecks(checks, close);
