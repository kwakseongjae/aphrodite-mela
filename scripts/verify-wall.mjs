/**
 * A free page reaches nothing outside the frame, in WebKit, with no script of the host's in it (0.3-P2-fix3).
 *
 * fix1 put the wall against WebRTC in the page's own window, and a page that spoiled the DOM's functions
 * first got a peer connection out of a frame of its own; preconnect reached any host with no script at all
 * (lab/review-board/evidence/reviews/2026-11-19-opus-0.3-P2-sandbox.md). The wall is now the engine's:
 * WebKit settings the desktop puts in every webview, peer connections, preconnect and the media devices
 * (src-tauri/src/page_wall.rs), named once in src-tauri/page-wall.json. This measures them where the desktop draws free pages, a WKWebView, with the
 * framed document stripped of every host script:
 *
 *   board  the app's own page (a custom scheme, the desktop's policy) that later puts the page in a
 *          sandboxed frame loaded from the asset protocol; the wall goes in after the app page has loaded,
 *          as it does in the app's main window
 *   shell  the off-screen renderer's page (renderShell) loaded top-level from loopback, the wall in before
 *
 * Every probe has its own UDP socket and TCP listeners on 127.0.0.1, beside one recording HTTP server; with
 * the wall, every count is 0 and a page that does nothing wrong still works. The same probes without the
 * wall must reach the sockets, in this same run, each probe its own: that is what shows the probes are alive.
 *
 * One more run is kept as a known fact: without the wall, a frame with no scripts at all (sandbox="") still
 * preconnects from its markup. So turning page scripts off is no fallback; where the wall does not hold, a
 * free page is put in no frame (src/free-page.ts pageWall, src-tauri/src/snapshot.rs).
 *
 *   node scripts/verify-wall.mjs
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import net from 'node:net';
import dgram from 'node:dgram';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile, spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {runChecks} from './lib/headless.mjs';
import {attacks} from './wall/probes.mjs';
import {framedDocument, renderShell, FRAME_PREFIX_END, FRAME_ALLOW} from '../src/free-page.ts';
import {appPolicy} from '../src/csp.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const WALL = join(ROOT, 'src-tauri/page-wall.json');
const ORIGINS = ['asset:', 'http://asset.localhost'];
const [HTTP, PAGES, FRAMES, UDP0, TCP0] = [4261, 4262, 4263, 4700, 4800];
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

/** The measurer, built from its source into a folder of this machine's temporary files, once per version of the source. */
function measurer() {
  const source = join(ROOT, 'scripts/wall/measure.swift');
  const dir = join(tmpdir(), 'aphrodite-wall-' + createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 12));
  const binary = join(dir, 'measure');
  if (!existsSync(binary)) {
    mkdirSync(dir, {recursive: true});
    const built = spawnSync('swiftc', ['-O', source, '-o', binary], {encoding: 'utf8'});
    if (built.status !== 0) throw new Error('the measurer did not build: ' + built.stderr);
  }
  return binary;
}

/** A framed document with no host script in it: the charset and the policy, then the page. */
const bare = html => { const doc = framedDocument(html, {media: () => undefined, origins: ORIGINS}); return doc.slice(0, doc.indexOf('<script>')) + doc.slice(doc.indexOf(FRAME_PREFIX_END) + FRAME_PREFIX_END.length); };
/** A one-second, 64-pixel H.264 file (scripts/wall/fixtures/v.mp4, made with ffmpeg's testsrc), given as the desktop gives board media: by the asset address, in the board and in the render shell alike. */
const VIDEO = readFileSync(join(ROOT, 'scripts/wall/fixtures/v.mp4'));
const DOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const runs = [];
for (const name of Object.keys(attacks)) for (const shape of ['board', 'shell']) for (const walled of [true, false]) {
  runs.push({name, shape, walled, tag: `${name}-${shape}-${walled ? 'wall' : 'none'}`});
}
// The known fact: no wall, no scripts, and preconnect still opens connections from the page's markup.
for (const shape of ['board', 'shell']) runs.push({name: 'preconnect', shape, walled: false, scriptless: true, tag: `preconnect-${shape}-none-scriptless`});
for (const [k, run] of runs.entries()) run.ports = {udp: UDP0 + k, tcp: Array.from({length: 6}, (_, i) => TCP0 + k * 6 + i), http: HTTP, asset: 'asset://localhost/media/dot.png', video: 'asset://localhost/media/v.mp4'};
/** What each probe must reach without the wall, in every shape, for its zero with the wall to mean anything. */
const ALIVE = {'rtc-self': 'udp', 'poison-remove': 'udp', 'poison-matches': 'udp', 'poison-then-markup': 'udp', 'poison-length': 'udp', preconnect: 'tcp'};
const page = run => bare(attacks[run.name](run.tag, run.ports));
/** The render shell; for the scriptless run, the same shell with its frame's scripts taken away, which the app no longer makes. */
const shell = run => { const made = renderShell(page(run), ORIGINS); if (!run.scriptless) return made; const without = made.replace('<iframe sandbox="allow-scripts"', '<iframe sandbox=""'); assert.notEqual(without, made, 'the shell frame named its sandbox as expected'); return without; };

// The servers every probe aims at, all on 127.0.0.1.
const sockets = [], counts = new Map(runs.map(r => [r.tag, {udp: 0, tcp: 0, http: []}]));
const byUdp = new Map(runs.map(r => [r.ports.udp, r.tag])), byTcp = new Map(runs.flatMap(r => r.ports.tcp.map(p => [p, r.tag])));
for (const [port, tag] of byUdp) { const s = dgram.createSocket('udp4'); s.on('message', () => counts.get(tag).udp++); await new Promise(r => s.bind(port, '127.0.0.1', r)); sockets.push(s); }
for (const [port, tag] of byTcp) { const s = net.createServer(c => { counts.get(tag).tcp++; c.on('error', () => {}); setTimeout(() => c.destroy(), 200); }); await new Promise(r => s.listen(port, '127.0.0.1', r)); sockets.push(s); }
const unknown = [];
const trap = createServer((req, res) => { const tag = req.url.split('/')[1]; (counts.get(tag)?.http ?? unknown).push(req.url); res.end('seen'); });
trap.on('upgrade', (req, s) => { (counts.get(req.url.split('/')[1])?.http ?? unknown).push('UPGRADE ' + req.url); s.destroy(); });
await new Promise(r => trap.listen(HTTP, '127.0.0.1', r)); sockets.push(trap);
const byTag = new Map(runs.map(r => [r.tag, r]));
const pages = createServer((req, res) => {
  const [, shape, tag] = req.url.split('?')[0].split('/');
  if (shape === 'board') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'content-security-policy': appPolicy('desktop')}); res.end('<!doctype html><title>board</title><body></body>'); return; }
  if (shape === 'shell' && byTag.has(tag)) { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(shell(byTag.get(tag))); return; }
  res.writeHead(404); res.end();
});
await new Promise(r => pages.listen(PAGES, '127.0.0.1', r)); sockets.push(pages);
const frames = createServer((req, res) => {
  const path = req.url.split('?')[0].slice(1);
  if (path === 'media/dot.png') { res.writeHead(200, {'content-type': 'image/png'}); res.end(DOT); return; }
  if (path === 'media/v.mp4') {
    // A media player asks for ranges of the file.
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (!range) { res.writeHead(200, {'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': VIDEO.length}); res.end(VIDEO); return; }
    const start = range[1] ? Number(range[1]) : 0, end = Math.min(range[2] ? Number(range[2]) : VIDEO.length - 1, VIDEO.length - 1);
    res.writeHead(206, {'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${VIDEO.length}`, 'content-length': end - start + 1}); res.end(VIDEO.subarray(start, end + 1)); return;
  }
  if (!byTag.has(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(page(byTag.get(path)));
});
await new Promise(r => frames.listen(FRAMES, '127.0.0.1', r)); sockets.push(frames);

const wallFile = existsSync(WALL) ? WALL : undefined;
const work = join(tmpdir(), `aphrodite-wall-runs-${process.pid}`);
mkdirSync(work, {recursive: true});
const READ = `JSON.stringify((window.__m||[]).filter(m=>m&&(m.atk||m.rtc||m.probe)).map(m=>(m.n||m.name)+'='+(m.v||m.value)))`;
async function measure(binary, run) {
  const insert = `(()=>{const f=document.createElement('iframe');f.setAttribute('sandbox','${run.scriptless ? '' : 'allow-scripts'}');f.setAttribute('allow',${JSON.stringify(FRAME_ALLOW).replace(/'/g, "\\'")});f.src='asset://localhost/${run.tag}';document.body.append(f);return 1})()`;
  // Walled runs are answered as wry answers the app's window: every request for the camera or the microphone is
  // granted. Unwalled ones are only counted and refused, so a control run never reaches a real device.
  const delegate = run.walled ? 'grant' : 'deny';
  const spec = run.shape === 'board'
    ? {url: `app://localhost/board/${run.tag}`, when: 'afterLoad', steps: [{js: insert, wait: 6, read: READ}]}
    : {url: `http://127.0.0.1:${PAGES}/shell/${run.tag}`, when: 'afterCreate', steps: [{wait: 6, read: READ}]};
  const file = join(work, run.tag + '.json');
  writeFileSync(file, JSON.stringify({...spec, delegate, wall: run.walled ? wallFile : undefined, schemes: {app: `http://127.0.0.1:${PAGES}`, asset: `http://127.0.0.1:${FRAMES}`}}));
  let lines;
  try { lines = (await promisify(execFile)(binary, [file], {encoding: 'utf8', timeout: 70_000})).stdout.trim().split('\n').map(l => JSON.parse(l)); }
  catch (error) { lines = [{failed: String(error.message).slice(0, 300)}]; }
  unlinkSync(file);
  run.wall = lines.find(l => l.wall)?.wall;
  run.asked = lines.filter(l => l.delegate).map(l => l.delegate);
  run.before = lines.find(l => l.before)?.before;
  run.said = JSON.parse(lines.find(l => l.read)?.read ?? '[]');
  run.failed = lines.find(l => l.failed || l.timeout);
}

let binary;
check('the measurer builds, and the wall\'s settings are named in src-tauri/page-wall.json', async () => {
  binary = measurer();
  assert.ok(wallFile, 'src-tauri/page-wall.json names the settings the desktop puts in');
  const wall = JSON.parse(readFileSync(wallFile, 'utf8'));
  assert.ok(wall.peerConnection?.setter && wall.peerConnection?.getter && wall.features?.length, JSON.stringify(wall));
});

check('every probe ran, with and without the wall', async () => {
  assert.ok(binary, 'the measurer was built');
  for (let i = 0; i < runs.length; i += 6) await Promise.all(runs.slice(i, i + 6).map(run => measure(binary, run)));
  await new Promise(r => setTimeout(r, 1000));
  const silent = runs.filter(r => r.failed || !r.scriptless && !r.said.includes('ran=true') && !r.said.includes('ran=1'));
  assert.deepEqual(silent.map(r => [r.tag, r.failed ?? r.said]), []);
});

check('without the wall each probe reaches its socket, in each shape: every one is alive', async () => {
  const dead = runs.filter(r => !r.walled && !r.scriptless && ALIVE[r.name]).filter(r => !(counts.get(r.tag)[ALIVE[r.name]] > 0)).map(r => `${r.tag}: ${ALIVE[r.name]} ${counts.get(r.tag)[ALIVE[r.name]]}`);
  assert.deepEqual(dead, []);
  assert.deepEqual(Object.keys(ALIVE).filter(name => !attacks[name]), [], 'every probe named here is one that runs');
});

check('known: without the wall, a frame with no scripts still preconnects from its markup, so scripts off is no fallback', async () => {
  for (const run of runs.filter(r => r.scriptless)) assert.ok(counts.get(run.tag).tcp > 0, `${run.tag}: TCP ${counts.get(run.tag).tcp}`);
});

check('with the wall in, every setting reads back off', async () => {
  for (const run of runs.filter(r => r.walled)) assert.deepEqual(run.wall, {rtc: 'off', preconnect: 'off', capture: 'off'}, run.tag);
});

check('with the wall in, no probe reaches anything: UDP 0, TCP 0, HTTP 0, on the board and in the render shell', async () => {
  const leaks = runs.filter(r => r.walled).map(r => [r.tag, counts.get(r.tag)]).filter(([, c]) => c.udp || c.tcp || c.http.length);
  assert.deepEqual(leaks, []);
  assert.deepEqual(unknown, [], 'and nothing else reached the server');
  const worked = runs.filter(r => r.walled && r.name !== 'legit').flatMap(r => r.said.filter(s => /offer made|=ready|^webkit-prefixed=present/.test(s)).map(s => r.tag + ' ' + s));
  assert.deepEqual(worked, [], 'no peer connection was made');
});

/* 0.3-P2-fix6: the app's window grants every request for the camera or the microphone (wry 0.55), so the wall
   takes the media devices away from every document, frames inside frames included: no page can ask at all.
   The frame's own allow attribute is not what stops it (a free page's frame is refused by default either way). */
const MACOS = spawnSync('sw_vers', ['-productVersion'], {encoding: 'utf8'}).stdout.trim();
check('with the wall in, no frame has the media devices, and the window is never asked for the camera or the microphone', async () => {
  const walled = runs.filter(r => r.walled);
  assert.deepEqual(walled.flatMap(r => r.said.filter(s => /(^media-devices|-md)=present$/.test(s)).map(s => r.tag + ' ' + s)), [], 'navigator.mediaDevices in a frame');
  for (const r of walled.filter(r => r.name === 'rtc-self')) assert.ok(r.said.includes('media-devices=absent') && r.said.includes('srcdoc-md=absent'), `${r.tag}: ${JSON.stringify(r.said)}`);
  assert.deepEqual(walled.filter(r => r.asked.length).map(r => [r.tag, r.asked]), [], 'the window was asked');
  const open = runs.filter(r => !r.walled && r.name === 'rtc-self');
  console.log(`       macOS ${MACOS}, before the wall this WebKit had ${JSON.stringify(walled.find(r => r.before)?.before)}; without the wall: ` + JSON.stringify(Object.fromEntries(open.map(r => [r.tag, {asked: r.asked.length, said: r.said.filter(s => /^(media-devices|capture-|labelled-devices)/.test(s))}]))));
});

check('with the wall in, a page that does nothing wrong still works, and plays its video wherever it plays without the wall', async () => {
  for (const shape of ['board', 'shell']) {
    const [walled, open] = [true, false].map(w => runs.find(r => r.name === 'legit' && r.shape === shape && r.walled === w));
    assert.ok(open.said.includes('video=playing'), `legit-${shape}: the probe's video does not play even without the wall, so the probe is wrong, not the wall: ${JSON.stringify(open.said)}`);
    assert.ok(walled.said.includes('video=playing'), `legit-${shape}: plays without the wall and not with it, so the wall breaks it: ${JSON.stringify(walled.said)}`);
  }
  for (const run of runs.filter(r => r.name === 'legit' && r.walled)) for (const said of ['canvas=255', 'data-img=1', 'asset-img=1']) assert.ok(run.said.includes(said), `${run.tag}: ${said} in ${JSON.stringify(run.said)}`);
});

/* Names WebKit does not have, the way a future macOS might drop one: nothing is called, nothing dies, and
   every setting reads as unavailable, and then no free page is put in a frame (src/free-page.ts pageWall). */
check('names this WebKit does not have are reported unavailable, and nothing dies', async () => {
  const wrong = join(work, 'wrong-wall.json');
  writeFileSync(wrong, JSON.stringify({...JSON.parse(readFileSync(WALL, 'utf8')), peerConnection: {setter: '_setNoSuchSettingEnabled:', getter: '_noSuchSettingEnabled'}, mediaDevices: {setter: '_setNoSuchDevicesEnabled:', getter: '_noSuchDevicesEnabled'}, features: ['NoSuchFeature']}));
  const spec = join(work, 'wrong-run.json');
  writeFileSync(spec, JSON.stringify({url: `http://127.0.0.1:${PAGES}/shell/${runs.find(r => r.name === 'legit' && r.shape === 'shell').tag}`, when: 'afterCreate', wall: wrong, steps: [{wait: 1, read: READ}]}));
  const {stdout} = await promisify(execFile)(binary, [spec], {encoding: 'utf8', timeout: 70_000});
  unlinkSync(spec); unlinkSync(wrong);
  const lines = stdout.trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.find(l => l.wall)?.wall, {rtc: 'unavailable', preconnect: 'unavailable', capture: 'unavailable'});
  assert.ok(lines.some(l => l.done), 'the page ran to the end');
});

checks.push(['(numbers)', async () => {
  // Read again at the very end, so a packet that came late is counted too.
  assert.deepEqual(runs.filter(r => r.walled).map(r => [r.tag, counts.get(r.tag)]).filter(([, c]) => c.udp || c.tcp || c.http.length), [], 'still nothing, at the end');
  const table = {};
  for (const r of runs) { const c = counts.get(r.tag); (table[r.name] ??= {})[`${r.shape} ${r.walled ? 'wall' : 'none'}${r.scriptless ? ' scriptless' : ''}`] = `udp ${c.udp} tcp ${c.tcp} http ${c.http.length}`; }
  console.log(`       macOS ${MACOS} video: ` + JSON.stringify(Object.fromEntries(runs.filter(r => r.name === 'legit').map(r => [`${r.shape} ${r.walled ? 'wall' : 'none'}`, r.said.filter(s => s.startsWith('video=')).join(' ') || 'nothing'])) ));
  console.log(`       macOS ${MACOS} ` + JSON.stringify(table));
}]);
await runChecks(checks, () => { for (const s of sockets) try { s.close(); } catch {} try { for (const f of readdirSync(work)) unlinkSync(join(work, f)); rmdirSync(work); } catch {} });
