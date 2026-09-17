/**
 * A small Chrome-over-CDP rig for driving the browser build the way an agent and a person would.
 *
 * Two callers matter: `agent(kind, payload, caller)` goes through the same executor the desktop
 * bridge forwards to, and `personClicks(action)` / `personTypes()` stand in for the person — the
 * first as an ordinary DOM click, the second as a genuinely trusted event, which is the only way to
 * exercise the code that tells the two apart.
 */
import {spawn} from 'node:child_process';
import {rmSync, existsSync, statSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE = new URL('../../node_modules/.bin/vite', import.meta.url).pathname;

/**
 * Start every run from a blank browser.
 *
 * The profile directory is a fixed path per gate, so without this Chrome keeps the previous run's
 * localStorage and the gate slowly drifts: a check that asserts "a blank start has no projects"
 * passes once and then fails forever after, and — worse — a check can start passing for a reason
 * the previous run created. A gate that only holds on a fresh machine is not a gate.
 *
 * Guarded to paths under /tmp so a mistyped profile can never delete someone's work.
 */
function blankProfile(profile) {
  if (!profile.startsWith('/tmp/')) throw new Error(`refusing to wipe a profile outside /tmp: ${profile}`);
  rmSync(profile, {recursive: true, force: true});
}
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
  blankProfile(profile);
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
    // `send` goes out too: evaluate covers most of what a gate needs, but anything that is a CDP
    // domain rather than page JS — capturing beyond the viewport, emulating a device — has no other
    // way in.
    return {evaluate, send, close};
  } catch (error) {
    close();
    throw error;
  }
}

/**
 * `vite preview` serves `dist/`, not the working tree.
 *
 * So a gate tests whichever bundle was built last, and says nothing about the code you just wrote.
 * Today that produced two checks failing against a feature that was present in src and absent from a
 * bundle four hours old — and the more dangerous direction is the quiet one, where a gate passes
 * because the bundle still contains the behaviour the source no longer has.
 *
 * Rebuilding only when something is actually newer keeps the usual run fast.
 */
function newestUnder(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestUnder(path));
    else newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
}

function buildIfStale() {
  const built = existsSync('dist/index.html') ? statSync('dist/index.html').mtimeMs : 0;
  const sources = Math.max(
    newestUnder('src'),
    existsSync('index.html') ? statSync('index.html').mtimeMs : 0,
    existsSync('vite.config.ts') ? statSync('vite.config.ts').mtimeMs : 0,
  );
  if (built >= sources) return;
  process.stderr.write('  … dist is older than src, rebuilding before the gate runs\n');
  const out = spawnSync('npx', ['vite', 'build'], {stdio: 'inherit'});
  if (out.status !== 0) throw new Error('the bundle failed to build, so the gate would have tested a stale one');
}

export async function openApp({port = 4183, cdp = 9334, profile = '/tmp/aphrodite-harness-profile'} = {}) {
  buildIfStale();
  blankProfile(profile);
  const kids = [];
  const close = () => kids.forEach(k => { try { k.kill('SIGKILL'); } catch {} });
  try {
    // The binary directly, not through npx. `close()` kills the pid it spawned, and npx is a wrapper
    // that forwards nothing: killing it orphaned the real vite child, so every gate run left a
    // preview server holding its port. Seven of them were alive before this was noticed.
    kids.push(spawn(VITE, ['preview', '--host', '127.0.0.1', '--port', String(port)], {stdio: 'ignore'}));
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
