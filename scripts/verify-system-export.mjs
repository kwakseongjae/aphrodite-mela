/**
 * The two routes that finish the contract story: change the design system, read the build contract.
 *
 *   node scripts/verify-system-export.mjs
 */
import assert from 'node:assert/strict';
import {openApp, runChecks, sleep} from './lib/headless.mjs';

const {agent, evaluate, personClicks, personSubmits, presses, close} =
  await openApp({port: 4187, cdp: 9338, profile: '/tmp/aphrodite-se-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const accent = () => evaluate(`document.querySelector('#design-canvas [style*="--brand"]')?.style.getPropertyValue('--brand')
  || getComputedStyle(document.querySelector('.design-page')).getPropertyValue('--brand')`);

check('a project is open and the person opens the door', async () => {
  await personClicks('welcome-blank');
  await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Contract'}), true);
  await sleep(600);
  await personClicks('agent-connect-toggle');
  await sleep(250);
  await presses('Escape');
  await sleep(200);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`), 'editor');
});

check('the design system is refused when it names nothing real', async () => {
  const out = await agent('system', {id: 'not-a-system'});
  assert.match(out.error ?? '', /no built-in system/);
  assert.match(out.error ?? '', /toss/, 'the refusal lists what there is');
});

check('an agent can swap the whole design system in one change', async () => {
  const before = await agent('state');
  const out = await agent('system', {id: 'toss'});
  assert.equal(out.error, undefined, JSON.stringify(out));
  assert.equal(out.system.id, 'toss');
  await sleep(300);
  assert.notEqual(await accent(), '', 'the page carries a brand colour');
  void before;
});

check('it is one undo, not one per block', async () => {
  const before = await agent('state');
  assert.ok(Number(before.state.undo) > 0, `there is something to undo: ${before.state.undo}`);
  await presses('z', 4); // ⌘Z
  await sleep(400);
  const after = await agent('state');
  assert.equal(Number(after.state.undo), Number(before.state.undo) - 1,
    'the whole repaint came back in one press, not one per block');
  /* That ⌘Z was a person's keystroke, and a person's touch holds the screen for HUMAN_IDLE_MS.
     Everything after this is an agent call, so wait the hold out rather than read a 409 as a bug. */
  await sleep(5400);
});

/* Half a palette is not a palette, so one bad value refuses the whole change — but the refusal has
   to name the field, or the caller is left guessing which of nine it was. */
check('a token that is not a colour is refused by name', async () => {
  const out = await agent('system', {tokens: {accent: '#112233', foreground: 'javascript:alert(1)'}});
  assert.match(out.error ?? '', /"foreground"/, `the refusal should name the field: ${out.error}`);
  assert.match(out.error ?? '', /hex colour/);
});

check('a palette that is entirely colours lands', async () => {
  const out = await agent('system', {tokens: {accent: '#112233', foreground: '#101010'}});
  assert.equal(out.error, undefined, JSON.stringify(out));
  assert.equal(out.system.accent, '#112233');
  assert.equal(out.system.foreground, '#101010');
});

check('the contract comes back as words an agent can act on', async () => {
  const out = await agent('export');
  assert.equal(out.error, undefined, JSON.stringify(out));
  for (const key of ['prompt', 'design', 'tokens', 'scene']) assert.ok(out[key], `${key} is missing`);
  assert.match(out.prompt, /Aphrodite|page/i);
  assert.ok(out.tokens.color.primary.$value, 'tokens.json arrives as an object, not a string');
});

/** Approving is a human click. The contract has to say when it has not happened. */
check('an unapproved composition is handed over as a draft, and says so', async () => {
  const out = await agent('export');
  assert.equal(out.approved, false);
  assert.match(out.note, /DRAFT/);
});

await runChecks(checks, close);
