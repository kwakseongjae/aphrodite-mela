/**
 * A free page can do whatever it likes inside its frame and nothing outside it (0.3-P2).
 *
 * The spike (RESULTS 0.3-P0 §1) aimed every request a page can make at a local server that only records
 * what reaches it; "blocked" meant the server saw nothing, not that the page said so. This does the same
 * against the browser build: an agent makes the probe page with one call, the board draws it, and the
 * server must stay empty. Then the person's side: one press selects a page and presses nothing inside
 * it, two presses go in, a press outside or Esc comes back out; selecting, moving and zooming on a board
 * of ten pages loads none of them again.
 *
 *   node scripts/verify-pages.mjs
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import dgram from 'node:dgram';
import {createServer as createNetServer} from 'node:net';
import {createHash} from 'node:crypto';
import {openApp, openPage, runChecks, sleep, waitFor} from './lib/headless.mjs';
import {appPolicy} from '../src/csp.mjs';
import {framedDocument, renderShell, FRAME_PREFIX_END, FRAME_ALLOW} from '../src/free-page.ts';
import {requestProbe} from './wall/probes.mjs';
import {mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, truncateSync, readdirSync, readFileSync, existsSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, extname} from 'node:path';
import {unzipSync, zipSync} from 'fflate';
import {build} from 'esbuild';
import {vectors, QUIET, ORDINARY, ORDINARY_DOCUMENTS, LOSSES, KEPT_ATTRIBUTES, LOST_ATTRIBUTES} from '../tests/support/clean-vectors.mjs';
/** What a board file is called (src-tauri/board-file.json): nothing here spells it out. */
const BOARD_FILE = JSON.parse(readFileSync(new URL('../src-tauri/board-file.json', import.meta.url), 'utf8'));

/** Files to drop from "the Finder", made here and removed when the gate ends. */
const filesDir = mkdtempSync(join(tmpdir(), 'aphrodite-pages-'));
const fileAt = name => join(filesDir, name);
/** Each file and folder this gate made, one by one: a folder only once it is empty. */
const removeUnder = dir => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) { removeUnder(path); rmdirSync(path); } else unlinkSync(path); } };
const removeFiles = () => { try { removeUnder(filesDir); rmdirSync(filesDir); } catch {} };

const PORT = 4223, TRAP = 4224;
const SERVER = `http://127.0.0.1:${TRAP}`;

/** A server that only records what reaches it. */
const hits = [];
const trap = createServer((req, res) => {
  hits.push({method: req.method, url: req.url, dest: req.headers['sec-fetch-dest'] ?? null});
  res.writeHead(200, {'content-type': 'text/plain', 'access-control-allow-origin': '*'});
  res.end('seen');
});
trap.on('upgrade', (req, socket) => { hits.push({method: 'UPGRADE', url: req.url}); socket.destroy(); });
await new Promise(resolve => trap.listen(TRAP, '127.0.0.1', resolve));
/** WebRTC goes out over UDP, which the HTTP server above never sees: a socket that counts what a page's STUN and TURN send it. */
const UDP = TRAP + 5;
const packets = [];
const udp = dgram.createSocket('udp4');
udp.on('message', message => packets.push(message.length));
await new Promise(resolve => udp.bind(UDP, '127.0.0.1', resolve));

const {evaluate, send, agent, personClicks, personPresses, personSubmits, presses, close} = await openApp({port: PORT, cdp: 9383, profile: '/tmp/aphrodite-pages-profile'});
/** Preconnect opens a TCP connection and sends nothing: a listener that counts them. */
const TCP = TRAP + 6;
const connections = [];
const tcp = createNetServer(socket => { connections.push(Date.now()); socket.on('error', () => {}); setTimeout(() => socket.destroy(), 200); });
await new Promise(resolve => tcp.listen(TCP, '127.0.0.1', resolve));
const shut = () => { close(); trap.close(); udp.close(); tcp.close(); removeFiles(); };
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const WHY = 'verify-pages: a free page stays in its frame.';
const revision = async () => (await agent('changes', {limit: 1})).revision;
const makePage = async (name, html, extra = {}) => {
  const made = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_page', name, html, ...extra}]});
  assert.ok(made.ok, JSON.stringify(made).slice(0, 400));
  return made.created_pages[0].page_id;
};

// Everything the app document is refused, from the first byte it loads.
await send('Page.enable', {});
await send('Page.addScriptToEvaluateOnNewDocument', {source: `window.__violations = []; document.addEventListener('securitypolicyviolation', e => window.__violations.push({directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile}));
  window.__frameMessages = []; addEventListener('message', e => window.__frameMessages.push(e.data));`});
await send('Page.reload', {});
await sleep(500);
await waitFor(() => evaluate('!!window.aphroditeAgent && !!document.querySelector("#app")'), 'the app to boot again');
await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
const result = {};

check('the browser build is served under the policy src/csp.mjs gives it', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(res.headers.get('content-security-policy'), appPolicy('browser'));
});

/* 0.3-P2-fix1: a server is not the only way the browser build is served. dist/ put on any static server
   carries the policy itself, in its index.html: a frame sending itself away is stopped by the policy of
   the document that holds it, so without it the frame could leave (RESULTS 0.3-P0 §1). */
check('the built bundle served by a plain static server carries the policy itself, and a frame cannot leave', async () => {
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
  const root = join(process.cwd(), 'dist');
  const plain = createServer((req, res) => { let p = join(root, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) p = join(root, 'index.html'); res.writeHead(200, {'content-type': types[extname(p)] ?? 'application/octet-stream'}); res.end(readFileSync(p)); });
  await new Promise(resolve => plain.listen(TRAP + 4, '127.0.0.1', resolve));
  const page = await openPage(`http://127.0.0.1:${TRAP + 4}/`, {cdp: 9386, profile: '/tmp/aphrodite-pages-static-profile'});
  try {
    await waitFor(() => page.evaluate(`location.port === '${TRAP + 4}' && !!document.querySelector('#app')`), 'the static page');
    assert.equal(await page.evaluate(`document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null`), appPolicy('browser'), 'the policy is in the page');
    const before = hits.length;
    const leaving = framedDocument(`<p>leaving</p><script>setTimeout(() => { location.href = '${SERVER}/static/self-after-1s'; }, 300)</script>`, {media: () => undefined, origins: []});
    await page.evaluate(`(() => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = ${JSON.stringify(leaving)}; document.body.append(f); return true; })()`);
    await sleep(2000);
    assert.deepEqual(hits.slice(before), [], 'nothing reached the server');
  } finally { page.close(); plain.close(); }
});

check('the app itself runs under that policy without being refused anything', async () => {
  await personClicks('welcome-sample');
  await waitFor(() => evaluate('!!document.querySelector(".space-frame.active [data-block-id]")'), 'the sample canvas');
  await sleep(1500);
  await personClicks('preview');
  await sleep(1200);
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
  const violations = await evaluate('window.__violations');
  assert.deepEqual(violations, [], JSON.stringify(violations));
  // The person opens the door, so the agent's pages below are written.
  await personPresses('agent-connect-toggle');
  await sleep(250);
  await presses('Escape');
  await sleep(5_200);
});

/** Every way out the spike found, each aimed at the recording server (scripts/wall/probes.mjs; verify:wall runs it in WebKit). */
const probe = tag => requestProbe(tag, SERVER, TRAP);

/* A known limit, measured so nobody takes it for fixed: a browser has no setting that keeps a page from
   WebRTC or preconnect, and the browser build is for development and checks, not people's pages. The
   desktop's wall is WebKit's own (src-tauri/src/page_wall.rs) and verify:wall measures it. Here the counts
   must not be 0: if they are, something changed, and this limit and its note need a second look. */
check('known limit: the browser build cannot keep a page from WebRTC or preconnect', async () => {
  const before = packets.length, tcpBefore = connections.length;
  await makePage('Known limit', `<link rel=preconnect href="http://127.0.0.1:${TCP}/"><script>(async () => { const pc = new RTCPeerConnection({iceServers: [{urls: 'stun:127.0.0.1:${UDP}'}]}); pc.createDataChannel('x'); await pc.setLocalDescription(await pc.createOffer()); parent.postMessage({limit: 'offer made'}, '*'); })()</script>`);
  await waitFor(async () => (await messages('limit')).length, 'the page to make an offer', 20);
  await sleep(3000);
  result.knownLimit = {udp: packets.length - before, tcp: connections.length - tcpBefore};
  assert.ok(result.knownLimit.udp > 0 && result.knownLimit.tcp > 0, `expected the browser to reach out, measured ${JSON.stringify(result.knownLimit)}`);
});

for (const [tag, html] of [['probe', probe('probe')]]) {
  check('a page reaches nothing outside, whatever it tries', async () => {
    const before = hits.length;
    const url = await evaluate('location.href');
    const id = await makePage(`Probe ${tag}`, html);
    await waitFor(() => evaluate(`window.__frameMessages.some(m => m && m.probe === '${tag}' && m.name === 'ran')`), `the ${tag} page to run in its frame`, 20);
    await sleep(2500);
    const seen = hits.slice(before);
    result[tag] = {tried: (await evaluate(`window.__frameMessages.filter(m => m && m.probe === '${tag}').map(m => m.name + '=' + m.value)`)), reached: seen};
    assert.deepEqual(seen, [], `the server was reached: ${JSON.stringify(seen)}`);
    assert.equal(await evaluate('location.href'), url, 'the app stayed where it was');
    assert.equal(await evaluate(`!!document.querySelector('[data-page-id="${id}"] iframe')`), true, 'the frame is still on the board');
    await waitFor(() => evaluate(`window.__frameMessages.some(m => m && m.probe === '${tag}' && m.name === 'entity-hidden-file')`), 'the probe to say what its file: address loaded', 20);
    assert.equal(await evaluate(`window.__frameMessages.find(m => m && m.probe === '${tag}' && m.name === 'entity-hidden-file')?.value`), '0', 'a file: address hidden behind an entity loads nothing (Chrome refuses file: from a web page in any case; the http address hidden the same way, counted at the server above, is the probe that tells)');
  });
}

/* 0.3-P2-fix3: the script wall fix1 put in the page's own window broke ordinary pages (a web component's
   `const shadowRoot`, document.write, the words "shadowrootmode" in a paragraph) and is gone. A frame the
   page makes of its own is left alone too; what it asks for is held by the same policy. */
check('ordinary pages run as written: a web component, document.write, and a frame of the page\'s own that reaches nothing', async () => {
  const before = hits.length;
  await sleep(5_200);
  const inner = probe('inner');
  await makePage('Ordinary page', `<p id="prose">Set shadowrootmode="open" on a template to declare one.</p><x-card></x-card>
<script>addEventListener('error', e => parent.postMessage({ordinary: 'error ' + e.message}, '*'));
addEventListener('message', e => { if (e.data && e.data.probe === 'inner' && e.data.name === 'ran') parent.postMessage({ordinary: 'inner ran'}, '*'); });
class XCard extends HTMLElement { connectedCallback() { const shadowRoot = this.attachShadow({mode: 'open'}); shadowRoot.innerHTML = '<b>card</b>'; parent.postMessage({ordinary: 'component ' + shadowRoot.textContent}, '*'); } }
customElements.define('x-card', XCard);</script>
<script>document.write('<p id="written">written</p>'); parent.postMessage({ordinary: 'write ' + document.getElementById('written')?.textContent}, '*'); parent.postMessage({ordinary: 'prose ' + document.getElementById('prose').textContent}, '*');</script>
<iframe srcdoc="${inner.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`);
  await waitFor(async () => (await messages('ordinary')).includes('inner ran'), 'the ordinary page and its own frame to run', 20);
  await sleep(2500);
  const said = await messages('ordinary');
  result.ordinary = said;
  assert.deepEqual(said.filter(s => s.startsWith('error')), [], 'no script failed');
  assert.ok(said.includes('component card'), 'the web component drew itself');
  assert.ok(said.includes('write written'), 'document.write wrote');
  assert.ok(said.includes('prose Set shadowrootmode="open" on a template to declare one.'), 'the words are as written');
  assert.deepEqual(hits.slice(before), [], 'the page\'s own frame reached nothing');
});

/* The frame's sandbox, its policy and the app's frame-src hold without a line of the host's script: the
   probe is framed as the board frames it, then the host's scripts are cut out of the document, and the
   frame is put straight into the app's page under the app's policy. (Removing an executed script element
   from inside the page, as this check once did, leaves its listeners running: 0.3-P2-fix1 #10.) */
check('a page framed without any of the host’s scripts reaches nothing outside either', async () => {
  const before = hits.length;
  const url = await evaluate('location.href');
  const doc = framedDocument(probe('bare'), {media: () => undefined, origins: []});
  // A link over the whole frame: the host script, if it were there, would report a press on it, and Esc.
  const cover = '<a id="host-check" href="https://example.com/host-check" style="position:fixed;inset:0;z-index:2147483647;display:block">x</a>';
  const page = doc.slice(doc.indexOf(FRAME_PREFIX_END) + FRAME_PREFIX_END.length);
  const bareDoc = doc.slice(0, doc.indexOf('<script>')) + cover + page;
  // The control is a plain page: the probe's own frames would have the host take its document away.
  const hostedDoc = doc.slice(0, doc.indexOf(FRAME_PREFIX_END) + FRAME_PREFIX_END.length) + cover + '<p>control</p>';
  assert.ok(!bareDoc.includes("aphrodite:'frame'") && !bareDoc.includes('typeof RTCPeerConnection'), 'no host script is left in it');
  await evaluate(`(() => { const f = document.createElement('iframe'); f.id = 'bare-frame'; f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = ${JSON.stringify(bareDoc)}; f.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:200px;opacity:0'; document.body.append(f); return true; })()`);
  await waitFor(() => evaluate(`window.__frameMessages.some(m => m && m.probe === 'bare' && m.name === 'ran')`), 'the bare page to run', 20);
  await sleep(2500);
  const seen = hits.slice(before);
  result.bare = {tried: await evaluate(`window.__frameMessages.filter(m => m && m.probe === 'bare').map(m => m.name + '=' + m.value)`), reached: seen};
  assert.deepEqual(seen, [], `the server was reached: ${JSON.stringify(seen)}`);
  assert.equal(await evaluate('location.href'), url, 'the app stayed where it was');
  // Pressed and given Esc, it says nothing. The same press on the same page with the host script does,
  // which is what shows this would hear it.
  const spoke = () => evaluate(`window.__frameMessages.filter(m => m && m.aphrodite === 'frame').length`);
  const pressFrame = async () => { await click({x: 150, y: 100}); await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27}); await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27}); await sleep(500); };
  const quiet = await spoke();
  await evaluate(`(document.querySelector('#bare-frame').style.zIndex = '2147483647', true)`);
  await pressFrame();
  const after = await spoke();
  await evaluate(`document.querySelector('#bare-frame').remove(), true`);
  assert.equal(after, quiet, 'no host script spoke, pressed or given Esc');
  await evaluate(`(() => { const f = document.createElement('iframe'); f.id = 'hosted-frame'; f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = ${JSON.stringify(hostedDoc)}; f.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:200px;opacity:0;z-index:2147483647'; document.body.append(f); return true; })()`);
  await sleep(1200);
  await pressFrame();
  const heard = await spoke();
  await evaluate(`document.querySelector('#hosted-frame').remove(), true`);
  assert.ok(heard > quiet, 'the same press on the page with the host script is heard');
  if (await evaluate(`!!document.querySelector('#modal-root .ui-modal, #modal-root .modal')`)) await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
});

/* The off-screen renderer loads a page of its own, top level, from the loopback bridge (src-tauri/src/
   snapshot.rs). Served the same way here, the shell must keep the probe from reaching anything, its
   one-second move out of the frame included (RESULTS 0.3-P0 §4: on 11/18 the render window left). A
   listener is added beside the shell for this check only, to hear the probe start. */
check('the page the off-screen renderer loads keeps the probe from reaching anything', async () => {
  const before = hits.length;
  const listener = `<script>window.__m = []; addEventListener('message', e => window.__m.push(e.data));</script>`;
  const shell = renderShell(framedDocument(probe('render'), {media: () => undefined, origins: []}), []).replace('<iframe', listener + '<iframe');
  const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(shell); });
  await new Promise(resolve => server.listen(TRAP + 2, '127.0.0.1', resolve));
  const page = await openPage(`http://127.0.0.1:${TRAP + 2}/render/once`, {cdp: 9384, profile: '/tmp/aphrodite-pages-render-profile'});
  try {
    await waitFor(() => page.evaluate(`window.__m.some(m => m && m.probe === 'render' && m.name === 'ran')`), 'the probe to run in the render page', 20);
    await sleep(2500);
    const seen = hits.slice(before);
    result.render = {reached: seen, url: await page.evaluate('location.href')};
    assert.deepEqual(seen, [], `the server was reached: ${JSON.stringify(seen)}`);
    assert.equal(await page.evaluate('location.pathname'), '/render/once', 'the render page stayed where it was');
  } finally { page.close(); server.close(); }
});


/* ---- the person's side: one press selects, two go in, a press outside or Esc comes out ---- */

const mouse = (type, p, extra = {}) => send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', clickCount: 1, ...extra});
const click = async (p, count = 1) => {
  await mouse('mouseMoved', p, {button: 'none'});
  for (let n = 1; n <= count; n++) { await mouse('mousePressed', p, {buttons: 1, clickCount: n}); await mouse('mouseReleased', p, {clickCount: n}); }
  await sleep(350);
};
const seq = async () => (await agent('changes', {limit: 1, include_view: true})).seq;
const camera = () => evaluate('document.querySelector("#app").dataset.camera');
const active = () => evaluate('document.querySelector(".space-frame.active")?.dataset.pageId');
const entered = id => evaluate(`(() => { const s = document.querySelector('[data-page-id="${id}"]'); return s.classList.contains('entered') && !s.querySelector('iframe').inert; })()`);
/** A point inside a free page, in the page's own pixels, wherever the camera has it. */
const inPage = (id, x, y) => evaluate(`(() => { const r = document.querySelector('[data-page-id="${id}"] .board-item').getBoundingClientRect(); const z = Number(document.querySelector('#app').dataset.camera.split(',')[2]); return {x: r.left + ${x} * z, y: r.top + ${y} * z}; })()`);
const messages = (key) => evaluate(`window.__frameMessages.filter(m => m && m[${JSON.stringify(key)}] !== undefined).map(m => m[${JSON.stringify(key)}])`);
const pressed = async () => (await messages('pressed')).at(-1) ?? 0;
const emptySpot = () => evaluate(`(() => { const s = document.querySelector('#canvas-scroll').getBoundingClientRect(); const frames = [...document.querySelectorAll('.space-frame')].map(f => f.getBoundingClientRect());
  for (let y = s.top + 20; y < s.bottom - 20; y += 10) for (let x = s.left + 20; x < s.right - 20; x += 10) { if (frames.some(r => x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 40 && y <= r.bottom + 8)) continue;
    const hit = document.elementFromPoint(x, y); if (hit && (hit.id === 'canvas-scroll' || hit.id === 'space-world')) return {x, y}; } return null; })()`);
let enterId, sampleId;

check('one press on a free page selects it, and presses nothing inside it', async () => {
  sampleId = await evaluate('document.querySelector(".space-frame.active").dataset.pageId');
  const html = `<!doctype html><html><body style="margin:0;height:3000px;font:16px sans-serif">
<button id="b" style="position:fixed;left:20px;top:20px;width:240px;height:80px">Pressed <b id="n">0</b></button>
<a id="out" href="https://example.com/outside" style="position:fixed;left:20px;top:140px;display:block;width:240px;height:40px">outside</a>
<a id="hash" href="#far" style="position:fixed;left:20px;top:200px;display:block;width:240px;height:40px">far down</a>
<a id="pg" href="page:${sampleId}" style="position:fixed;left:20px;top:260px;display:block;width:240px;height:40px">the sample</a>
<p id="far" style="position:absolute;top:2500px">far</p>
<script>parent.postMessage({boot: 'enter'}, '*'); let n = 0; document.getElementById('b').onclick = () => { n++; document.getElementById('n').textContent = n; parent.postMessage({pressed: n}, '*'); }; addEventListener('scroll', () => parent.postMessage({scrolled: scrollY}, '*'));</script></body></html>`;
  enterId = await makePage('Press test', html, {width: 800, height: 600});
  await waitFor(async () => (await messages('boot')).includes('enter'), 'the page to start');
  await personClicks('zoom-fit');
  await sleep(500);
  assert.equal(await active(), sampleId, 'the sample is the page being looked at');
  const before = await seq();
  await click(await inPage(enterId, 140, 60));
  assert.equal(await active(), enterId, 'the press selected the free page');
  assert.equal(await pressed(), 0, 'and pressed nothing inside it');
  assert.equal(await entered(enterId), false);
  assert.equal(await seq(), before + 1, 'selecting a page is the one view change it always was');
});

check('two presses go in, and a press inside reaches the page', async () => {
  const before = await seq();
  await click(await inPage(enterId, 140, 60), 2);
  assert.equal(await entered(enterId), true, 'in');
  await click(await inPage(enterId, 140, 60));
  assert.equal(await pressed(), 1, 'the button inside was pressed once');
  assert.equal(await seq(), before, 'going in is not an edit');
});

check('a press outside comes back out, and the same press on the page presses nothing', async () => {
  await click(await emptySpot());
  assert.equal(await entered(enterId), false, 'out');
  await click(await inPage(enterId, 140, 60));
  assert.equal(await pressed(), 1, 'still one press');
});

check('outside the page the wheel moves the board; inside it, the page', async () => {
  const at = await inPage(enterId, 400, 400);
  let was = await camera();
  await send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: 120});
  await sleep(300);
  assert.notEqual(await camera(), was, 'the board moved');
  await click(await inPage(enterId, 140, 60), 2);
  assert.equal(await entered(enterId), true);
  was = await camera();
  const inside = await inPage(enterId, 400, 400);
  await send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: inside.x, y: inside.y, deltaX: 0, deltaY: 300});
  await sleep(400);
  assert.equal(await camera(), was, 'the board stayed');
  assert.ok((await messages('scrolled')).some(y => y > 0), 'the page scrolled');
});

check('Esc typed inside the page comes back out', async () => {
  await click(await inPage(enterId, 140, 60));
  assert.equal(await pressed(), 2);
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await sleep(300);
  assert.equal(await entered(enterId), false);
});

check('a link to #somewhere scrolls inside the page instead of loading the app into it', async () => {
  await click(await inPage(enterId, 140, 60), 2);
  const scrolled = (await messages('scrolled')).length;
  await click(await inPage(enterId, 140, 220));
  await sleep(300);
  assert.ok((await messages('scrolled')).slice(scrolled).some(y => y > 1500), 'scrolled to the far paragraph');
  assert.deepEqual(await messages('boot'), ['enter'], 'the page did not start again');
});

check('a link to page:<id> shows that page on the board and changes nothing', async () => {
  const before = await seq(), was = await camera();
  await click(await inPage(enterId, 140, 280));
  await sleep(400);
  assert.notEqual(await camera(), was, 'the board moved to the page');
  assert.equal(await seq(), before, 'nothing was recorded');
});

check('a link out of the app is only shown to the person, with the address, until they press Open', async () => {
  await personClicks('zoom-fit');
  await sleep(500);
  await click(await inPage(enterId, 140, 60), 2);
  const targets = async () => (await send('Target.getTargets', {})).result.targetInfos.filter(t => t.type === 'page').length;
  const pages = await targets();
  await click(await inPage(enterId, 140, 160));
  await sleep(400);
  assert.equal(await evaluate(`document.querySelector('#modal-root .link-host')?.textContent`), 'example.com', 'the host is shown on its own');
  assert.equal(await evaluate(`document.querySelector('#modal-root .link-address')?.textContent`), 'https://example.com/outside', 'and the whole address');
  assert.equal(await targets(), pages, 'nothing was opened');
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
});

check('Preview shows a free page running, in the same kind of frame', async () => {
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
  assert.equal(await active(), enterId);
  const boots = (await messages('boot')).length;
  await personClicks('preview');
  await waitFor(async () => (await messages('boot')).length > boots, 'the page to start in Preview');
  const frame = await evaluate(`(() => { const f = document.querySelector('#modal-root iframe'); return f && {sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow'), page: f.dataset.framePage}; })()`);
  assert.deepEqual(frame, {sandbox: 'allow-scripts', allow: FRAME_ALLOW, page: enterId});
  await sleep(800); // the dialog's opening motion
  const at = await evaluate(`(() => { const r = document.querySelector('#modal-root iframe').getBoundingClientRect(); return {x: r.left + 140, y: r.top + 60}; })()`);
  const was = (await messages('pressed')).length;
  await click(at);
  assert.deepEqual((await messages('pressed')).slice(was), [1], 'the button in Preview was pressed, in a page of its own');
  // The key goes up once Preview has closed: a key sent to a frame that is taken away under it is never answered (CDP waits for ever).
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await sleep(300);
  assert.equal(await evaluate(`!document.querySelector('#modal-root iframe')`), true, 'Esc inside Preview closes it');
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
});

/* ---- pictures and videos: dropped, pasted, played, shown inside a page, taken back ---- */

const dropFiles = async (names, p) => {
  await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: p.x, y: p.y});
  const data = {items: [], files: names.map(fileAt), dragOperationsMask: 1};
  for (const type of ['dragEnter', 'dragOver', 'drop']) await send('Input.dispatchDragEvent', {type, x: p.x, y: p.y, data});
};
const mediaItems = () => evaluate(`[...document.querySelectorAll('.board-media')].map(m => { const el = m.querySelector('img,video'); return {page: m.closest('.space-frame').dataset.pageId, tag: el.tagName, ready: el.tagName === 'IMG' ? el.naturalWidth : el.readyState}; })`);
let dropped = [];

check('a screenshot and an mp4 dropped from the Finder land on the board as one change, the person’s', async () => {
  // Made in the browser by code: a picture on a canvas, and two seconds of video recorded from it.
  const made = await evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 800; const g = c.getContext('2d');
    const paint = t => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 1280, 800); g.fillStyle = '#2f4cd8'; g.fillRect(80 + t * 6, 120, 360, 240); g.fillStyle = '#1f2937'; g.font = '48px sans-serif'; g.fillText('Board screenshot · ' + t, 80, 520); };
    paint(0);
    const png = await new Promise(r => c.toBlob(r, 'image/png'));
    const type = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    const rec = new MediaRecorder(c.captureStream(15), {mimeType: type}); const parts = []; rec.ondataavailable = e => parts.push(e.data);
    rec.start(); for (let t = 0; t < 30; t++) { paint(t); await new Promise(r => setTimeout(r, 66)); } rec.stop(); await new Promise(r => rec.onstop = r);
    const b64 = async b => { const s = new Uint8Array(await b.arrayBuffer()); let out = ''; for (let i = 0; i < s.length; i += 32768) out += String.fromCharCode(...s.subarray(i, i + 32768)); return btoa(out); };
    return {png: await b64(png), video: await b64(new Blob(parts, {type})), ext: type === 'video/mp4' ? 'mp4' : 'webm'};
  })()`);
  writeFileSync(fileAt('screenshot.png'), Buffer.from(made.png, 'base64'));
  writeFileSync(fileAt(`clip.${made.ext}`), Buffer.from(made.video, 'base64'));
  result.videoKind = made.ext;
  await personClicks('zoom-fit');
  await sleep(400);
  const before = await seq();
  await dropFiles(['screenshot.png', `clip.${made.ext}`], await emptySpot());
  await waitFor(async () => (await seq()) > before, 'the files on the board', 30);
  const {changes} = await agent('changes', {since: before, include_view: true, limit: 5});
  assert.equal(changes.length, 1, 'one change');
  assert.deepEqual(changes[0].author, {kind: 'person', name: 'you'});
  assert.equal(changes[0].source, 'media:drop');
  await waitFor(async () => (await mediaItems()).filter(m => m.ready > 0).length === 2, 'the picture and the video to load', 30);
  dropped = (await mediaItems()).map(m => m.page);
  const contract = await agent('contract', {});
  const items = contract.pages.filter(p => dropped.includes(p.page_id));
  result.dropped = items.map(p => p.media);
  assert.equal(items.length, 2);
  for (const item of items) assert.match(item.media.src, /^media:[0-9a-f]{64}$/, 'named by its hash, not by a place on this machine');
});

check('with a picture selected, adding a component changes nothing and says why', async () => {
  const shot = (await mediaItems()).find(m => m.tag === 'IMG').page;
  await personPresses('page', {id: shot});
  await sleep(300);
  assert.equal(await active(), shot, 'the picture is the page being looked at');
  const before = await seq();
  await personPresses('add', {kind: 'cta'});
  await sleep(400);
  assert.equal(await seq(), before, 'nothing was added');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /picture or a video, which has no sections|그림·영상에는 섹션이 없습니다/);
});

check('a file past what a board holds, or of another kind, is refused with its reason, and nothing lands', async () => {
  writeFileSync(fileAt('notes.txt'), 'not a picture');
  writeFileSync(fileAt('huge.mp4'), Buffer.from([0, 0, 0, 0x20, ...Buffer.from('ftypisom')]));
  truncateSync(fileAt('huge.mp4'), 100 * 1024 * 1024 + 1);
  const before = await seq();
  await dropFiles(['notes.txt', 'huge.mp4'], await emptySpot());
  await sleep(1200);
  const said = await evaluate(`document.querySelector('#toast').textContent`);
  assert.match(said, /notes\.txt is not a PNG, JPEG, GIF, WebP, MP4 or WebM/);
  assert.match(said, /huge\.mp4 is 101 MB; a file on a board holds at most 100 MB in the browser/);
  assert.equal(await seq(), before, 'nothing was placed');
});

check('pressing play plays the video, and selecting other pages leaves it playing', async () => {
  const video = (await mediaItems()).find(m => m.tag === 'VIDEO').page;
  const play = await evaluate(`(() => { const r = document.querySelector('[data-board-play="${video}"]').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
  await click(play);
  await sleep(600);
  await evaluate(`(document.querySelector('[data-page-id="${video}"] video').__mark = 1, true)`);
  assert.equal(await evaluate(`!document.querySelector('[data-page-id="${video}"] video').paused`), true, 'playing');
  const t0 = await evaluate(`document.querySelector('[data-page-id="${video}"] video').currentTime`);
  await click(await inPage(enterId, 140, 60));
  await sleep(500);
  const now = await evaluate(`(() => { const v = document.querySelector('[data-page-id="${video}"] video'); return {mark: v.__mark, paused: v.paused, t: v.currentTime}; })()`);
  assert.equal(now.mark, 1, 'the same video element');
  assert.equal(now.paused, false, 'still playing');
  assert.ok(now.t > t0, 'and moving on');
});

check('a page shows a board picture it names as media:<sha256>', async () => {
  const contract = await agent('contract', {});
  const shot = contract.pages.find(p => dropped.includes(p.page_id) && p.media.mime === 'image/png').media.src;
  await makePage('Uses the screenshot', `<img id="i" src="${shot}" style="width:400px"><script>addEventListener('load', () => parent.postMessage({shotWidth: document.getElementById('i').naturalWidth}, '*'))</script>`, {width: 800, height: 600});
  await waitFor(async () => (await messages('shotWidth')).length, 'the page to load its picture', 20);
  assert.equal((await messages('shotWidth')).at(-1), 1280);
});

check('a picture pasted with ⌘V lands as the person’s', async () => {
  await send('Emulation.setFocusEmulationEnabled', {enabled: true});
  await send('Browser.grantPermissions', {permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: `http://127.0.0.1:${PORT}`});
  await evaluate(`(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#c9a75a'; g.fillRect(0, 0, 600, 400); const b = await new Promise(r => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); document.activeElement?.blur(); return true; })()`);
  const before = await seq();
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86, commands: ['paste']});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86});
  await waitFor(async () => (await seq()) > before, 'the pasted picture', 20);
  const {changes} = await agent('changes', {since: before, include_view: true, limit: 5});
  assert.equal(changes.length, 1);
  assert.deepEqual([changes[0].author.kind, changes[0].source], ['person', 'media:paste']);
});

check('⌘Z takes a paste back off the board', async () => {
  const count = (await mediaItems()).length;
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90});
  await sleep(600);
  assert.equal((await mediaItems()).length, count - 1);
});

check('an agent’s media_add in the browser build is refused with the reason, and nothing moves', async () => {
  await sleep(5_200); // the person's keys hold the screen for five seconds
  const before = await seq();
  const got = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'media_add', path: '/tmp/x.png'}]});
  assert.match(got.error ?? '', /browser build cannot read files/);
  // A model in the app may not name a path at all; it is told to name a library picture instead.
  const inApp = await evaluate(`window.aphroditeAgent.run('apply', ${JSON.stringify({reason: WHY, ops: [{op: 'media_add', path: '/tmp/x.png'}]})}, 'claude-code', 'inApp')`);
  assert.match(inApp.error ?? '', /only for an agent running on this Mac.*library_id/);
  assert.equal(await seq(), before);
});

/* 0.3-P2: on a board of ten pages, selecting, moving a frame and zooming load none of them again.
   Each page says hello once each time it starts. */
check('on a board of ten pages, selecting, moving and zooming load none of them again', async () => {
  const boots = async () => (await messages('ten')).length;
  await sleep(5_200);
  const ops = Array.from({length: 10}, (_, i) => ({op: 'html_page', name: `Ten ${i + 1}`, html: `<h1>Page ${i + 1}</h1><script>parent.postMessage({ten: ${i}}, '*')</script>`, width: 800, height: 500}));
  const made = await agent('apply', {reason: WHY, base_revision: await revision(), ops});
  assert.ok(made.ok, JSON.stringify(made).slice(0, 300));
  await waitFor(async () => (await boots()) === 10, 'ten pages to start', 30);
  await personClicks('zoom-fit');
  await sleep(500);
  const ids = made.created_pages.map(p => p.page_id);
  for (const id of ids.slice(0, 4)) await click(await inPage(id, 100, 100));
  const handle = await evaluate(`(() => { const r = document.querySelector('[data-page-id="${ids[5]}"] .frame-name').getBoundingClientRect(); return {x: r.left + 10, y: r.top + r.height / 2}; })()`);
  await mouse('mouseMoved', handle, {button: 'none'}); await mouse('mousePressed', handle, {buttons: 1});
  for (let i = 1; i <= 6; i++) await mouse('mouseMoved', {x: handle.x + i * 12, y: handle.y + i * 8}, {buttons: 1});
  await mouse('mouseReleased', {x: handle.x + 72, y: handle.y + 48});
  await sleep(400);
  await personClicks('zoom-in'); await sleep(200); await personClicks('zoom-out'); await sleep(400);
  assert.equal(await active(), ids[3], 'the last press selected its page');
  result.tenBoots = await boots();
  assert.equal(await boots(), 10, 'no page started again');
});

/* ---- 0.3-P2-fix1: a file that arrives later, a copy of the project, a project changed while files are read ---- */

const DOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
check('a page naming a file the board does not have yet shows it once the file is dropped', async () => {
  writeFileSync(fileAt('late.png'), DOT);
  const sha = createHash('sha256').update(DOT).digest('hex');
  await sleep(5_200);
  await makePage('Waits for a picture', `<img id="late" src="media:${sha}"><script>const report = () => parent.postMessage({late: document.getElementById('late').naturalWidth}, '*'); addEventListener('load', report);</script>`, {width: 600, height: 400});
  await waitFor(async () => (await messages('late')).length === 1, 'the page to load without its picture', 20);
  assert.deepEqual(await messages('late'), [0]);
  await personClicks('zoom-fit');
  await sleep(400);
  await dropFiles(['late.png'], await emptySpot());
  await waitFor(async () => (await messages('late')).includes(1), 'the page to show the picture that arrived', 20);
});

check('a copy of the project imported from the editor opens with frames of its own, and the person is not inside any of them', async () => {
  await personPresses('page', {id: enterId}); await sleep(300);
  await personClicks('zoom-frame'); await sleep(500);
  await click(await inPage(enterId, 140, 60), 2);
  assert.equal(await entered(enterId), true);
  await evaluate(`(document.querySelector('[data-page-id="${enterId}"] iframe').__mark = 'original', true)`);
  const boots = (await messages('boot')).filter(b => b === 'enter').length;
  const lib = JSON.parse(await evaluate(`localStorage.getItem('aphrodite-project-library-v1')`));
  const original = lib.entries.find(e => e.project.pages.some(p => p.id === enterId)).project;
  writeFileSync(fileAt('copy.json'), JSON.stringify(original));
  // Import, straight from the editor: the copy gets an id of its own and keeps the page ids.
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project'); await sleep(500);
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt('copy.json')]});
  await waitFor(async () => (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`)) > lib.entries.length, 'the copy to open', 20);
  await sleep(1200);
  const copy = await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => e.project.id).find(id => id !== ${JSON.stringify(original.id)})`);
  assert.ok(copy, 'a copy was made');
  assert.equal(await entered(enterId), false, 'not inside the copy’s page');
  assert.equal(await evaluate(`document.querySelector('[data-page-id="${enterId}"] iframe').__mark ?? null`), null, 'a frame of its own');
  await waitFor(async () => (await messages('boot')).filter(b => b === 'enter').length > boots, 'the copy’s page to start');
  result.copy = {original: original.id, copy};
});

check('files read while the person moves to another project are placed nowhere', async () => {
  const {original} = result.copy;
  // Reading the picture is held back a moment, as a large file would be.
  await evaluate(`(() => { const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onload'); window.__restoreOnload = () => Object.defineProperty(HTMLImageElement.prototype, 'onload', {set(f) { d.set.call(this, f); }, get() { return d.get.call(this); }, configurable: true});
    Object.defineProperty(HTMLImageElement.prototype, 'onload', {set(f) { d.set.call(this, f && (e => setTimeout(() => f.call(this, e), 2500))); }, get() { return d.get.call(this); }, configurable: true}); return true; })()`);
  writeFileSync(fileAt('moving.png'), DOT);
  const items = await mediaItems();
  const stored = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => ({id: e.project.id, media: e.project.pages.filter(p => p.kind === 'media').length, pages: e.project.pages.length, seq: e.project.ledger?.seq ?? 0}))`);
  const arrived = (await stored()).find(e => e.id === original);
  await personClicks('zoom-fit'); await sleep(300);
  await dropFiles(['moving.png'], await emptySpot());
  await sleep(300);
  await personPresses('home'); await sleep(400);
  await personPresses('hub-open', {id: original}); await sleep(3500);
  await evaluate('window.__restoreOnload(), true');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /project changed while the files were read|프로젝트가 바뀌어/);
  const lib = JSON.parse(await evaluate(`localStorage.getItem('aphrodite-project-library-v1')`));
  const counts = Object.fromEntries(lib.entries.map(e => [e.project.id, e.project.pages.filter(p => p.kind === 'media').length]));
  result.moving = counts;
  assert.equal(counts[result.copy.copy], items.length, 'the copy it was dropped on gained nothing');
  // Nor the project the person went to: the same pages and the same history as when they left it.
  const now = (await stored()).find(e => e.id === original);
  assert.deepEqual({media: now.media, pages: now.pages}, {media: arrived.media, pages: arrived.pages}, 'the project they went to gained nothing');
  const {changes} = await agent('changes', {since: arrived.seq, include_view: true, limit: 20});
  assert.deepEqual(changes.filter(c => c.source === 'media:drop' || c.source === 'media:paste'), [], 'and records no picture');
});

/* 0.3-P2-fix2 #5: the browser build cannot put a file past 8 MB into a frame. A page naming one is drawn
   once without it; selecting does not draw it again, since drawing again would not change it. */
check('a page naming a picture too big to put in its frame starts once, however often the person selects', async () => {
  const big = await evaluate(`(async () => { const c = document.createElement('canvas'); c.width = 1800; c.height = 1800; const g = c.getContext('2d'); const d = g.createImageData(1800, 1800); for (let i = 0; i < d.data.length; i += 65536) crypto.getRandomValues(d.data.subarray(i, i + 65536)); for (let i = 3; i < d.data.length; i += 4) d.data[i] = 255; g.putImageData(d, 0, 0); const b = await new Promise(r => c.toBlob(r, 'image/png')); const s = new Uint8Array(await b.arrayBuffer()); let out = ''; for (let i = 0; i < s.length; i += 32768) out += String.fromCharCode(...s.subarray(i, i + 32768)); return btoa(out); })()`);
  const bytes = Buffer.from(big, 'base64');
  assert.ok(bytes.length > 8 * 1024 * 1024, `${bytes.length} bytes`);
  writeFileSync(fileAt('big.png'), bytes);
  await personClicks('zoom-fit'); await sleep(300);
  const before = await seq();
  await dropFiles(['big.png'], await emptySpot());
  await waitFor(async () => (await seq()) > before, 'the big picture on the board', 40);
  await sleep(5_200);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const id = await makePage('Names a big picture', `<img src="media:${sha}"><script>parent.postMessage({bigBoot: 1}, '*')</script>`, {width: 600, height: 400});
  await waitFor(async () => (await messages('bigBoot')).length === 1, 'the page to start');
  const others = (await agent('contract', {})).pages.map(p => p.page_id).filter(p => p !== id).slice(0, 4);
  for (const other of [...others, id, ...others]) { await personPresses('page', {id: other}); await sleep(250); }
  await sleep(800);
  result.bigBoots = (await messages('bigBoot')).length;
  assert.equal(result.bigBoots, 1, 'it started once');
});

/* 0.3-P2-fix2 #3·4: commit() saves what the person is typing before the change it records (0.3-2b). A
   change made of what was read before that, or checked against the revision before that, would put the
   text back or write over it. */
const typeIntoTitle = async text => {
  const section = (await agent('contract', {})).pages.find(p => p.block_count > 0).page_id;
  await personPresses('page', {id: section}); await sleep(600);
  const id = await evaluate(`document.querySelector('.space-frame.active [data-block-id][data-kind="hero"], .space-frame.active [data-block-id]').dataset.blockId`);
  await personPresses('select', {id}); await sleep(400);
  const focused = await evaluate(`(() => { const t = document.querySelector('[data-field="title"]'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return document.activeElement === t; })()`);
  assert.equal(focused, true, 'the title field has the focus');
  await send('Input.insertText', {text});
  await sleep(200);
  return id;
};
const titleOf = async id => (await agent('contract', {})).pages.flatMap(p => p.blocks ?? p.components ?? []).find(b => (b.block_id ?? b.id) === id)?.title;

check('a drop that finishes while the person is typing keeps what they typed, and records only the picture', async () => {
  writeFileSync(fileAt('typing.png'), DOT);
  await sleep(5_200);
  const before = await seq();
  const id = await typeIntoTitle(' 놓는 동안');
  await evaluate(`(() => { const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onload'); window.__restoreOnload = () => Object.defineProperty(HTMLImageElement.prototype, 'onload', {set(f) { d.set.call(this, f); }, get() { return d.get.call(this); }, configurable: true});
    Object.defineProperty(HTMLImageElement.prototype, 'onload', {set(f) { d.set.call(this, f && (e => setTimeout(() => f.call(this, e), 1500))); }, get() { return d.get.call(this); }, configurable: true}); return true; })()`);
  await dropFiles(['typing.png'], await emptySpot());
  await waitFor(async () => (await seq()) >= before + 2, 'the text and the picture to be recorded', 20);
  await evaluate('window.__restoreOnload(), true');
  assert.equal(await evaluate(`document.activeElement?.dataset.field ?? document.querySelector('[data-field="title"]')?.value`) !== undefined, true);
  const {changes} = await agent('changes', {since: before, include_view: true, limit: 10});
  const media = changes.find(c => c.source === 'media:drop');
  assert.ok(media, 'the drop was recorded');
  assert.ok(!JSON.stringify(media.ops).includes(id), `the drop's change touches only the new item: ${JSON.stringify(media.ops).slice(0, 300)}`);
  assert.match(await titleOf(id) ?? '', / 놓는 동안$/, 'what the person typed is still there');
});

check('an agent batch written against the revision before the person’s typing is refused, and changes nothing', async () => {
  const rev = (await agent('changes', {limit: 1})).revision;
  const id = await typeIntoTitle(' 사람이 친 글');
  await sleep(5_200); // the person's keys hold the screen for five seconds; the field keeps the focus
  const got = await agent('apply', {reason: WHY, base_revision: rev, ops: [{op: 'update', block_id: id, fields: {title: 'Written by the agent'}}]});
  assert.equal(got.status, 409, JSON.stringify(got).slice(0, 300));
  assert.match(await titleOf(id) ?? '', / 사람이 친 글$/, 'the person’s text stands');
  const {changes} = await agent('changes', {limit: 3});
  assert.ok(!changes.some(c => c.source === 'agent:apply' && JSON.stringify(c.ops).includes('Written by the agent')), 'nothing of the agent’s landed');
});

/* 0.3-P2-fix4 #3: a batch that names no page lands on the page that was open when it arrived. Only a batch
   with files waits before it runs, and it holds its page while it waits. */
check('a batch without page_id lands on the page open when it arrived, though another page is picked before it answers', async () => {
  const pages = (await agent('contract', {})).pages;
  const section = pages.find(p => p.block_count > 0).page_id, other = pages.find(p => p.page_id !== section).page_id;
  await personPresses('page', {id: section}); await sleep(5_200); // the person's press holds the screen for five seconds
  assert.equal(await active(), section);
  const got = await evaluate(`(async () => { const answer = window.aphroditeAgent.run('apply', {reason: ${JSON.stringify(WHY)}, ops: [{op: 'add', component_kind: 'cta'}]}, 'claude-code');
    const picked = window.aphroditeAgent.run('click', {selector: '.space-frame[data-page-id="${other}"] .frame-name'}, 'claude-code');
    return [await answer, await picked]; })()`).then(([batch, picked]) => (assert.ok(picked.ok !== false && !picked.error, JSON.stringify(picked)), batch));
  assert.ok(got.ok, JSON.stringify(got).slice(0, 300));
  const added = got.receipt.changedNodes.find(n => n.fields.includes('added'))?.id;
  assert.ok(added, JSON.stringify(got.receipt).slice(0, 300));
  const on = (await agent('contract', {page_id: section})).pages.find(p => p.page_id === section);
  assert.ok(JSON.stringify(on).includes(added), 'the component is on the page that was open when the batch arrived');
});

/* 0.3-P2-fix4 #4: what an agent is told its batch changed is read after the person's typing is saved, so their words are not in it. */
check('an agent’s receipt holds only its own change, not the words the person was typing', async () => {
  const since = (await agent('changes', {limit: 1})).seq;
  const id = await typeIntoTitle(' 사람이 치는 중');
  await sleep(5_200);
  const got = await agent('apply', {reason: WHY, ops: [{op: 'add', component_kind: 'cta'}]});
  assert.ok(got.ok, JSON.stringify(got).slice(0, 300));
  assert.deepEqual(got.receipt.changedNodes.filter(n => n.id === id), [], `the receipt names the person’s block: ${JSON.stringify(got.receipt.changedNodes).slice(0, 300)}`);
  assert.match(await titleOf(id) ?? '', / 사람이 치는 중$/, 'the person’s words are kept');
  const {changes} = await agent('changes', {since, limit: 20});
  const holding = changes.filter(c => JSON.stringify(c.ops).includes('사람이 치는 중')).map(c => [c.author?.kind, c.source]);
  assert.deepEqual(holding, [['person', 'editor:change']], `the person’s words are one change, theirs, apart from the agent’s: ${JSON.stringify(changes.map(c => [c.seq, c.author, c.source]))}`);
});

/* 0.3-P2-fix5: every free page's frame refuses capture in its own allow attribute, and a page that asks gets no stream. */
check('a free page captures nothing: every frame refuses camera, microphone, screen and location, and asking gets no stream', async () => {
  const html = `<p>capture</p><script>(async () => { const say = (n, v) => parent.postMessage({capture: n, value: String(v)}, '*');
    say('policy', document.featurePolicy ? ['camera', 'microphone', 'display-capture', 'geolocation'].filter(f => document.featurePolicy.allowsFeature(f)).join(',') || 'none' : 'unknown');
    const md = navigator.mediaDevices; if (!md) { say('done', 'absent'); return; }
    for (const [n, f] of [['audio', () => md.getUserMedia({audio: true})], ['video', () => md.getUserMedia({video: true})], ['display', () => md.getDisplayMedia()]]) { try { const s = await f(); s.getTracks().forEach(t => t.stop()); say(n, 'stream'); } catch (e) { say(n, 'refused ' + e.name); } }
    try { say('labelled', (await md.enumerateDevices()).filter(d => d.label).length); } catch (e) { say('labelled', 'refused ' + e.name); }
    say('done', 1); })();<\/script>`;
  await makePage('Capture test', html);
  await waitFor(async () => (await messages('capture')).includes('done'), 'the capture page to finish');
  const said = await evaluate(`Object.fromEntries(window.__frameMessages.filter(m => m && m.capture).map(m => [m.capture, m.value]))`);
  result.capture = said;
  assert.equal(said.policy, 'none', 'the frame is allowed none of them');
  assert.deepEqual(Object.entries(said).filter(([, v]) => v === 'stream'), [], 'no stream');
  assert.ok(said.labelled === undefined || said.labelled === '0' || said.labelled.startsWith('refused'), `no device named: ${said.labelled}`);
  const frames = await evaluate(`[...document.querySelectorAll('iframe[data-frame-page]')].map(f => f.getAttribute('allow'))`);
  assert.ok(frames.length > 1 && frames.every(a => a === FRAME_ALLOW), JSON.stringify(frames));
});

/* 0.3-P2-fix4: where the page wall does not hold (on the desktop: a WebKit without the settings, or one that
   does not answer), no free page is put in any frame, since preconnect needs no script: a placeholder stands
   in its place, the page can still be selected and renamed, and an agent still reads its words. The browser
   build is told so with ?page-wall=off. Last, since it reloads the app. */
/* ---- 0.3-P3: a page on its own, a page sent as a file, a board sent as a file, a link that opens ---- */

const downloads = async () => {
  // What saveFile hands the browser to download, taken from the blob it makes (the app's policy lets it fetch no blob: address).
  await evaluate(`(() => { if (window.__downloads) return true; window.__downloads = []; const blobs = new Map(); const make = URL.createObjectURL; URL.createObjectURL = blob => { const url = make.call(URL, blob); blobs.set(url, blob); return url; }; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { const blob = this.download && blobs.get(this.href); if (blob) { const name = this.download; if (window.__toggleOnSave) { window.__toggleOnSave = false; document.querySelector('[data-export-scripts]')?.click(); } blob.arrayBuffer().then(b => { const s = new Uint8Array(b); let out = ''; for (let i = 0; i < s.length; i += 32768) out += String.fromCharCode(...s.subarray(i, i + 32768)); window.__downloads.push({name, b64: btoa(out)}); }); return; } return click.call(this); }; return true; })()`);
  return async (action, data) => { const n = await evaluate('window.__downloads.length'); await personPresses(action, data); await waitFor(async () => (await evaluate('window.__downloads.length')) > n, `the download from ${action}`, 40).catch(async error => { throw new Error(`${error.message}; the app said: ${await evaluate(`document.querySelector('#toast')?.textContent ?? ''`)}`); }); const got = await evaluate('window.__downloads.at(-1)'); return {name: got.name, bytes: Buffer.from(got.b64, 'base64')}; };
};
const pageView = () => evaluate('document.querySelector("#app").dataset.pageView');
let viewId;

check('a page opens on its own, framed the way every free page is; inside it the page runs, and leaving it edits nothing', async () => {
  viewId = await makePage('Seen alone', `<!doctype html><body style="margin:0;font:16px sans-serif"><button id="b" style="position:fixed;left:20px;top:20px;width:240px;height:80px">Pressed</button><a id="pg" href="page:${sampleId}" style="position:fixed;left:20px;top:140px;display:block;width:240px;height:40px">the sample</a><script>parent.postMessage({boot: 'alone'}, '*'); let n = 0; document.getElementById('b').onclick = () => parent.postMessage({alonePressed: ++n}, '*');</script></body>`);
  await personPresses('page', {id: viewId}); await sleep(400);
  const before = await seq(), boots = (await messages('boot')).filter(b => b === 'alone').length;
  await personPresses('page-view', {id: viewId});
  await waitFor(async () => (await messages('boot')).filter(b => b === 'alone').length > boots, 'the page to start on its own');
  assert.equal(await pageView(), viewId);
  const frame = await evaluate(`(() => { const f = document.querySelector('#page-view-root iframe'); return f && {sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow'), page: f.dataset.framePage, inert: f.inert}; })()`);
  assert.deepEqual(frame, {sandbox: 'allow-scripts', allow: FRAME_ALLOW, page: viewId, inert: false});
  const at = await evaluate(`(() => { const r = document.querySelector('#page-view-root iframe').getBoundingClientRect(); return {x: r.left + 140, y: r.top + 60}; })()`);
  await click(at);
  assert.deepEqual(await messages('alonePressed'), [1], 'a press reaches the page at once');
  await click({x: at.x, y: at.y + 100});
  await waitFor(async () => (await pageView()) === sampleId, 'a page: link to show that page on its own');
  assert.equal(await active(), viewId, 'the board\'s open page is the one it was');
  await personPresses('page-view-close'); await sleep(300);
  assert.equal(await pageView(), '');
  const again = (await messages('boot')).filter(b => b === 'alone').length;
  await personPresses('page-view', {id: viewId});
  await waitFor(async () => (await messages('boot')).filter(b => b === 'alone').length > again, 'the page to start again');
  await click(at);
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await sleep(300);
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  assert.equal(await pageView(), '', 'Esc typed inside the page goes back to the board');
  assert.equal(await seq(), before, 'nothing was recorded');
});

check('Edit in the app opens the page on the board, as the person\'s own step', async () => {
  await personPresses('page', {id: sampleId}); await sleep(300);
  await personPresses('page-view', {id: viewId}); await sleep(600);
  const before = await seq();
  await personPresses('page-view-edit', {id: viewId}); await sleep(500);
  assert.equal(await pageView(), '');
  assert.equal(await active(), viewId);
  const {changes} = await agent('changes', {since: before, include_view: true, limit: 5});
  assert.deepEqual(changes.map(c => [c.author.kind, c.view]), [['person', true]]);
});

check('an agent\'s reply carries a link that opens its page on its own; following one edits nothing, and one for a board this Mac lacks changes nothing on screen', async () => {
  await sleep(5_200); // the person's last press holds the screen for a moment
  const made = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_page', name: 'Linked', html: '<p>linked</p><script>parent.postMessage({boot: "linked"}, "*")</script>'}]});
  assert.ok(made.ok, JSON.stringify(made).slice(0, 300));
  const projectId = (await agent('contract', {})).project.project_id, page = made.created_pages[0].page_id;
  assert.equal(made.link, `aphrodite://open?board=${projectId}&page=${page}`);
  assert.equal((await agent('html', {page_id: page})).link, made.link, 'a page read carries it too');
  const before = await seq(), rev = await revision();
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(made.link)})`);
  await waitFor(async () => (await pageView()) === page, 'the link to show its page');
  await waitFor(async () => (await messages('boot')).includes('linked'), 'the page to start');
  // 0.3-P3-fix2 O-4: any app or page can send a link; one to a board this Mac lacks leaves the screen as it is and says so.
  await evaluate(`window.aphroditeOpenLink('aphrodite://open?board=not-a-board-here')`); await sleep(500);
  assert.equal(await evaluate('document.querySelector("#app").dataset.screen'), 'editor', 'a board this Mac lacks changes nothing on screen');
  assert.equal(await pageView(), page, 'not even the page seen on its own');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /이 Mac에 없는 보드|board this Mac does not have/, 'and it says so');
  await personPresses('home'); await sleep(500);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(made.link + '&file=/etc/passwd')})`); await sleep(300);
  assert.equal(await evaluate('document.querySelector("#app").dataset.screen'), 'home', 'a link naming anything more opens nothing');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(made.link)})`);
  await waitFor(async () => (await pageView()) === page, 'the link to open the board from Home');
  await personPresses('page-view-close'); await sleep(300);
  assert.equal(await seq(), before, 'following links recorded nothing');
  assert.equal(await revision(), rev, 'and changed nothing');
});

check('a link that arrives while the person is asked who may edit waits for their answer, and neither closes nor answers the request', async () => {
  const link = (await agent('html', {page_id: viewId})).link;
  await personPresses('agent-disconnect'); await sleep(300);
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  await waitFor(() => evaluate(`!!document.querySelector('#modal-root .ask-dialog')`), 'the request on screen');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(link)})`); await sleep(600);
  assert.equal(await evaluate(`!!document.querySelector('#modal-root .ask-dialog')`), true, 'the request is still there');
  assert.equal(await pageView(), '', 'and the link waits');
  await personPresses('ask-decline');
  await waitFor(async () => (await pageView()) === viewId, 'the link to open once the person has answered');
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false, 'the answer was the person\'s: declined');
  await personPresses('page-view-close'); await sleep(300);
  await personPresses('agent-connect-toggle'); await sleep(250); await presses('Escape'); await sleep(5_200);
});

/* 0.3-P3-fix1 #6: what a link does when what it names is gone, when two wait, when a dialog is open, and when its board is in another workspace. */
check('a link to a page the board no longer has opens the board; of two links that wait the last opens; a link waits behind any dialog', async () => {
  const board = (await agent('contract', {})).project.project_id;
  const to = page => `aphrodite://open?board=${board}&page=${page}`;
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(to('no-such-page'))})`); await sleep(600);
  assert.equal((await agent('contract', {})).project.project_id, board, 'the board is open');
  assert.equal(await pageView(), '', 'and nothing is shown on its own');
  await personPresses('agent-disconnect'); await sleep(300);
  assert.equal((await agent('connect', {}, 'claude-code')).status, 'asked');
  await waitFor(() => evaluate(`!!document.querySelector('#modal-root .ask-dialog')`), 'the request on screen');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(to(viewId))})`);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(to(sampleId))})`); await sleep(400);
  assert.equal(await pageView(), '', 'both wait');
  await personPresses('ask-decline');
  await waitFor(async () => (await pageView()) === sampleId, 'the last link to open');
  await personPresses('page-view-close'); await sleep(300);
  await personPresses('agent-connect-toggle'); await sleep(250); await presses('Escape'); await sleep(400);
  await personPresses('export'); await sleep(500);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(to(viewId))})`); await sleep(600);
  assert.equal(await evaluate(`!!document.querySelector('#modal-root [data-export-page], #modal-root .export-tabs, #modal-root .modal-backdrop')`), true, 'the dialog stays open');
  assert.equal(await pageView(), '', 'and the link waits for it');
  await personPresses('close-modal');
  await waitFor(async () => (await pageView()) === viewId, 'the link to open once the dialog is closed');
  await personPresses('page-view-close'); await sleep(300);
  await sleep(5_200);
});

check('a link to a board in another workspace opens it in its own workspace, so saving it does not move it', async () => {
  const board = (await agent('contract', {})).project.project_id;
  const where = () => evaluate(`(() => { const lib = JSON.parse(localStorage.getItem('aphrodite-project-library-v1')); const ws = JSON.parse(localStorage.getItem('aphrodite-workspaces-v1') ?? '{}'); return {active: ws.activeId, of: lib.entries.find(e => e.project.id === ${JSON.stringify(board)})?.workspaceId ?? null}; })()`);
  const before = await where();
  await personPresses('home'); await sleep(500);
  await personClicks('ws-new'); await sleep(400);
  assert.equal(await personSubmits('#workspace-form', {name: 'Elsewhere'}), true);
  await sleep(600);
  assert.notEqual((await where()).active, before.active, 'another workspace is open');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(`aphrodite://open?board=${board}`)})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === board, 'the board to open');
  const after = await where();
  assert.equal(after.active, before.of ?? 'personal', 'its own workspace is the one open');
  assert.equal(after.of, before.of, 'and the board is where it was');
  await sleep(5_200);
});

/* 0.3-P3-fix1 #6 (Opus L8): a page seen on its own shows another page only after the person has pressed into it. */
check('a page seen on its own cannot show other pages by itself, and two pages calling each other stop after the one the person pressed', async () => {
  // Each calls the other as soon as it loads and again and again after; A also calls B a moment after a press in it
  // (after the press is over: a frame taken away under a press it is still answering stalls the test browser's input).
  const calls = (to, onPress) => `<!doctype html><body style="margin:0;height:100vh"><script>const go = () => parent.postMessage({aphrodite: 'frame', kind: 'page', id: ${JSON.stringify(to)}}, '*'); go(); ${onPress ? "document.addEventListener('click', () => setTimeout(go, 400));" : 'setInterval(go, 150);'}</script></body>`;
  // In a board of its own, so the one the other checks use keeps its pages.
  const home = (await agent('contract', {})).project.project_id;
  await personPresses('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Pages that call'}), true);
  await waitFor(async () => (await agent('contract', {})).project?.project_id !== home, 'a board of its own');
  await sleep(5_200);
  const a = await makePage('Calls B', '<p>placeholder</p>'), b = await makePage('Calls A', calls(a, false));
  const rev = (await agent('changes', {limit: 1})).revision;
  const set = await agent('apply', {reason: 'verify-pages: a page that calls another.', base_revision: rev, ops: [{op: 'html_set', page_id: a, html: calls(b, true)}]});
  assert.ok(set.ok, JSON.stringify(set).slice(0, 300));
  await sleep(5_200);
  await personPresses('page-view', {id: a});
  await sleep(1_500);
  assert.equal(await pageView(), a, 'its own calls show nothing else');
  const at = await evaluate(`(() => { const r = document.querySelector('#page-view-root iframe').getBoundingClientRect(); return {x: r.left + 100, y: r.top + 100}; })()`);
  await click(at);
  await waitFor(async () => (await pageView()) === b, 'the press inside to show the page it calls');
  await sleep(1_500);
  assert.equal(await pageView(), b, 'and the page it shows, not pressed into, shows nothing else');
  await personPresses('page-view-close'); await sleep(300);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=')} + ${JSON.stringify(home)})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === home, 'back on the board the other checks use');
  await sleep(5_200);
});

/* 0.3-P3-fix2 #9: a page seen on its own shows another page only once the person is in its frame itself, and a page
   that keeps showing pages by itself (here, itself: each showing loads it again) stops after twenty in ten seconds. */
check('a page seen on its own shows another only once its frame itself has the keys, and one that keeps doing it, however often it gets them, stops after twenty in ten seconds, saying so', async () => {
  // In a board of its own, so the one the other checks use stays under its page limit.
  const home = (await agent('contract', {})).project.project_id;
  await personPresses('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'A page that calls itself'}), true);
  await waitFor(async () => (await agent('contract', {})).project?.project_id !== home, 'a board of its own');
  await sleep(5_200);
  const made = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_page', name: 'Loop', html: '<p>loop</p>'}]});
  assert.ok(made.ok, JSON.stringify(made).slice(0, 300));
  const id = made.created_pages[0].page_id;
  const set = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_set', page_id: id, html: `<p>loop</p><script>parent.postMessage({boot: "loop"}, "*"); setInterval(() => parent.postMessage({aphrodite: "frame", kind: "page", id: ${JSON.stringify(id)}}, "*"), 100);</script>`}]});
  assert.ok(set.ok, JSON.stringify(set).slice(0, 300));
  const boots = async () => (await messages('boot')).filter(b => b === 'loop').length;
  const start = await boots();
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(made.link)})`);
  await waitFor(async () => (await boots()) > start, 'the page to start');
  await sleep(1_500);
  const settled = await boots();
  // The bar's button has the keys when the window loses them: the person is not in the page.
  await evaluate(`(() => { document.querySelector('.page-view [data-action="page-view-close"]').focus(); dispatchEvent(new Event('blur')); return true; })()`);
  await sleep(1_500);
  assert.equal(await boots(), settled, 'with the bar holding the keys the page shows nothing');
  // The frame takes the keys again and again, as presses into each page shown would: it shows itself, and stops.
  const enter = `(() => { const f = document.querySelector('.page-view iframe'); if (f) { f.focus(); dispatchEvent(new Event('blur')); } return true; })()`;
  const pump = async ms => { const until = Date.now() + ms; while (Date.now() < until) { await evaluate(enter); await sleep(120); } };
  await pump(4_000);
  const shown = (await boots()) - settled;
  assert.ok(shown >= 15 && shown <= 22, `it stopped after about twenty: ${shown}`);
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /멈췄습니다|so that stopped/, 'and says so');
  // It stays stopped past the ten seconds, however often the frame takes the keys, until the person opens a page anew.
  await pump(11_000);
  assert.equal((await boots()) - settled, shown, 'and stays stopped');
  await personPresses('page-view-close'); await sleep(300);
  await personPresses('page-view', {id}); await sleep(1_500);
  const again = await boots();
  await pump(1_500);
  assert.ok((await boots()) > again, 'opened anew and pressed into, it shows pages again');
  await personPresses('page-view-close'); await sleep(300);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=')} + ${JSON.stringify(home)})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === home, 'back on the board the other checks use');
  await sleep(5_200);
  result.hops = {shown};
});

check('a page sent as one file runs nothing and reaches nothing where it is opened, and keeps words that only look like scripts', async () => {
  const TRAP_SRC = SERVER + '/exported';
  const hostile = `<!doctype html><html><head><title>kept</title><link rel="preconnect" href="http://127.0.0.1:${TCP}"><link rel="stylesheet" href="${TRAP_SRC}/css"><meta http-equiv="refresh" content="1;url=${TRAP_SRC}/refresh"><style>@import url(${TRAP_SRC}/import);</style></head><body><h1 id="h">Exported</h1>
<script>document.title = 'ran'; fetch('${TRAP_SRC}/script')</script><img src="nothing" onerror="document.title = 'ran'; fetch('${TRAP_SRC}/onerror')"><img src="${TRAP_SRC}/img">
<a id="j" href="jav&#97;script:fetch('${TRAP_SRC}/js')">j</a><iframe srcdoc="<script>parent.document.title = 'ran'; fetch('${TRAP_SRC}/srcdoc')</script>"></iframe><svg><script>fetch('${TRAP_SRC}/svg')</script></svg>
<form action="${TRAP_SRC}/form"><button id="f">f</button></form><textarea id="t"><script>fetch('/x')</script></textarea><p id="p" title="<script>x</script>">onclick=go() is only words</p></body></html>`;
  await sleep(5_200); // the person's last press holds the screen for a moment
  const id = await makePage('Sent alone', hostile);
  await personPresses('page', {id}); await sleep(300);
  // 0.3-P3-fix2 #12: a run is recording, so each save leaves its receipt, which the check reads.
  if (!(await evaluate(`(() => { try { const r = JSON.parse(localStorage.getItem('aphrodite-assembly-latest')); return !!r && r.status !== 'ended'; } catch { return false; } })()`))) {
    await personPresses('agent'); await sleep(400);
    assert.equal(await personSubmits('#assembly-run-form', {intent: 'verify-pages: what a save records', model: 'verify-pages'}), true);
    await sleep(400);
  }
  const receipts = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-assembly-latest')).events.filter(e => e.kind === 'page:exported').map(e => e.details)`);
  const save = await downloads();
  await personPresses('export'); await sleep(600);
  assert.equal(await evaluate(`!!document.querySelector('[data-export-page] [data-export-scripts]') && !document.querySelector('[data-export-page] [data-export-scripts]').checked`), true, 'scripts are left out unless chosen');
  const file = await save('download-page-html');
  assert.equal(file.name, 'sent-alone.html');
  const html = file.bytes.toString('utf8');
  assert.ok(!/<script/i.test(html.replace(/<textarea id="t"><script>fetch\('\/x'\)<\/script><\/textarea>/, '').replace(/title="<script>x<\/script>"/, '')), 'no script element is left');
  writeFileSync(fileAt('sent-alone.html'), file.bytes);
  // UDP is not counted here: the known-limit page still on the board keeps sending its STUN, and this file has no peer connection to send any.
  const before = {hits: hits.length, tcp: connections.length};
  const opened = await openPage(`file://${fileAt('sent-alone.html')}`, {cdp: 9387, profile: '/tmp/aphrodite-pages-export-profile'});
  try {
    await sleep(2500);
    await opened.evaluate(`document.getElementById('j').click(), document.getElementById('f').click(), true`);
    await sleep(1500);
    assert.deepEqual({hits: hits.slice(before.hits), tcp: connections.length - before.tcp}, {hits: [], tcp: 0}, 'nothing reached outside');
    assert.equal(await opened.evaluate('document.title'), 'kept', 'nothing ran');
    assert.equal(await opened.evaluate('document.scripts.length'), 0);
    assert.equal(await opened.evaluate(`document.getElementById('t').value`), "<script>fetch('/x')</script>", 'the textarea says what it said');
    // An attribute whose value holds markup is one DOMPurify takes out; the words around it stay.
    assert.equal(await opened.evaluate(`document.getElementById('p').title + '|' + document.getElementById('p').textContent`), '|onclick=go() is only words');
    assert.equal(await opened.evaluate(`document.getElementById('h').textContent`), 'Exported');
    result.exported = {bytes: file.bytes.length};
  } finally { opened.close(); }
  await evaluate(`(() => { const box = document.querySelector('[data-export-scripts]'); box.click(); return true; })()`); await sleep(500);
  assert.ok(await evaluate(`!!document.querySelector('[data-export-page] .export-page-note[role="note"]')`), 'choosing the scripts says in one line where they will run');
  const withScripts = (await save('download-page-html')).bytes.toString('utf8');
  assert.equal(withScripts, '\ufeff' + hostile, 'with its scripts, the page is the one stored, and nothing more');
  // 0.3-P3-fix1 #7: the file, its record and its toast follow the choice made when Save was pressed, whatever the box says after.
  await waitFor(() => evaluate(`!document.querySelector('#toast').textContent.includes('페이지를 내보냈습니다')`), 'the earlier toasts to go', 15);
  const n = await evaluate('window.__downloads.length');
  // The box changes in the moment the file is handed over, after the page is made and before it is recorded.
  await evaluate('window.__toggleOnSave = true');
  await personPresses('download-page-html');
  await waitFor(async () => (await evaluate('window.__downloads.length')) > n, 'the download pressed with the scripts');
  await waitFor(() => evaluate(`document.querySelector('#toast').textContent.includes('페이지를 내보냈습니다')`), 'the toast');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /스크립트를 포함해 페이지를 내보냈습니다/, 'the toast says what was saved');
  assert.equal(Buffer.from(await evaluate('window.__downloads.at(-1).b64'), 'base64').toString('utf8'), '\ufeff' + hostile, 'the file is the one chosen when Save was pressed');
  const receipt = (await receipts()).at(-1);
  assert.equal(receipt?.scripts, true, `and its receipt says what was saved: ${JSON.stringify(receipt)}`);
  assert.equal(receipt?.byteLength, Buffer.from('\ufeff' + hostile).length, 'and how big');
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(300);
  // Every way into the dialog starts with the scripts left out: Export, and Ready to export on an approved board.
  // Export opens it; the first press of approve approves (the person's, no dialog); the second is Ready to export, which opens it.
  for (const [opening, opens] of [['export', true], ['approve', false], ['approve', true]]) {
    await personPresses('export'); await sleep(500);
    if (!(await evaluate(`document.querySelector('[data-export-scripts]')?.checked`))) await evaluate(`document.querySelector('[data-export-scripts]').click(), true`);
    await sleep(300);
    await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(300);
    await personPresses(opening); await sleep(600);
    assert.equal(await evaluate(`!!document.querySelector('[data-export-page]')`), opens, `${opening} ${opens ? 'opens the dialog' : 'opens no dialog'}`);
    if (!opens) continue;
    assert.equal(await evaluate(`document.querySelector('[data-export-scripts]').checked`), false, `opened by ${opening}, the dialog leaves the scripts out`);
    await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(300);
  }
  assert.equal(await evaluate('document.querySelector("#app").dataset.approval'), 'approved', 'the board was approved by the person, so Ready to export was the way in');
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
});

/** What a cleaned page must not hold, read in the browser that opened it: elements that run, load or send, and attributes that do. */
const HELD = `(() => { const bad = [], ours = m => m.hasAttribute('charset') || ['Content-Security-Policy', 'x-dns-prefetch-control'].includes(m.getAttribute('http-equiv'));
  for (const e of document.querySelectorAll('*')) { const n = e.localName.toLowerCase();
    if (['script', 'link', 'template', 'iframe', 'frame', 'object', 'embed', 'base', 'animate', 'set', 'animatetransform', 'animatemotion', 'foreignobject', 'math', 'noscript'].includes(n) || (n === 'meta' && !ours(e))) bad.push(n);
    for (const a of e.attributes) { const name = a.name.toLowerCase();
      if (name.startsWith('on') || ['action', 'formaction', 'srcdoc', 'ping', 'srcset'].includes(name) || /javascript:/i.test(a.value)) bad.push(n + '@' + name);
      if ((name === 'href' || name === 'xlink:href') && n !== 'a' && !a.value.startsWith('#')) bad.push(n + '@' + name); } }
  return bad; })()`;

/* 0.3-P3-fix1 #1: the input review's pages and the others, each cleaned by the app's own export code in Chrome and
   opened from disk: cleaned, none reaches the recording servers or leaves for another address; sent with its scripts,
   each that a browser sets off on opening does (QUIET lists those that need a press), so the probe is alive. */
/* 0.3-P3-fix2 #10: a page sent as a file shows what the board shows. */
check('a page sent as a file shows what the board shows: the board\'s doctype, each board file where the board puts it, a carriage return kept, and a video left behind loading nothing', async () => {
  await sleep(5_200);
  const contract = await agent('contract', {});
  const shot = contract.pages.find(p => dropped.includes(p.page_id) && p.media.mime === 'image/png').media.src;
  const video = contract.pages.find(p => dropped.includes(p.page_id) && p.media.mime.startsWith('video/')).media.src;
  // 0.3-P3-fix3 #3: the same hash spelt with a character reference for its colon is words on the board, and a hash
  // followed by a hex digit spelt as a character reference is an address there: the files do as the board does.
  const hash = shot.slice('media:'.length);
  const page = `<p id="w">The file ${shot} in words.</p><img id="i" src="${shot}"><video id="v" src="${video}"></video><pre id="cr">A&#13;B</pre><p id="enc">media&#58;${hash}</p><p id="opp">${shot}&#97;</p><script>window.said = '${shot}';</script>`;
  // In a board of its own, so the one the other checks use stays under its page limit; board files are this Mac's, whichever board names them.
  const home = contract.project.project_id;
  await personPresses('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Sent as the board shows it'}), true);
  await waitFor(async () => (await agent('contract', {})).project?.project_id !== home, 'a board of its own');
  await sleep(5_200);
  const id = await makePage('Sent as the board shows it', page);
  await personPresses('page', {id}); await sleep(300);
  const save = await downloads();
  await personPresses('export'); await sleep(800);
  await evaluate(`(() => { if (document.querySelector('[data-export-scripts]').checked) document.querySelector('[data-export-scripts]').click(); document.querySelector('[name="export-videos"][value="out"]').click(); return true; })()`); await sleep(300);
  const cleaned = (await save('download-page-html')).bytes.toString('utf8');
  await evaluate(`document.querySelector('[data-export-scripts]').click(), true`); await sleep(500);
  const withScripts = (await save('download-page-html')).bytes.toString('utf8');
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(300);
  const data = /src="(data:image\/png;base64,[^"]+)"/.exec(withScripts)?.[1];
  assert.ok(data, 'the picture went in');
  assert.equal(withScripts, '\ufeff<!doctype html>' + page.replaceAll(shot, data), 'with its scripts: the board\'s doctype, the picture at every place it is said, the video named as it was, and nothing else');
  assert.equal(cleaned.split(data).length - 1, 3, 'cleaned: the picture in its address and in the words, as on the board');
  writeFileSync(fileAt('as-the-board.html'), cleaned);
  writeFileSync(fileAt('as-the-board-scripts.html'), withScripts);
  for (const [name, scripts] of [['as-the-board.html', false], ['as-the-board-scripts.html', true]]) {
    const opened = await openPage(`file://${fileAt(name)}`, {cdp: 9387, profile: `/tmp/aphrodite-pages-as-board-${scripts ? 'scripts' : 'cleaned'}`});
    try {
      await sleep(1_500);
      assert.equal(await opened.evaluate('document.compatMode'), 'CSS1Compat', `${name}: in standards mode, as on the board`);
      // Cleaned, a carriage return is written as the newline any parser reads it back as; with its scripts the page is as stored, and reads as on the board.
      assert.equal(await opened.evaluate(`document.getElementById('cr').textContent`), scripts ? 'A\rB' : 'A\nB', `${name}: the carriage return, not refused`);
      assert.equal(await opened.evaluate(`document.getElementById('v').getAttribute('src')`), video, `${name}: the video left behind keeps its name`);
      assert.equal(await opened.evaluate(`document.getElementById('enc').textContent`), `media:${hash}`, `${name}: a hash whose colon is a character reference stays words, as on the board`);
      assert.equal(await opened.evaluate(`document.getElementById('opp').textContent`), data + 'a', `${name}: a hash with a hex digit after it as a character reference is put in, as on the board`);
      assert.deepEqual(await opened.evaluate(`performance.getEntriesByType('resource').map(e => e.name)`), [], `${name}: and nothing is requested for it`);
      if (scripts) assert.equal(await opened.evaluate('window.said'), data, 'the script string holds the picture, as on the board');
    } finally { opened.close(); }
    await sleep(1_000);
  }
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=')} + ${JSON.stringify(home)})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === home, 'back on the board the other checks use');
  await sleep(5_200);
});

check('every page built to slip past the cleaner reaches nothing once cleaned, where the same page with its scripts reaches out', async () => {
  const pages = vectors(TRAP, TCP);
  const bundle = await build({stdin: {contents: "import {exportPage} from './src/page-export.ts'; const host = {stat: async () => undefined, read: async () => undefined}; window.exportPage = (src, scripts) => exportPage(src, {scripts, videos: 'out'}, host).then(r => r.html, e => 'refused: ' + e.message);", resolveDir: process.cwd(), loader: 'ts'}, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent'});
  writeFileSync(fileAt('cleaner.html'), '<!doctype html><meta charset=utf-8><script>' + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>');
  const cleaner = await openPage(`file://${fileAt('cleaner.html')}`, {cdp: 9389, profile: '/tmp/aphrodite-pages-cleaner-profile'});
  const made = [];
  try {
    await waitFor(() => cleaner.evaluate('typeof window.exportPage === "function"'), 'the export code');
    for (const [name, page] of Object.entries(pages)) for (const scripts of [false, true]) {
      const id = `${name}--${scripts ? 'S' : 'C'}`;
      const html = await cleaner.evaluate(`exportPage(${JSON.stringify('<!doctype html><html><head><title>t</title></head><body>' + page(id) + '</body></html>')}, ${scripts})`);
      assert.ok(!html.startsWith('refused: '), `${id}: ${html}`);
      writeFileSync(fileAt(`${id}.html`), '\ufeff' + html);
      made.push(id);
    }
  } finally { cleaner.close(); }
  const viewer = await openPage('about:blank', {cdp: 9390, profile: '/tmp/aphrodite-pages-viewer-profile'});
  const reached = {}, held = {}, left = {}, starts = [];
  // 0.3-P3-fix2 #12: each input's requests carry its name, and are counted by it, however late they come; a raw
  // connection carries nothing, so it is counted in the time from its input's opening to the next one's.
  const h0 = hits.length;
  try {
    for (const id of made) {
      starts.push({id, t0: Date.now()});
      await viewer.send('Page.navigate', {url: `file://${fileAt(`${id}.html`)}`});
      await sleep(1_200);
      left[id] = !(await viewer.evaluate('location.href')).startsWith('file:');
      if (left[id]) { await viewer.send('Page.navigate', {url: 'about:blank'}); continue; }
      // A quiet page proves nothing for a probe that needs a press, so what the cleaned page still holds is read too.
      if (id.endsWith('--C')) held[id] = await viewer.evaluate(HELD);
    }
    // Time for a late request to land, still counted on its own input.
    await sleep(4_000);
  } finally { viewer.close(); }
  const end = Date.now(), mine = hits.slice(h0);
  // An input's name, perhaps with more after a dash (css-import--S-bg); ids end in --C or --S, so none is another's start.
  const named = (url, id) => new RegExp(`/${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(url);
  // The browser asks for /favicon.ico itself when a page has taken the whole tab to the server, which is counted as leaving.
  assert.deepEqual(mine.filter(h => h.url !== '/favicon.ico' && !made.some(id => named(h.url ?? '', id))).map(h => h.url), [], 'every request names the input it came from');
  for (const [i, {id, t0}] of starts.entries()) {
    const t1 = starts[i + 1]?.t0 ?? end;
    reached[id] = mine.filter(h => named(h.url ?? '', id)).length + connections.filter(t => t >= t0 && t < t1).length + (left[id] ? 1 : 0);
  }
  result.cleaner = {pages: Object.keys(pages).length, cleanedReached: Object.entries(reached).filter(([id, n]) => id.endsWith('--C') && n).map(([id]) => id), controlsAlive: Object.entries(reached).filter(([id, n]) => id.endsWith('--S') && n).length};
  assert.deepEqual(result.cleaner.cleanedReached, [], 'a cleaned page reached out');
  assert.deepEqual(Object.entries(held).filter(([, bad]) => bad.length), [], 'nothing that runs, loads or sends is left in a cleaned page');
  const dead = Object.keys(pages).filter(name => !QUIET.includes(name) && !reached[`${name}--S`]);
  assert.deepEqual(dead, [], 'each probe reaches out with its scripts, so a quiet cleaned page means something');
});

/* 0.3-P3-fix1 #1: the handoff zip writes an html page through the same cleaning, in the app (tests/export-uploads.test.ts). */
check('the handoff zip carries an html page cleaned, and opened from disk it reaches nothing', async () => {
  // The page sent alone above, still on the board: a script, words that look like one, and its media.
  const save = await downloads();
  const zip = await save('download-bundle');
  const files = unzipSync(new Uint8Array(zip.bytes));
  const [name, bytes] = Object.entries(files).find(([, b]) => Buffer.from(b).toString('utf8').includes('<h1 id="h">Exported</h1>')) ?? [];
  result.handoff = Object.entries(files).filter(([n, b]) => n.endsWith('.html') && Buffer.from(b).toString('utf8').includes('reads differently once cleaned')).map(([n]) => n);
  assert.deepEqual(result.handoff, [], 'every page on this board goes out cleaned; none is refused');
  assert.ok(name, `the page is in the zip: ${Object.keys(files).join(', ')}`);
  const html = Buffer.from(bytes).toString('utf8');
  assert.ok(html.startsWith('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"'), html.slice(0, 200));
  assert.ok(!/<script/i.test(html.replace(/<textarea id="t">&lt;script&gt;/, '')), 'no script is left');
  writeFileSync(fileAt('handed-off.html'), bytes);
  const h = hits.length;
  const opened = await openPage(`file://${fileAt('handed-off.html')}`, {cdp: 9393, profile: '/tmp/aphrodite-pages-handoff-profile'});
  try { await sleep(1_500); assert.equal(await opened.evaluate('document.getElementById("h").textContent'), 'Exported'); } finally { opened.close(); }
  assert.deepEqual(hits.slice(h), [], 'nothing was reached');
});

/* 0.3-P3-fix2 #12: a handoff of several pages, one of which the cleaner refuses: that one goes as a page saying why,
   the others cleaned, and opened from disk none reaches anything, over HTTP or a raw connection. */
check('a handoff of several pages carries each one cleaned, and one the cleaner refuses as a page saying why; opened from disk none reaches anything', async () => {
  const home = (await agent('contract', {})).project.project_id;
  await personPresses('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Handed off'}), true);
  await waitFor(async () => (await agent('contract', {})).project?.project_id !== home, 'a board of its own');
  await sleep(5_200);
  await makePage('Plain', '<h1 id="plain">Plain</h1><p>Only words.</p>');
  await makePage('Reaches', `<h1 id="reaches">Reaches</h1><link rel="preconnect" href="http://127.0.0.1:${TCP}"><img src="${SERVER}/handoff/img"><script>fetch('${SERVER}/handoff/script')</script>`);
  // Two forms nested by the parser: written out, a second reading drops the inner one, so the cleaner refuses the page.
  await makePage('Nested forms', '<form><div></form><form><input name="q"></form></div><p>after</p>');
  await sleep(5_200);
  const save = await downloads();
  const zip = await save('download-bundle');
  const files = unzipSync(new Uint8Array(zip.bytes));
  const text = name => Buffer.from(files[name]).toString('utf8');
  const pages = Object.keys(files).filter(n => n.endsWith('.html'));
  const refused = pages.filter(n => text(n).includes('reads differently once cleaned'));
  assert.equal(refused.length, 1, `one page refused: ${refused}`);
  assert.match(text(refused[0]), /<p>Nested forms: the page reads differently once cleaned/, 'and it says which page and why');
  for (const [id, words] of [['plain', 'Plain'], ['reaches', 'Reaches']]) {
    const name = pages.find(n => text(n).includes(`<h1 id="${id}">${words}</h1>`));
    assert.ok(name, `${words} is in the zip`);
    assert.ok(text(name).startsWith('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"'), `${words} goes cleaned`);
  }
  const dir = fileAt('handoff-many');
  mkdirSync(dir, {recursive: true});
  for (const [name, bytes] of Object.entries(files)) { mkdirSync(join(dir, name, '..'), {recursive: true}); writeFileSync(join(dir, name), bytes); }
  const before = {hits: hits.length, tcp: connections.length};
  const viewer = await openPage('about:blank', {cdp: 9393, profile: '/tmp/aphrodite-pages-handoff-many-profile'});
  try {
    for (const name of pages) { await viewer.send('Page.navigate', {url: `file://${join(dir, name)}`}); await sleep(1_200); }
    await sleep(2_000);
  } finally { viewer.close(); }
  assert.deepEqual({hits: hits.slice(before.hits), tcp: connections.length - before.tcp}, {hits: [], tcp: 0}, 'nothing was reached, over HTTP or a raw connection');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=')} + ${JSON.stringify(home)})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === home, 'back on the board the other checks use');
  await sleep(5_200);
});

/* 0.3-P3-fix1 #1: cleaning keeps an ordinary page: the same words as with its scripts, its styles, its drawing's
   own parts and an id a link goes to. MathML is the one thing it loses, and the export dialog says so. */
check('an ordinary page goes out cleaned reading the same as with its scripts, and loses only its MathML and the attributes said to go', async () => {
  const wrap = body => '<!doctype html><html><head><title>o</title></head><body>' + body + '</body></html>';
  const pages = {...Object.fromEntries(Object.entries(ORDINARY).map(([k, body]) => [k, wrap(body)])), ...ORDINARY_DOCUMENTS, ...Object.fromEntries(Object.entries(LOSSES).map(([k, [body]]) => [k, wrap(body)])), ...Object.fromEntries(Object.entries({...KEPT_ATTRIBUTES, ...LOST_ATTRIBUTES}).map(([k, [body]]) => [k, wrap(body)]))};
  const cleaner = await openPage(`file://${fileAt('cleaner.html')}`, {cdp: 9391, profile: '/tmp/aphrodite-pages-cleaner-profile'});
  try {
    await waitFor(() => cleaner.evaluate('typeof window.exportPage === "function"'), 'the export code');
    for (const [name, page] of Object.entries(pages)) for (const scripts of [false, true]) {
      const html = await cleaner.evaluate(`exportPage(${JSON.stringify(page)}, ${scripts})`);
      assert.ok(!html.startsWith('refused: '), `${name}: ${html}`);
      writeFileSync(fileAt(`ordinary-${name}--${scripts ? 'S' : 'C'}.html`), html);
    }
  } finally { cleaner.close(); }
  const viewer = await openPage('about:blank', {cdp: 9392, profile: '/tmp/aphrodite-pages-viewer-profile'});
  const read = async (name, scripts) => { await viewer.send('Page.navigate', {url: `file://${fileAt(`ordinary-${name}--${scripts ? 'S' : 'C'}.html`)}`}); await sleep(400); return viewer.evaluate(`({text: document.body.innerText, all: document.body.textContent, lang: document.documentElement.lang, body: document.body.className, title: !!document.getElementById('title'), titleColor: document.getElementById('title') && getComputedStyle(document.getElementById('title')).color, card: document.querySelector('.card') && getComputedStyle(document.querySelector('.card')).padding, use: document.querySelector('use')?.getAttribute('href') ?? null, pre: document.querySelector('pre')?.textContent ?? null})`); };
  try {
    for (const name of [...Object.keys(ORDINARY), ...Object.keys(ORDINARY_DOCUMENTS)]) {
      const [kept, stored] = [await read(name, false), await read(name, true)];
      assert.deepEqual(kept, stored, `${name} reads the same cleaned`);
    }
    for (const [name, [, lost]] of Object.entries(LOSSES)) {
      const [kept, stored] = [await read(name, false), await read(name, true)];
      assert.ok(stored.all.replace(/\s/g, '').includes(lost) && !kept.all.replace(/\s/g, '').includes(lost), `${name}: ${lost} is the loss: ${JSON.stringify([kept.all, stored.all])}`);
      assert.equal(kept.all.replace(/\s/g, ''), stored.all.replace(/\s/g, '').replace(lost, ''), `${name} loses only that`);
    }
    // 0.3-P3-fix2 O-3: an attribute kept is kept as written; one said to go is there with the scripts and gone without.
    const attribute = async (name, scripts, selector, attr) => { await viewer.send('Page.navigate', {url: `file://${fileAt(`ordinary-${name}--${scripts ? 'S' : 'C'}.html`)}`}); await sleep(300); return viewer.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(attr)}) ?? null`); };
    for (const [name, [, selector, attr]] of Object.entries(KEPT_ATTRIBUTES)) {
      const stored = await attribute(name, true, selector, attr);
      assert.ok(stored !== null, `${name}: the page has it`);
      assert.equal(await attribute(name, false, selector, attr), stored, `${name}: kept without the scripts`);
    }
    for (const [name, [, selector, attr]] of Object.entries(LOST_ATTRIBUTES)) {
      assert.ok((await attribute(name, true, selector, attr)) !== null, `${name}: the page has it`);
      assert.equal(await attribute(name, false, selector, attr), null, `${name}: said to go, and gone`);
    }
  } finally { viewer.close(); }
});

check('a page sent with its video beside it is a zip of the page and the video, and the video plays from the folder under the page\'s policy', async () => {
  const video = result.dropped.find(m => m.mime.startsWith('video/'));
  assert.ok(video, 'the video dropped earlier');
  await sleep(5_200);
  const id = await makePage('Sent with its video', `<h1>Clip</h1><video id="v" src="${video.src}" controls muted playsinline></video>`);
  await personPresses('page', {id}); await sleep(300);
  const save = await downloads();
  await personPresses('export'); await sleep(600);
  // The choice must be there and shown: an element that is missing is not a choice shown.
  await waitFor(() => evaluate(`document.querySelector('[data-export-videos]')?.hidden === false && document.querySelectorAll('[data-export-videos] [name="export-videos"]').length === 2`), 'the videos choice, for a page with a video');
  const zip = await save('download-page-html');
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
  assert.equal(zip.name, 'sent-with-its-video.zip');
  const files = unzipSync(new Uint8Array(zip.bytes));
  const sha = video.src.slice('media:'.length), ext = video.mime === 'video/mp4' ? 'mp4' : 'webm';
  assert.deepEqual(Object.keys(files).sort(), ['media/' + sha + '.' + ext, 'sent-with-its-video.html']);
  const folder = join(filesDir, 'sent-with-its-video');
  mkdirSync(join(folder, 'media'), {recursive: true});
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(folder, name), bytes);
  const opened = await openPage(`file://${join(folder, 'sent-with-its-video.html')}`, {cdp: 9388, profile: '/tmp/aphrodite-pages-video-profile'});
  try {
    await sleep(1500);
    const played = await opened.evaluate(`(async () => { const v = document.getElementById('v'); try { await v.play(); } catch (e) { return {error: String(e), code: v.error && v.error.code}; } await new Promise(r => setTimeout(r, 800)); return {ready: v.readyState, time: v.currentTime > 0, code: v.error && v.error.code}; })()`);
    assert.deepEqual(played, {ready: 4, time: true, code: null}, JSON.stringify(played));
  } finally { opened.close(); }
});

check('a board saved as a board file opens again as a new board, its pages running, its history someone else\'s, and no approval with it', async () => {
  await personPresses('page', {id: viewId}); await sleep(300);
  await personPresses('export'); await sleep(600);
  if (await evaluate(`!!document.querySelector('[data-action="approve-export"]')`)) { await personPresses('approve-export'); await sleep(400); }
  assert.equal(await evaluate('document.querySelector("#app").dataset.approval'), 'approved', 'the board sent is approved here');
  const save = await downloads();
  const board = await save('download-board-file');
  assert.ok(board.name.endsWith(`.${BOARD_FILE.extension}`), board.name);
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
  const sent = await agent('contract', {});
  const sentFile = `sent.${BOARD_FILE.extension}`;
  writeFileSync(fileAt(sentFile), board.bytes);
  const lib = JSON.parse(await evaluate(`localStorage.getItem('aphrodite-project-library-v1')`));
  const boots = (await messages('boot')).filter(b => b === 'alone').length;
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project'); await sleep(500);
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(sentFile)]});
  await waitFor(async () => (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`)) > lib.entries.length, 'the board to open', 30);
  await sleep(1000);
  const got = await agent('contract', {});
  assert.notEqual(got.project.project_id, sent.project.project_id, 'a new board');
  assert.deepEqual(got.pages.map(p => [p.page_id, p.name, p.kind ?? null]), sent.pages.map(p => [p.page_id, p.name, p.kind ?? null]), 'the same pages');
  assert.equal(await evaluate('document.querySelector("#app").dataset.approval'), 'draft', 'nothing in it is approved here');
  const {changes} = await agent('changes', {limit: 3, include_view: true});
  assert.ok(changes.length && changes.every(c => c.author.elsewhere === true), `every change in it was made elsewhere: ${JSON.stringify(changes.map(c => c.author))}`);
  await personPresses('zoom-fit'); await sleep(500);
  await waitFor(async () => (await messages('boot')).filter(b => b === 'alone').length > boots, 'its page to start on the new board', 30);
  result.board = {bytes: board.bytes.length, pages: got.pages.length};
});

/* 0.3-P3-fix1 #3: leaving a board by a link or by opening a board file saves what the person was typing first. */
/* 0.3-P3-fix1 #5 (Opus L5): a board file that comes while the person is asked who may edit waits for their answer, as a link does. */
check('a board file that comes while the person is asked who may edit waits for their answer, and the request stays', async () => {
  const count = async () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`);
  const before = await count();
  await personPresses('agent-disconnect'); await sleep(300);
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  await waitFor(() => evaluate(`!!document.querySelector('#modal-root .ask-dialog')`), 'the request on screen');
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project');
  await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker');
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(`sent.${BOARD_FILE.extension}`)]});
  await sleep(2_000);
  assert.equal(await evaluate(`!!document.querySelector('#modal-root .ask-dialog')`), true, 'the request is still there');
  assert.equal(await count(), before, 'and the board waits');
  await personPresses('ask-decline');
  await waitFor(async () => (await count()) > before, 'the board to open once the person has answered', 30);
  await personPresses('agent-connect-toggle'); await sleep(250); await presses('Escape'); await sleep(5_200);
});

/* 0.3-P3-fix2 #8: what comes in waits for dialogs that come up while it is on its way, a newer link wins over an older one
   still on its way, and a link to a page the open board no longer has shows the board. */
check('a board file waits for the request to edit that comes up while it is on its way, and never closes or answers it', async () => {
  const board = (await agent('contract', {})).project.project_id;
  const count = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`);
  await personPresses('agent-disconnect'); await sleep(300);
  // A board file whose leaving is held (the editor takes no input then); an agent asks to edit meanwhile.
  await sleep(5_200);
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project');
  await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker');
  await evaluate('window.aphroditeHoldWrites(true), true');
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  const before = await count();
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(`sent.${BOARD_FILE.extension}`)]});
  await sleep(800);
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  await waitFor(() => evaluate(`!!document.querySelector('#modal-root .ask-dialog')`), 'the request on screen');
  await evaluate('window.aphroditeHoldWrites(false), true');
  await sleep(2_000);
  assert.equal(await evaluate(`!!document.querySelector('#modal-root .ask-dialog')`), true, 'the request is still there');
  assert.equal((await agent('contract', {})).project.project_id, board, 'and the board waits behind it');
  await personPresses('ask-decline');
  await waitFor(async () => (await count()) > before && (await agent('contract', {})).project.project_id !== board, 'the board to open once the person has answered', 30);
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false, 'the answer was the person\'s: declined');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + board)})`);
  await waitFor(async () => (await agent('contract', {})).project.project_id === board, 'back on the board');
  await sleep(5_200);
  await personPresses('agent-connect-toggle'); await sleep(250); await presses('Escape'); await sleep(5_200);
});

check('of two links on their way, only the newer opens, and a link to a missing page on the open board shows the board', async () => {
  const board = (await agent('contract', {})).project.project_id;
  // An older link held on its way, then a newer one: only the newer opens.
  const pages = (await agent('contract', {})).pages.map(p => p.page_id);
  await sleep(5_200);
  // Every page shown on its own while the two links go is noted, so an older one that opened for a moment is seen.
  await evaluate(`(() => { window.__views = []; new MutationObserver(() => window.__views.push(document.querySelector('#app').dataset.pageView)).observe(document.querySelector('#app'), {attributes: true, attributeFilter: ['data-page-view']}); return true; })()`);
  await evaluate('window.aphroditeHoldWrites(true), true');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(`aphrodite://open?board=${board}&page=${pages[1]}`)})`); await sleep(400);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(`aphrodite://open?board=${board}&page=${pages[2]}`)})`); await sleep(400);
  await evaluate('window.aphroditeHoldWrites(false), true');
  await waitFor(async () => (await pageView()) === pages[2], 'the newer link to show its page');
  await sleep(1_000);
  assert.equal(await pageView(), pages[2]);
  assert.ok(!(await evaluate('window.__views')).includes(pages[1]), 'the older one opened nothing, not even for a moment');
  // A link to a page the open board does not have: the page seen on its own closes and the board shows.
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(`aphrodite://open?board=${board}&page=gone`)})`);
  await waitFor(async () => (await pageView()) === '', 'the board to show');
  assert.equal((await agent('contract', {})).project.project_id, board);
  await sleep(5_200);
});

check('what the person was typing is kept when a link or a board file takes them to another board', async () => {
  const here = (await agent('contract', {})).project.project_id;
  const link = id => `aphrodite://open?board=${id}`;
  const lib = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => e.project.id)`);
  const other = (await lib()).find(id => id !== here);
  assert.ok(other, 'another board to go to');
  await sleep(5_200);
  const typed = await typeIntoTitle(' 링크 전');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(link(other))})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === other, 'the other board');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(link(here))})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === here, 'back on the first board');
  assert.match(await titleOf(typed) ?? '', / 링크 전$/, 'kept across a link');
  const since = await seq();
  const typedAgain = await typeIntoTitle(' 파일 전');
  const count = (await lib()).length;
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project');
  await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker');
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(`sent.${BOARD_FILE.extension}`)]});
  await waitFor(async () => (await lib()).length > count, 'the board file to open', 30);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify(link(here))})`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === here, 'back on the first board');
  assert.match(await titleOf(typedAgain) ?? '', / 파일 전$/, 'kept across a board file');
  const {changes} = await agent('changes', {since, limit: 20});
  assert.ok(changes.some(c => c.author.kind === 'person' && !c.author.elsewhere && JSON.stringify(c.ops).includes(' 파일 전')), `as the person's own change: ${JSON.stringify(changes.map(c => [c.author, c.source, JSON.stringify(c.ops).slice(0, 120)]))}`);
});

/* 0.3-P3-fix2 #2: while a board is being left, the editor takes no input: the store's write is held here (the browser
   build's check handle), each way off the board started, and a word typed into the title then. Once the write lands,
   the board left has what was typed before leaving, as the person's own change, nothing typed after, and the
   workspace it was in. */
check('while a board is being left nothing can be typed into it, and what was typed before is kept, in its own workspace', async () => {
  const lib = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => ({id: e.project.id, ws: e.workspaceId ?? null}))`);
  const here = (await agent('contract', {})).project.project_id;
  const wsOf = async id => (await lib()).find(e => e.id === id)?.ws;
  const homeWs = await wsOf(here);
  const back = async () => { await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + here)})`); await waitFor(async () => (await agent('contract', {})).project?.project_id === here, 'back on the board'); await sleep(800); };
  // A board in another workspace to go to.
  await personPresses('home'); await sleep(500);
  await personClicks('ws-new'); await sleep(400);
  assert.equal(await personSubmits('#workspace-form', {name: 'Far'}), true); await sleep(600);
  await personPresses('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Far board'}), true);
  await waitFor(async () => (await agent('contract', {})).project?.project_id !== here, 'the far board');
  const far = (await agent('contract', {})).project.project_id;
  await back();
  const tryToType = async word => {
    const focused = await evaluate(`(() => { const t = document.querySelector('[data-field="title"]'); if (!t) return false; t.focus(); return document.activeElement === t; })()`);
    await send('Input.insertText', {text: word});
    return focused;
  };
  // Each way: what it does before the board is left (the picker opens, saving what is typed so far), then what leaves.
  const ways = [
    ['Home', null, () => personPresses('home')],
    ['a link to a board in another workspace', null, () => evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + far)}), true`)],
    ['a board file', async () => { await send('Page.setInterceptFileChooserDialog', {enabled: true}); await personPresses('import-project'); await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker'); }, async () => { const {root} = (await send('DOM.getDocument', {depth: 0})).result; const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result; await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(`sent.${BOARD_FILE.extension}`)]}); }],
    // 0.3-P3-fix3 #10: the ways off a board no check went through.
    ['a project file (.json)', async () => { await send('Page.setInterceptFileChooserDialog', {enabled: true}); await personPresses('import-project'); await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker'); }, async () => { const {root} = (await send('DOM.getDocument', {depth: 0})).result; const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result; await send('DOM.setFileInputFiles', {nodeId, files: [fileAt('a-project.json')]}); }],
    ['a new board', async () => { await personPresses('new-project'); await waitFor(() => evaluate('!!document.querySelector("#new-project-form")'), 'the new board form'); }, () => personSubmits('#new-project-form', {name: 'Made while leaving'})],
    ['the welcome sample', async () => { await evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'welcome-sample'; b.id = 'check-welcome-sample'; b.textContent = 'sample'; b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999'; document.querySelector('#app').append(b); return true; })()`); }, async () => { await personPresses('welcome-sample'); await evaluate(`document.getElementById('check-welcome-sample')?.remove(), true`); }],
  ];
  writeFileSync(fileAt('a-project.json'), await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.find(e => e.project.id === ${JSON.stringify(far)}).project)`));
  for (const [n, [way, prepare, go]] of ways.entries()) {
    await sleep(5_200);
    const before = await seq();
    const typed = await typeIntoTitle(' 떠나기 전 ' + n);
    if (prepare) { await prepare(); await evaluate(`(() => { const t = document.querySelector('[data-field="title"]'); t.focus(); return true; })()`); }
    await evaluate('window.aphroditeHoldWrites(true), true');
    await go();
    await sleep(600);
    const late = await tryToType(' 늦게 ' + n);
    await evaluate('window.aphroditeHoldWrites(false), true');
    await sleep(1_500);
    assert.notEqual((await agent('contract', {})).project?.project_id ?? 'home', here, way + ': it did leave the board');
    assert.equal(late, false, way + ': the title takes no focus while the board is left');
    await back();
    const title = await titleOf(typed) ?? '';
    assert.ok(title.endsWith(' 떠나기 전 ' + n), way + ': what was typed before leaving is kept (' + title + ')');
    assert.ok(!title.includes('늦게'), way + ': nothing typed while leaving went in');
    const {changes} = await agent('changes', {since: before, limit: 20});
    assert.ok(changes.some(c => c.author.kind === 'person' && !c.author.elsewhere && JSON.stringify(c.ops).includes(' 떠나기 전 ' + n)), way + ": as the person's own change");
    assert.equal(await wsOf(here), homeWs, way + ': the board is still in its own workspace');
  }
  // From Home, opening a board from its card goes through the same leaving: nothing takes input until it is open.
  await sleep(5_200);
  await personPresses('home'); await sleep(600);
  await evaluate('window.aphroditeHoldWrites(true), true');
  await personPresses('hub-open', {id: here}); await sleep(600);
  const inertWhile = await evaluate('document.querySelector("#app").inert');
  await evaluate('window.aphroditeHoldWrites(false), true');
  await waitFor(async () => (await agent('contract', {})).project?.project_id === here, 'the board opened from its card');
  assert.equal(inertWhile, true, 'opening from a card: nothing takes input while it is under way');
  assert.equal(await evaluate('document.querySelector("#app").inert'), false, 'and everything does once it is open');
  await sleep(5_200);
});

/* 0.3-P3-fix3 #7: a board file dropped on the board opens as a board, in the line of what comes in, not as a picture. */
check('a board file dropped on the board opens as a new board, and nothing is added to the board it was dropped on', async () => {
  const here = (await agent('contract', {})).project.project_id;
  const count = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`);
  const before = await count(), since = await seq();
  await sleep(5_200);
  const at = await evaluate(`(() => { const r = document.querySelector('#canvas-scroll').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
  await dropFiles([`sent.${BOARD_FILE.extension}`], at);
  await waitFor(async () => (await count()) > before, 'the dropped board to open', 30);
  const {changes} = await agent('changes', {since, limit: 20});
  assert.deepEqual(changes.filter(c => c.source === 'media:drop').map(c => c.source), [], 'nothing was added as a picture');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + here)}), true`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === here, 'back on the board');
  const {changes: there} = await agent('changes', {since, limit: 20});
  assert.deepEqual(there.filter(c => c.source === 'media:drop'), [], 'and nothing on the board it was dropped on');
  await sleep(5_200);
});

/* 0.3-P3-fix3 #10 (fix2 #5): a received board's history undoes and redoes, its recorded passages read back as sent. */
check('on a board received as a file, its words as sent: a step made on them is undone and redone with ⌘Z and ⌘⇧Z, a hash in them and all', async () => {
  const home = (await agent('contract', {})).project.project_id;
  await personPresses('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'History that travels'}), true);
  await waitFor(async () => (await agent('contract', {})).project?.project_id !== home, 'a board of its own');
  await sleep(5_200);
  const hash = 'c'.repeat(64);
  const id = await makePage('Words with a hash', `<p id="w">The file media:${hash} is named here, before.</p>`);
  const changed = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_replace', page_id: id, find: 'before', replace: 'after'}]});
  assert.ok(changed.ok, JSON.stringify(changed).slice(0, 300));
  await sleep(5_200);
  const save = await downloads();
  await personPresses('export'); await sleep(600);
  const file = await save('download-board-file');
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(300);
  writeFileSync(fileAt(`history.${BOARD_FILE.extension}`), file.bytes);
  const count = await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`);
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project');
  await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker');
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(`history.${BOARD_FILE.extension}`)]});
  await waitFor(async () => (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`)) > count, 'the received board', 30);
  await sleep(1_500);
  const html = async () => (await agent('html', {page_id: id})).html;
  assert.match(await html(), /media:c{64} is named here, after/, 'it came with the change');
  // The undo stack is this window's (src/ledger/session.ts): what came with the board is history, not steps. A step
  // made on the received words is undone and redone through the passage's hash, as sent.
  await sleep(5_200);
  const again = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_replace', page_id: id, find: 'here, after', replace: 'here, once more'}]});
  assert.ok(again.ok, JSON.stringify(again).slice(0, 300));
  await sleep(5_200);
  await presses('z', 4); await sleep(800);
  assert.match(await html(), /media:c{64} is named here, after/, '⌘Z takes the step back, its passage read as received');
  await presses('z', 4 | 8); await sleep(800);
  assert.match(await html(), /media:c{64} is named here, once more/, '⌘⇧Z puts it again');
  assert.doesNotMatch(await evaluate(`document.querySelector('#toast').textContent`), /no longer fits|맞지 않아/, 'no step was skipped');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + home)}), true`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === home, 'back on the board');
  await sleep(5_200);
});

/* 0.3-P3-fix4: a workspace store that refuses leaves the board and the workspace as they were. */
check('a link to a board in another workspace, when the workspaces cannot be stored, leaves the board and the workspace as they were', async () => {
  const lib = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => ({id: e.project.id, ws: e.workspaceId ?? 'default'}))`);
  const here = (await agent('contract', {})).project.project_id;
  const mine = (await lib()).find(e => e.id === here).ws;
  const far = (await lib()).find(e => e.ws !== mine);
  assert.ok(far, 'a board in another workspace');
  const active = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-workspaces-v1') ?? '{}').activeId ?? null`);
  const before = await active();
  await sleep(5_200);
  await evaluate(`(() => { const set = Storage.prototype.setItem; window.__restoreSetItem = () => { Storage.prototype.setItem = set; }; Storage.prototype.setItem = function (k, v) { if (k === 'aphrodite-workspaces-v1') throw new Error('quota'); return set.call(this, k, v); }; return true; })()`);
  try {
    await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + far.id)}), true`);
    await sleep(2_000);
    assert.equal((await agent('contract', {})).project.project_id, here, 'the board is the one it was');
    assert.equal(await active(), before, 'and the workspace stored');
  } finally { await evaluate('window.__restoreSetItem(), true'); }
  // The workspace the screen holds is the one it was too: an edit saved now keeps the board where it was.
  await sleep(5_200);
  await typeIntoTitle(' 작업 공간 그대로');
  await sleep(1_500);
  assert.equal((await lib()).find(e => e.id === here).ws, mine, 'an edit saved after keeps the board in its own workspace');
  await sleep(5_200);
});

/* 0.3-P3-fix4: while a board is being left, what is outside the editor takes no step on it either: ⌘Z and ⌘⇧Z from
   the document, and Edit in the app pressed in the page seen on its own. */
check('while a board is being left, ⌘Z, ⌘⇧Z and Edit in the app from the page seen on its own change nothing', async () => {
  await evaluate('document.activeElement?.blur?.(), true');
  await sleep(5_200);
  const made = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_page', name: 'Leaving keys', html: '<p>keys</p>'}]});
  assert.ok(made.ok, JSON.stringify(made).slice(0, 300));
  const page = made.created_pages[0].page_id;
  const here = (await agent('contract', {})).project.project_id;
  const other = (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => e.project.id)`)).find(id => id !== here);
  const activePage = () => evaluate(`document.querySelector('.space-frame.active')?.dataset.pageId ?? null`);
  const state = async () => ({seq: await seq(), rev: await revision(), page: await activePage()});
  const leaveAndBack = async during => {
    await sleep(5_200);
    const before = await state();
    await evaluate('window.aphroditeHoldWrites(true), true');
    await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + other)}), true`);
    await sleep(600);
    await during();
    await sleep(400);
    const seen = await state();
    await evaluate('window.aphroditeHoldWrites(false), true');
    await waitFor(async () => (await agent('contract', {})).project?.project_id === other, 'the board the link names');
    await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + here)}), true`);
    await waitFor(async () => (await agent('contract', {})).project?.project_id === here, 'back on the board');
    return [before, seen];
  };
  // ⌘Z would take back the agent's page, ⌘⇧Z put it again: neither may, while the board is left.
  const [before, seen] = await leaveAndBack(async () => { await evaluate('document.activeElement?.blur?.(), true'); await presses('z', 4); await sleep(200); await presses('z', 4); });
  assert.deepEqual(seen, before, '⌘Z took no step on the board being left');
  // Edit in the app, pressed in the page seen on its own, would open that page on the board.
  await sleep(5_200);
  await personPresses('page-view', {id: page}); await sleep(600);
  const [before2, seen2] = await leaveAndBack(() => personPresses('page-view-edit'));
  assert.deepEqual(seen2, before2, 'Edit in the app took no step on the board being left');
  await sleep(5_200);
});

/* 0.3-P3-fix3 #10: a link waiting behind a dialog the person opened does not hold up the person: their own leaving,
   from that dialog, goes at once, and the link is looked at again after it. Nothing is left not taking input. */
check('a link waiting behind a dialog the person opened does not hold up the person leaving from it, and nothing is left not taking input', async () => {
  const here = (await agent('contract', {})).project.project_id;
  const other = (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => e.project.id)`)).find(id => id !== here);
  await sleep(5_200);
  await personPresses('new-project');
  await waitFor(() => evaluate('!!document.querySelector("#new-project-form")'), 'the new board form');
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + other)}), true`);
  await sleep(800);
  assert.equal((await agent('contract', {})).project.project_id, here, 'the link waits behind the dialog');
  const t0 = Date.now();
  assert.equal(await personSubmits('#new-project-form', {name: 'Made while a link waits'}), true);
  await waitFor(() => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.some(e => e.project.name === 'Made while a link waits')`), 'the board the person made', 10).catch(async error => { throw new Error(`${error.message}: ${JSON.stringify(await evaluate(`({leaving: window.aphroditeLeaving(), modal: document.querySelector('#modal-root').innerHTML.slice(0, 160), inert: document.querySelector('#app').inert, screen: document.querySelector('#app').dataset.screen, toast: document.querySelector('#toast').textContent})`))}`); });
  assert.ok(Date.now() - t0 < 4_000, `the person's own leaving went at once (${Date.now() - t0} ms)`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === other, 'the link, looked at again after');
  await sleep(600);
  assert.equal(await evaluate('document.querySelector("#app").inert'), false, 'nothing is left not taking input');
  assert.equal(await evaluate('document.querySelector("#modal-root").children.length'), 0);
  await evaluate(`window.aphroditeOpenLink(${JSON.stringify('aphrodite://open?board=' + here)}), true`);
  await waitFor(async () => (await agent('contract', {})).project?.project_id === here, 'back on the board');
  await sleep(5_200);
});

/* 0.3-P3-fix3 #1: closing the window is a leaving too. The browser build closes through the desktop's own steps with a
   window that only counts that it went; the store's write is held, and a word typed then must not go in. */
check('closing the window is a leaving: nothing can be typed while its write is held, and what was typed before is kept', async () => {
  await sleep(5_200);
  const before = await seq();
  const typed = await typeIntoTitle(' 닫기 전');
  await evaluate('window.aphroditeHoldWrites(true), true');
  await evaluate('window.aphroditeCloseWindow(), true');
  await sleep(600);
  const late = await evaluate(`(() => { const t = document.querySelector('[data-field="title"]'); if (!t) return false; t.focus(); return document.activeElement === t; })()`);
  await send('Input.insertText', {text: ' 닫는 중'});
  assert.equal(await evaluate('window.__closed ?? 0'), 0, 'the window waits for the write');
  await evaluate('window.aphroditeHoldWrites(false), true');
  await waitFor(() => evaluate('(window.__closed ?? 0) === 1'), 'the window to go once the write lands');
  assert.equal(late, false, 'the title takes no focus while the window is closing');
  const title = await titleOf(typed) ?? '';
  assert.ok(title.endsWith(' 닫기 전'), `what was typed before closing is kept (${title})`);
  assert.ok(!title.includes('닫는 중'), 'nothing typed while closing went in');
  const {changes} = await agent('changes', {since: before, limit: 20});
  assert.ok(changes.some(c => c.author.kind === 'person' && JSON.stringify(c.ops).includes(' 닫기 전')), "as the person's own change");
  assert.equal(await evaluate('document.querySelector("#app").inert'), false, 'and the editor takes input again, the window being still here');
  await sleep(5_200);
});

/* 0.3-P3-fix2 #3: a board file whose library write fails takes out only that board, and its files: what else changed in the library meanwhile stays. */
check('a board file whose library write fails where it is stored comes out alone, the picture it placed new left named by no board, and a change made meanwhile on the open board stays', async () => {
  const here = (await agent('contract', {})).project.project_id;
  const entries = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => e.project.id)`);
  const count = (await entries()).length;
  // 0.3-P3-fix3 #9, fix4: the board file carries a picture this browser has never had, so its import places it new; the
  // failed write leaves it (taking it back could take one another board has come to rely on).
  const {createHash} = await import('node:crypto');
  const files = unzipSync(new Uint8Array(readFileSync(fileAt(`sent.${BOARD_FILE.extension}`))));
  const fresh = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.from(`never seen ${Date.now()}`)]);
  const freshSha = createHash('sha256').update(fresh).digest('hex');
  files[`media/${freshSha}.png`] = fresh;
  const pageEntry = Object.keys(files).find(n => /^pages\/\d{4}\.html$/.test(n));
  files[pageEntry] = new TextEncoder().encode(new TextDecoder().decode(files[pageEntry]) + `<img src="media:${freshSha}">`);
  writeFileSync(fileAt(`fresh-picture.${BOARD_FILE.extension}`), zipSync(files));
  const inBrowser = sha => evaluate(`new Promise(r => { const o = indexedDB.open('aphrodite-board-media', 1); o.onsuccess = () => { const g = o.result.transaction('files').objectStore('files').get(${JSON.stringify(sha)}); g.onsuccess = () => r(!!g.result); g.onerror = () => r('error'); }; o.onerror = () => r('error'); })`);
  assert.equal(await inBrowser(freshSha), false, 'the picture is new here');
  await sleep(5_200);
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project');
  await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker');
  await evaluate('window.aphroditeHoldWrites(true), window.aphroditeFailImportWrite(), true');
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(`fresh-picture.${BOARD_FILE.extension}`)]});
  await sleep(1_000);
  await evaluate('window.aphroditeHoldWrites(false), true');
  // While the board's library write is out (the check makes it fail after a moment), an agent renames the open board's
  // first page: a change to the library the import's failure must not undo.
  await sleep(300);
  const renamed = await agent('apply', {reason: 'verify-pages: a change while a board file comes in.', base_revision: await revision(), ops: [{op: 'page', name: 'Renamed meanwhile', page_id: (await agent('contract', {})).pages[0].page_id}]});
  assert.ok(renamed.ok, JSON.stringify(renamed).slice(0, 300));
  await sleep(2_500);
  assert.deepEqual((await entries()).length, count, 'no board was added');
  assert.equal((await agent('contract', {})).project.project_id, here, 'the board open is the one it was');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.find(e => e.project.id === ${JSON.stringify(here)}).project.pages[0].name`), 'Renamed meanwhile', 'the change made meanwhile is still in the library');
  assert.equal(await inBrowser(freshSha), true, 'and the picture it placed new is still here, named by no board');
  result.failedImport = {renamed: !!renamed.ok};
});

/* 0.3-P3-fix2 #7: a board file carrying a picture from its image library. The browser build has no image library, so it
   says the picture could not be put in, rather than dropping it without a word (the desktop puts it in before the
   board is drawn). */
check('a board file carrying a picture from its image library says so when this build cannot put it in', async () => {
  const sent = readFileSync(fileAt(`sent.${BOARD_FILE.extension}`));
  const files = unzipSync(new Uint8Array(sent));
  const pic = new Uint8Array(readFileSync(join(process.cwd(), 'public/brand/apple-mark.png')));
  let h = 0xcbf29ce484222325n; for (const b of pic) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  const id = h.toString(16).padStart(16, '0');
  const board = JSON.parse(new TextDecoder().decode(files['board.json']));
  const section = board.pages.findIndex(p => !p.kind && p.blocks.length);
  board.pages[section].blocks[0].image = `local:${id}`;
  files['board.json'] = new TextEncoder().encode(JSON.stringify(board));
  files[`local/${id}.png`] = pic;
  writeFileSync(fileAt(`with-a-picture.${BOARD_FILE.extension}`), zipSync(files));
  const count = (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`));
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  await personPresses('import-project');
  await waitFor(() => evaluate('!!document.querySelector("input[data-upload]")'), 'the file picker');
  const {root} = (await send('DOM.getDocument', {depth: 0})).result;
  const {nodeId} = (await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[data-upload]'})).result;
  await send('DOM.setFileInputFiles', {nodeId, files: [fileAt(`with-a-picture.${BOARD_FILE.extension}`)]});
  await waitFor(async () => (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`)) > count, 'the board to open', 30);
  await waitFor(() => evaluate(`document.querySelector('#toast').textContent.includes('1')`), 'the toast');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /이미지 라이브러리 그림 1개|1 picture\(s\) from its image library/, 'it says the picture could not be put in');
  await sleep(5_200);
});

check('without the page wall no free page is in any frame, on the board or in Preview: a placeholder stands there, and an agent still reads its words', async () => {
  const SENTENCE = 'A sentence only this page holds, which agents still read.';
  const wordsId = await makePage('Words page', `<h1>Never framed here</h1><p>${SENTENCE}</p>`);
  const projectId = (await agent('contract', {})).project.project_id;
  assert.ok(projectId, 'the project the words page is in');
  await send('Page.navigate', {url: `http://127.0.0.1:${PORT}/?page-wall=off`});
  await sleep(1500);
  await waitFor(() => evaluate('!!window.aphroditeAgent && !!document.querySelector("#app")'), 'the app to boot again');
  if (await evaluate(`!!document.querySelector('[data-action="hub-open"]')`)) await personPresses('hub-open', {id: projectId});
  await waitFor(async () => (await agent('contract', {})).project?.project_id === projectId, 'the project the words page is in');
  const listed = (await agent('contract', {})).pages.filter(p => p.kind === 'html');
  assert.ok(listed.length > 3, `free pages on the board: ${listed.length}`);
  const board = () => evaluate(`({unframed: [...document.querySelectorAll('.board-unframed')].map(u => u.dataset.unframedPage), items: [...document.querySelectorAll('.board-item[data-free-page]')].map(i => i.dataset.freePage), frames: document.querySelectorAll('iframe').length, screen: !!document.querySelector('#space-world')})`);
  await waitFor(async () => (await board()).unframed.length >= listed.length, 'the placeholders');
  await sleep(2000);
  const drawn = await board();
  assert.deepEqual(drawn.unframed.sort(), drawn.items.sort(), `a placeholder for every free page on the board: ${JSON.stringify(drawn)}`);
  assert.ok(listed.every(p => drawn.items.includes(p.page_id)), 'every free page the contract lists is on the board');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.board-unframed')].filter(u => u.querySelector('strong').textContent !== u.closest('.space-frame').querySelector('.frame-name span').textContent).length`), 0, 'each placeholder names its page');
  // 0.3-P3-fix1 #9: on a Mac in dark mode the placeholder is the light one, like the rest of the app (until F3's setting).
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light', 'the app document is the light theme');
  const sunken = 'getComputedStyle(document.querySelector(".board-unframed")).backgroundColor';
  const lightToken = `(() => { const d = document.createElement('div'); d.dataset.theme = 'light'; d.style.background = 'var(--ui-bg-sunken)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; })()`;
  await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: 'dark'}]});
  await sleep(200);
  const inDark = await evaluate(sunken), light = await evaluate(lightToken);
  await send('Emulation.setEmulatedMedia', {features: []});
  result.theme = {inDark, light};
  assert.equal(inDark, light, 'with the Mac in dark mode the placeholder is the light theme');
  const free = listed;
  assert.equal(await evaluate(`document.querySelectorAll('iframe[data-frame-page]').length`), 0, 'no free page has a frame');
  const read = await Promise.all(free.map(p => agent('text', {page_id: p.page_id})));
  for (const [i, r] of read.entries()) assert.ok(r.ok && typeof r.text === 'string', `${free[i].name}: ${JSON.stringify(r).slice(0, 200)}`);
  const words = await agent('text', {page_id: wordsId});
  assert.ok(words.ok && words.text.includes(SENTENCE), `the agent reads the page’s words: ${JSON.stringify(words).slice(0, 200)}`);
  assert.ok(drawn.unframed.includes(wordsId), 'the words page is a placeholder too');
  const lines = [SENTENCE, ...read.flatMap(r => r.text.split('\n').map(l => l.replace(/^[#\-| ]+/, '').trim()).filter(l => l.length >= 8))];
  const framed = await evaluate(`[...document.querySelectorAll('iframe')].map(f => [f.getAttribute('srcdoc') ?? '', f.getAttribute('src') ?? '', (() => { try { return f.contentDocument?.documentElement?.outerHTML ?? ''; } catch { return ''; } })()].join(' '))`);
  assert.deepEqual(lines.filter(l => framed.some(f => f.includes(l))), [], 'no frame holds a free page’s words');
  assert.equal(await evaluate(`(window.__frameMessages || []).filter(m => m && (m.boot || m.ten !== undefined || m.bigBoot)).length`), 0, 'no page ran');
  await personClicks('zoom-fit'); await sleep(500);
  const before = await active();
  // A placeholder on screen and not under another frame, pressed where its shield is.
  const spot = await evaluate(`(() => { for (const s of document.querySelectorAll('.board-item[data-free-page] .board-shield')) { const id = s.dataset.boardShield; if (id === ${JSON.stringify(before)}) continue; const r = s.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 40); if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue; if (document.elementFromPoint(x, y) === s) return {id, x, y}; } return null; })()`);
  assert.ok(spot, 'a placeholder can be pressed');
  const pick = {page_id: spot.id};
  await click(spot);
  assert.equal(await active(), pick.page_id, 'one press on the placeholder selects its page');
  const renamed = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'page', page_id: pick.page_id, name: 'Renamed while not drawn'}]});
  assert.ok(renamed.ok, JSON.stringify(renamed).slice(0, 300));
  await waitFor(() => evaluate(`[...document.querySelectorAll('.board-unframed strong')].some(s => s.textContent === 'Renamed while not drawn')`), 'the placeholder to show the new name');
  await personPresses('preview'); await sleep(1500);
  assert.equal(await evaluate(`document.querySelectorAll('#modal-root iframe').length`), 0, 'Preview makes no frame');
  assert.equal(await evaluate(`!!document.querySelector('#modal-root .board-unframed')`), true, 'Preview shows the placeholder');
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
  await personPresses('page-view', {id: wordsId}); await sleep(1500);
  assert.equal(await evaluate(`document.querySelectorAll('#page-view-root iframe').length`), 0, 'the page on its own makes no frame');
  assert.equal(await evaluate(`document.querySelector('#page-view-root .board-unframed')?.dataset.unframedPage`), wordsId, 'it shows the placeholder');
  await personPresses('page-view-close');
});

checks.push(['(numbers)', async () => { const {probe, bare, ...rest} = result; console.log('       ' + JSON.stringify(rest).slice(0, 3000)); }]);
await runChecks(checks, shut);
