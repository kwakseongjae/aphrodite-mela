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

checks.push(['(numbers)', async () => { console.log('       ' + JSON.stringify(result).slice(0, 4000)); }]);
await runChecks(checks, shut);
