/**
 * Stage 1 gate: the permission rule, exercised against a running app rather than a stub.
 *
 * Runs the browser build under headless Chrome, because a real person's input can be reproduced there
 * (CDP dispatches trusted events) and an agent's commands arrive through the same executor the
 * desktop bridge uses. Checks, in order: reads are open, writes are refused until the person opens
 * the door, an agent cannot open that door itself, the person's own typing takes the screen back, and
 * the hold comes back to the agent once they stop.
 *
 *   node scripts/verify-agent-authority.mjs
 */
import assert from 'node:assert/strict';
import {openApp, runChecks, sleep} from './lib/headless.mjs';

const {agent, personClicks, personTypes, evaluate, close} = await openApp({port: 4183, cdp: 9334, profile: '/tmp/aphrodite-authority-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('reading works with nobody at the door', async () => {
  const state = await agent('state');
  assert.equal(state.ok, true);
  assert.ok(state.state, 'the state payload came back');
});

check('writing is refused with 423 and told how to proceed', async () => {
  const refused = await agent('edit', {field: 'title', text: 'x'});
  assert.equal(refused.status, 423, JSON.stringify(refused));
  assert.match(refused.error, /Connected mode|Agent mode/);
});

check('an agent cannot open the door for itself', async () => {
  const refused = await agent('act', {action: 'agent-connect-toggle'});
  assert.equal(refused.status, 423, 'flipping the switch is a write like any other');
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false, 'no banner appeared');
});

check('the person turns it on, and the banner says so', async () => {
  await personClicks('agent-connect-toggle');
  await sleep(120);
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), true, 'the connected banner is up');
});

check('now the agent may write, and the write is not refused by the rule', async () => {
  const allowed = await agent('edit', {field: 'title', text: 'Hello from the agent'});
  assert.equal(allowed.status, undefined, `the permission rule let it through: ${JSON.stringify(allowed)}`);
});

check('the person types, and takes the screen back', async () => {
  await personTypes('a');
  await sleep(60);
  const refused = await agent('edit', {field: 'title', text: 'while you were typing'});
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /the person is using the screen/);
});

check('a few quiet seconds and the agent may write again', async () => {
  await sleep(5_400);
  const allowed = await agent('edit', {field: 'title', text: 'back to work'});
  assert.equal(allowed.status, undefined, `expected the hold to have expired: ${JSON.stringify(allowed)}`);
});

check('a second agent is refused by name while the first holds it', async () => {
  await agent('edit', {field: 'title', text: 'mine'}, 'claude-code');
  const refused = await agent('edit', {field: 'title', text: 'mine too'}, 'astra');
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /claude-code/);
});

check('disconnecting closes the door again', async () => {
  await personClicks('agent-disconnect');
  await sleep(120);
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false);
  const refused = await agent('edit', {field: 'title', text: 'x'});
  assert.equal(refused.status, 423);
});


await runChecks(checks, close);
