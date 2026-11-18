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
import {openApp, runChecks, sleep, waitFor} from './lib/headless.mjs';

const {agent, personClicks, personTypes, evaluate, send, close} = await openApp({port: 4183, cdp: 9334, profile: '/tmp/aphrodite-authority-profile'});
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
  assert.equal(refused.status, 403, 'flipping the switch is the person\'s, like approving');
  assert.match(refused.error, /the person's to decide/);
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false, 'no banner appeared');
});

check('an agent can ask, and the request reaches the person with its name on it', async () => {
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  assert.match(asked.message, /claude-code/, 'the reply says the person can see who is asking');
  await sleep(200);
  const banner = await evaluate(`document.querySelector('.ask-banner')?.textContent ?? ''`);
  assert.match(banner, /claude-code/, 'the request is on their screen');
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false, 'asking did not open anything');
  const again = await agent('connect', {}, 'claude-code');
  assert.equal(again.status, 'waiting', 'asking twice does not put up a second request');
});

check('the person allows it with one click, and the agent may write', async () => {
  await personClicks('ask-allow');
  await sleep(250);
  assert.equal(await evaluate(`document.querySelector('.ask-banner') !== null`), false, 'the request is answered and gone');
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), true, 'connected mode is on');
  const allowed = await agent('edit', {field: 'title', text: 'Asked and allowed'});
  assert.equal(allowed.status, undefined, JSON.stringify(allowed));
  await personClicks('agent-disconnect');
  await sleep(200);
});

check('the person declines, and the agent is told to stop asking', async () => {
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', 'a spent yes does not bar a fresh request');
  await sleep(200);
  await personClicks('ask-decline');
  await sleep(200);
  assert.equal(await evaluate(`document.querySelector('.ask-banner') !== null`), false, 'the request is gone');
  const refused = await agent('connect', {}, 'claude-code');
  assert.equal(refused.status, 'declined');
  assert.match(refused.message, /Do not ask again/);
  const write = await agent('edit', {field: 'title', text: 'x'});
  assert.equal(write.status, 423, 'and the door is still shut');
});

check('the guide tells an agent where it stands without asking permission', async () => {
  const {guide} = await agent('guide');
  assert.match(guide, /## Right now/);
  assert.match(guide, /Mode: design/);
  assert.match(guide, /Approve a direction/, 'it says what is never theirs to do');
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

/* 0.3-1b: an agent the person allowed is remembered by name — no clock, across a restart — until they
   disconnect it. A reload of the page stands in for the restart: the app reads its state back from
   storage exactly as it does at launch. */
const restart = async () => {
  await send('Page.reload', {ignoreCache: true});
  await sleep(800);
  await waitFor(() => evaluate('!!window.aphroditeAgent && !!document.querySelector("#app")'), 'the app to boot again');
};
const writes = async caller => (await agent('state', {}, caller)).state.writes;

check('the person allows an agent by name, and a restart remembers it', async () => {
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  await sleep(200);
  await personClicks('ask-allow');
  await sleep(200);
  assert.equal(await writes('claude-code'), 'on');
  await restart();
  assert.equal(await writes('claude-code'), 'on', 'still let in after the restart');
  const again = await agent('connect', {}, 'claude-code');
  assert.equal(again.status, 'already-open', 'and it is not asked again');
  const write = await agent('edit', {field: 'title', text: 'remembered'}, 'claude-code');
  assert.notEqual(write.status, 423, JSON.stringify(write));
  assert.equal(await evaluate(`document.querySelector('.connect-banner')?.textContent ?? ''`).then(t => t.includes('claude-code')), true, 'the banner names who is let in');
});

check('a different name is still asked, and cannot write meanwhile', async () => {
  assert.equal(await writes('astra'), 'off');
  const refused = await agent('edit', {field: 'title', text: 'x'}, 'astra');
  assert.equal(refused.status, 423, JSON.stringify(refused));
  assert.match(refused.error, /writing is off for astra/);
  const asked = await agent('connect', {}, 'astra');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
});

check('no agent can answer for the person or change the list — not even an allowed one', async () => {
  for (const caller of ['astra', 'claude-code']) {
    for (const action of ['ask-allow', 'ask-decline', 'agent-connect-toggle', 'agent-disconnect', 'agent-forget']) {
      const refused = await agent('act', {action, data: {name: 'claude-code'}}, caller);
      assert.equal(refused.status, 403, `${caller} ${action}: ${JSON.stringify(refused)}`);
    }
    const clicked = await agent('click', {selector: '[data-action="ask-allow"]'}, caller);
    assert.equal(clicked.status, 403, `${caller} clicking Allow: ${JSON.stringify(clicked)}`);
  }
  assert.equal(await writes('astra'), 'off', 'astra is still out');
  assert.equal(await writes('claude-code'), 'on', 'and claude-code is still in');
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('aphrodite-allowed-agents'))`), ['claude-code'], 'the remembered list did not move');
  await personClicks('ask-decline');
  await sleep(200);
});

check('disconnecting forgets the name, and the next request asks again', async () => {
  await personClicks('agent-disconnect');
  await sleep(200);
  assert.equal(await evaluate(`localStorage.getItem('aphrodite-allowed-agents')`), null, 'nothing is remembered');
  await restart();
  assert.equal(await writes('claude-code'), 'off');
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
});

check('the person can disconnect one agent and keep another', async () => {
  await personClicks('ask-allow');
  await sleep(150);
  await agent('connect', {}, 'astra');
  await sleep(150);
  await personClicks('ask-allow');
  await sleep(150);
  assert.equal(await writes('astra'), 'on');
  await evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'agent-forget'; b.dataset.name = 'astra'; document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
  await sleep(150);
  assert.equal(await writes('astra'), 'off', 'astra is out');
  assert.equal(await writes('claude-code'), 'on', 'claude-code stays');
  await personClicks('agent-disconnect');
});


await runChecks(checks, close);
