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
import {openApp, runChecks, sleep, waitFor} from './lib/headless.mjs';
import {appPolicy} from '../src/csp.mjs';

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

const {evaluate, send, agent, personClicks, personPresses, presses, close} = await openApp({port: PORT, cdp: 9383, profile: '/tmp/aphrodite-pages-profile'});
const shut = () => { close(); trap.close(); };
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

checks.push(['(numbers)', async () => { console.log('       ' + JSON.stringify(result).slice(0, 4000)); }]);
await runChecks(checks, shut);
