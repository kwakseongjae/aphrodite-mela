/**
 * A small Chrome-over-CDP rig for driving the browser build the way an agent and a person would.
 *
 * Two callers matter: `agent(kind, payload, caller)` goes through the same executor the desktop
 * bridge forwards to, and `personClicks(action)` / `personTypes()` stand in for the person — the
 * first as an ordinary DOM click, the second as a genuinely trusted event, which is the only way to
 * exercise the code that tells the two apart.
 */
import {spawn} from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function waitFor(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const got = await fn(); if (got) return got; } catch {}
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/**
 * A headless Chrome pointed at one page, with `evaluate` that waits for promises.
 *
 * `openApp` builds the whole app rig on top of this. Anything that only needs a browser — a module
 * bundled into a scratch page, say — takes this instead of standing up a preview server it has no
 * use for.
 */
export async function openPage(url, {cdp = 9340, profile = '/tmp/aphrodite-page-profile'} = {}) {
  const kids = [];
  const close = () => kids.forEach(k => { try { k.kill('SIGKILL'); } catch {} });
  try {
    kids.push(spawn(CHROME, [
      '--headless=new', '--disable-gpu', `--remote-debugging-port=${cdp}`,
      `--user-data-dir=${profile}`, '--no-first-run', url,
    ], {stdio: 'ignore'}));
    const target = await waitFor(async () => {
      const list = await fetch(`http://127.0.0.1:${cdp}/json/list`).then(r => r.json());
      return list.find(t => t.type === 'page');
    }, 'the page target');
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
      const message = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      const thrown = message.result?.exceptionDetails;
      if (thrown) throw new Error(thrown.exception?.description ?? thrown.text);
      return message.result?.result?.value;
    };
    await waitFor(() => evaluate('document.readyState === "complete"'), 'the page to load');
    return {evaluate, close};
  } catch (error) {
    close();
    throw error;
  }
}

export async function openApp({port = 4183, cdp = 9334, profile = '/tmp/aphrodite-harness-profile'} = {}) {
  const kids = [];
  const close = () => kids.forEach(k => { try { k.kill('SIGKILL'); } catch {} });
  try {
    kids.push(spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port)], {stdio: 'ignore'}));
    await waitFor(() => fetch(`http://127.0.0.1:${port}/`).then(r => r.ok), 'the preview server');
    kids.push(spawn(CHROME, [
      '--headless=new', '--disable-gpu', `--remote-debugging-port=${cdp}`,
      `--user-data-dir=${profile}`, '--no-first-run', `http://127.0.0.1:${port}/`,
    ], {stdio: 'ignore'}));

    const target = await waitFor(async () => {
      const list = await fetch(`http://127.0.0.1:${cdp}/json/list`).then(r => r.json());
      return list.find(t => t.type === 'page' && t.url.includes(String(port)));
    }, 'the page target');

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

    await waitFor(() => evaluate('!!window.aphroditeAgent && !!document.querySelector("#app")'), 'the app to boot');

    const agent = (kind, payload = {}, caller = 'claude-code') =>
      evaluate(`window.aphroditeAgent.run(${JSON.stringify(kind)}, ${JSON.stringify(payload)}, ${JSON.stringify(caller)})`);
    const personClicks = action => evaluate(
      `(() => { const b = document.createElement('button'); b.dataset.action = ${JSON.stringify(action)};
        document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
    /** The person filling in a dialog and pressing its button. */
    const personSubmits = (formSelector, values) => evaluate(
      `(() => { const form = document.querySelector(${JSON.stringify(formSelector)});
        if (!form) return false;
        for (const [name, value] of Object.entries(${JSON.stringify(values)})) {
          const field = form.elements.namedItem(name);
          if (!field) return false;
          field.value = value;
          field.dispatchEvent(new Event('input', {bubbles: true}));
        }
        form.requestSubmit();
        return true; })()`);
    const personTypes = async (key = 'a') => {
      await send('Input.dispatchKeyEvent', {type: 'keyDown', key, code: `Key${key.toUpperCase()}`, text: key});
      await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code: `Key${key.toUpperCase()}`});
    };
    /** A real key press. `modifiers` is CDP's bitmask: Alt 1, Ctrl 2, Meta 4, Shift 8. */
    const presses = async (key, modifiers = 0) => {
      const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
      const vk = key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0);
      await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: vk});
      await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code, modifiers});
    };
    return {evaluate, send, agent, personClicks, personSubmits, personTypes, presses, close};
  } catch (error) {
    close();
    throw error;
  }
}

/** Runs named checks in order, reporting each, and exits non-zero if any failed. */
export async function runChecks(checks, close) {
  let failed = 0;
  for (const [name, fn] of checks) {
    try { await fn(); console.log(`  ok   ${name}`); }
    catch (error) { failed++; console.log(`  FAIL ${name}\n       ${error.message}`); }
  }
  console.log(failed ? `\n${failed} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
  close();
  process.exit(failed ? 1 : 0);
}
