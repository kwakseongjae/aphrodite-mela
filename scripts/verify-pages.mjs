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
import {framedDocument, renderShell, FRAME_PREFIX_END} from '../src/free-page.ts';
import {requestProbe} from './wall/probes.mjs';
import {mkdtempSync, writeFileSync, unlinkSync, rmdirSync, truncateSync, readdirSync, readFileSync, existsSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, extname} from 'node:path';

/** Files to drop from "the Finder", made here and removed when the gate ends. */
const filesDir = mkdtempSync(join(tmpdir(), 'aphrodite-pages-'));
const fileAt = name => join(filesDir, name);
const removeFiles = () => { try { for (const name of readdirSync(filesDir)) unlinkSync(fileAt(name)); rmdirSync(filesDir); } catch {} };

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

const {evaluate, send, agent, personClicks, personPresses, presses, close} = await openApp({port: PORT, cdp: 9383, profile: '/tmp/aphrodite-pages-profile'});
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
  const frame = await evaluate(`(() => { const f = document.querySelector('#modal-root iframe'); return f && {sandbox: f.getAttribute('sandbox'), page: f.dataset.framePage}; })()`);
  assert.deepEqual(frame, {sandbox: 'allow-scripts', page: enterId});
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
    const b = document.createElement('button'); b.dataset.action = 'page'; b.dataset.id = ${JSON.stringify(other)}; document.querySelector('#app').append(b); b.click(); b.remove();
    return await answer; })()`);
  assert.ok(got.ok, JSON.stringify(got).slice(0, 300));
  const added = got.receipt.changedNodes.find(n => n.fields.includes('added'))?.id;
  assert.ok(added, JSON.stringify(got.receipt).slice(0, 300));
  const on = (await agent('contract', {page_id: section})).pages.find(p => p.page_id === section);
  assert.ok(JSON.stringify(on).includes(added), 'the component is on the page that was open when the batch arrived');
});

/* 0.3-P2-fix4: where the page wall does not hold (on the desktop: a WebKit without the settings, or one that
   does not answer), no free page is put in any frame, since preconnect needs no script: a placeholder stands
   in its place, the page can still be selected and renamed, and an agent still reads its words. The browser
   build is told so with ?page-wall=off. Last, since it reloads the app. */
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
});

checks.push(['(numbers)', async () => { const {probe, bare, ...rest} = result; console.log('       ' + JSON.stringify(rest).slice(0, 3000)); }]);
await runChecks(checks, shut);
