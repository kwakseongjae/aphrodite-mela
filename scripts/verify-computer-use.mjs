/**
 * T6 gate: the five-minute demo still runs.
 *
 * `docs/DEMO-ASTRA-5MIN.md` is the script we show people. It names four channel routes and the exact
 * payloads to send, and nobody has checked since that the header, the dock and the selectors it
 * relies on are still there. A demo that dies on stage is worse than no demo.
 *
 * The routes are read *out of the document*, not copied here, so editing the script without
 * re-checking it fails this gate. They are replayed through `window.aphroditeAgent.run`, which is
 * the same executor the HTTP channel dispatches to — `tests/agent-transport-parity.test.ts` holds
 * those two together, so covering one covers the pair.
 *
 *   node scripts/verify-computer-use.mjs
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openApp, runChecks, sleep} from './lib/headless.mjs';

const DEMO = new URL('../docs/DEMO-ASTRA-5MIN.md', import.meta.url);

/** Every `curl … "$BASE/agent/<route>" … -d '<json>'` the demo tells a presenter to run. */
function demoCalls(markdown) {
  const calls = [];
  for (const line of markdown.split('\n')) {
    const route = line.match(/\$BASE\/agent\/([a-z]+)"/);
    const body = line.match(/-d '(\{.*\})'\s*$/);
    if (!route || !body) continue;
    calls.push({route: route[1], payload: JSON.parse(body[1]), line: line.trim()});
  }
  return calls;
}

const calls = demoCalls(readFileSync(DEMO, 'utf8'));
assert.ok(calls.length >= 4, `the demo should still show channel calls, found ${calls.length}`);

const {agent, evaluate, personClicks, personSubmits, presses, close} =
  await openApp({port: 4186, cdp: 9337, profile: '/tmp/aphrodite-demo-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const blocks = () => evaluate(`document.querySelectorAll('#design-canvas [data-block-id]').length`);
/** A control the person clicks, including the data the real button carries. */
const clicks = (action, data = {}) => evaluate(
  `(() => { const b = document.createElement('button'); b.dataset.action = ${JSON.stringify(action)};
    Object.assign(b.dataset, ${JSON.stringify(data)});
    document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);

check('the demo opens a project and hands the screen over', async () => {
  await personClicks('welcome-sample');
  await sleep(900);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`), 'editor', 'the editor is open');
  // 3:00 in the script — the delegation form, opened the way the presenter opens it.
  await clicks('editor-mode', {mode: 'agent'});
  await sleep(400);
  assert.equal(
    await personSubmits('#agent-mode-form', {operator: 'Astra · computer use', intent: '히어로 아래에 특징 섹션을 추가하고 문구를 다듬어 주세요'}),
    true, 'the delegation form is still there and still takes an operator and an intent');
  await sleep(600);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.mode`), 'agent', 'agent mode is on');
});

check('the banner the script describes is on screen', async () => {
  assert.equal(await evaluate(`document.querySelector('.agent-banner') !== null`), true,
    'the demo promises a one-line banner at the top');
  assert.match(await evaluate(`document.querySelector('.agent-banner').textContent`), /Astra/,
    'the banner names the operator, as the script says out loud');
});

check('a person cannot touch the screen while it is handed over', async () => {
  const before = await blocks();
  await personClicks('add-block');
  await sleep(250);
  assert.equal(await blocks(), before, 'the script says clicking does nothing; it must do nothing');
});

for (const {route, payload, line} of calls) {
  check(`the demo's ${route} call still lands`, async () => {
    const result = await agent(route, payload, 'Astra · computer use');
    // An `error` key is how the channel says no — a missing selector, a palette query that matches
    // nothing. The demo's lines must not get one.
    assert.equal(result?.error, undefined,
      `the script tells the presenter to run this and the app refused it: ${line}\n  → ${JSON.stringify(result)}`);
    assert.ok(result, `no answer at all for: ${line}`);
  });
}

check('the demo ends with the screen back in the person\'s hands', async () => {
  await presses('A', 12); // ⌘⇧A, the way the script ends it
  await sleep(500);
  assert.notEqual(await evaluate(`document.querySelector('#app').dataset.mode`), 'agent',
    'the script promises ⌘⇧A gives the screen back');
});

await runChecks(checks, close);
