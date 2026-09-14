/**
 * Stage 1 gate: the permission rule, exercised against a running app rather than a stub.
 *
 * Runs the browser build under headless Chrome, because a real person's input can be reproduced
 * there (CDP dispatches trusted events) and an agent's commands arrive through the same executor the
 * desktop bridge uses. Checks, in order: reads are open, writes are refused until the person opens
 * the door, an agent cannot open that door itself, the person's own typing takes the screen back,
 * and the hold comes back to the agent once they stop.
 *
 *   node scripts/verify-agent-authority.mjs
 */
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 4183;
const CDP = 9334;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kids = [];
const stop = () => kids.forEach(k => { try { k.kill('SIGKILL'); } catch {} });

async function waitFor(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const got = await fn(); if (got) return got; } catch {}
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function main() {
  kids.push(spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {stdio: 'ignore'}));
  await waitFor(() => fetch(`http://127.0.0.1:${PORT}/`).then(r => r.ok), 'the preview server');

  kids.push(spawn(CHROME, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP}`,
    '--user-data-dir=/tmp/aphrodite-authority-profile', '--no-first-run',
    `http://127.0.0.1:${PORT}/`,
  ], {stdio: 'ignore'}));

  const target = await waitFor(async () => {
    const list = await fetch(`http://127.0.0.1:${CDP}/json/list`).then(r => r.json());
    return list.find(t => t.type === 'page' && t.url.includes(String(PORT)));
  }, 'the page target');

  // Node's own WebSocket — no dependency needed for a debugging socket.
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const mine = ++id;
    pending.set(mine, resolve);
    ws.send(JSON.stringify({id: mine, method, params}));
  });
  const evaluate = async expression => {
    // CDP nests the return value: message.result is the command result, whose .result is the value.
    const message = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    const thrown = message.result?.exceptionDetails;
    if (thrown) throw new Error(thrown.exception?.description ?? thrown.text);
    return message.result?.result?.value;
  };

  await waitFor(() => evaluate(`!!window.aphroditeAgent && !!document.querySelector('#app')`), 'the app to boot');

  /** An agent's command, exactly as the bridge would deliver it. */
  const agent = (kind, payload = {}, caller = 'claude-code') =>
    evaluate(`window.aphroditeAgent.run(${JSON.stringify(kind)}, ${JSON.stringify(payload)}, ${JSON.stringify(caller)})`);
  /** A person's click, which is what a programmatic click on a data-action button is. */
  const personClicks = action => evaluate(
    `(() => { const b = document.createElement('button'); b.dataset.action = ${JSON.stringify(action)};
      document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);

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
    await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', text: 'a'});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA'});
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

  let failed = 0;
  for (const [name, fn] of checks) {
    try { await fn(); console.log(`  ok   ${name}`); }
    catch (error) { failed++; console.log(`  FAIL ${name}\n       ${error.message}`); }
  }
  console.log(failed ? `\n${failed} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
  stop();
  process.exit(failed ? 1 : 0);
}

process.on('SIGINT', () => { stop(); process.exit(130); });
main().catch(error => { console.error(error); stop(); process.exit(1); });
