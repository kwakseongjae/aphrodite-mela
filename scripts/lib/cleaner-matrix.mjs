/**
 * The cleaner, measured where the app runs it (0.3-P3-fix2 O-1, 12): every input of tests/support/clean-vectors.mjs
 * and clean-vectors-2.mjs is cleaned by the app's own exportPage in a WKWebView (scripts/wall/pages.swift), as the
 * desktop cleans it, and each cleaned file is opened from disk in a WKWebView and in headless Chrome. A request is
 * counted for the input whose id it carries; a raw connection for the file open when it came. The same page with its
 * scripts, opened in WebKit, is the control: each one a browser sets off on opening reaches out, so a cleaned file
 * that stays quiet means something. verify:wall runs this, on the macOS runners.
 */
import {build} from 'esbuild';
import {createServer} from 'node:http';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFile, spawnSync} from 'node:child_process';
import {openPage, sleep} from './headless.mjs';
import {vectors, QUIET} from '../../tests/support/clean-vectors.mjs';
import {myVectors, MY_QUIET, QUIET_OPENING} from '../../tests/support/clean-vectors-2.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const [HP, TP, SITE, CDP] = [47821, 47822, 4264, 9398];
/** What a cleaned page must not hold, read through the prototypes so the page cannot hide anything by a name. */
export const HELD = "(() => { const qsa = s => Document.prototype.querySelectorAll.call(document, s); const bad = [], ours = m => m.hasAttribute('charset') || ['Content-Security-Policy', 'x-dns-prefetch-control'].includes(m.getAttribute('http-equiv')); for (const e of qsa('*')) { const n = e.localName.toLowerCase(); if (['script','link','template','iframe','frame','object','embed','base','animate','set','animatetransform','animatemotion','foreignobject','math','noscript'].includes(n) || (n === 'meta' && !ours(e))) bad.push(n); for (const a of e.attributes) { const name = a.name.toLowerCase(); if (name.startsWith('on') || ['action','formaction','srcdoc','ping','srcset'].includes(name) || /javascript:/i.test(a.value)) bad.push(n + '@' + name); } } const csp = [...qsa('meta[http-equiv=Content-Security-Policy]')].map(m => m.parentElement && m.parentElement.localName); return {bad, csp}; })()";

function webkit(tmp) {
  const source = join(ROOT, 'scripts/wall/pages.swift');
  const binary = join(tmp, 'pages-' + createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 12));
  if (!existsSync(binary)) { const b = spawnSync('swiftc', ['-O', source, '-o', binary], {encoding: 'utf8'}); if (b.status !== 0) throw new Error('the WebKit page tool did not build: ' + b.stderr); }
  // Run beside this process's servers, never blocking them: the tool loads the cleaner from one of them.
  // A run that does not end well fails the matrix, whatever it printed (0.3-P3-fix3 #9).
  return spec => new Promise((resolve, reject) => { const f = join(tmp, 'spec-' + Math.random().toString(36).slice(2) + '.json'); writeFileSync(f, JSON.stringify(spec)); execFile(binary, [f], {encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1500e3}, (error, stdout) => { if (error) { reject(new Error(`the WebKit page tool ended badly in ${spec.mode} (${error.code ?? error.signal ?? error.message})`)); return; } resolve(String(stdout ?? '').split('\n').filter(Boolean).map(l => JSON.parse(l))); }); });
}

/** Runs the matrix; returns what the checks assert. `only` keeps the inputs whose name it matches. */
export async function cleanerMatrix(tmp, {only} = {}) {
  mkdirSync(tmp, {recursive: true});
  const all = {...Object.fromEntries(Object.entries(vectors(HP, TP)).map(([k, f]) => ['w_' + k, f])), ...Object.fromEntries(Object.entries(myVectors(HP, TP)).map(([k, f]) => ['n_' + k, f]))};
  const quiet = new Set([...QUIET.map(q => 'w_' + q), ...[...MY_QUIET, ...QUIET_OPENING].map(q => 'n_' + q)]);
  const names = Object.keys(all).filter(n => !only || only.test(n));
  const wrap = s => s.startsWith('<!doctype') ? s : '<!doctype html><html><head><title>t</title></head><body>' + s + '</body></html>';
  const src = (n, v) => wrap(all[n](n + '~' + v));
  const events = [];
  const at = () => Date.now() / 1000;
  const trap = createServer((q, s) => { events.push({k: 'http', t: at(), path: q.url, host: q.headers.host ?? ''}); s.writeHead(200, {'content-type': 'text/css', 'access-control-allow-origin': '*'}); s.end(''); });
  const raw = net.createServer(c => { events.push({k: 'tcp', t: at()}); c.on('error', () => {}); setTimeout(() => c.destroy(), 200); });
  const files = join(tmp, 'files'); mkdirSync(files, {recursive: true});
  const bundle = await build({stdin: {contents: "import {exportPage} from './src/page-export.ts'; const host = {stat: async () => undefined, read: async () => undefined}; window.exportPage = (src, scripts) => exportPage(src, {scripts, videos: 'out'}, host).then(r => r.html, e => 'refused: ' + e.message);", resolveDir: ROOT, loader: 'ts'}, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent'});
  const cleanerPage = '<!doctype html><meta charset=utf-8><title>cleaner</title><script>' + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const site = createServer((q, s) => { if (q.url === '/cleaner.html') { s.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); s.end(cleanerPage); return; } s.writeHead(404); s.end(); });
  await Promise.all([[trap, HP], [raw, TP], [site, SITE]].map(([server, port]) => new Promise(r => server.listen(port, '127.0.0.1', r))));
  const run = webkit(tmp);
  try {
    // 1. Cleaned in WebKit, the page and its control alike, as the desktop's exportPage runs.
    const out = {};
    for (const line of await run({mode: 'clean', url: `http://127.0.0.1:${SITE}/cleaner.html`, pages: names.flatMap(n => [{id: n + '|C', src: src(n, 'C'), scripts: false}, {id: n + '|S', src: src(n, 'S'), scripts: true}])})) if (line.id) out[line.id] = line.html ?? 'refused: ' + line.error;
    const refused = names.filter(n => !out[n + '|C'] || out[n + '|C'].startsWith('refused: ')).map(n => [n, (out[n + '|C'] ?? 'no answer').slice(0, 160)]);
    // Each input's control, the same page with its scripts, came back from the cleaning too: one that did not would drop
    // out of what is expected and of the dead controls alike, unseen (0.3-P3-fix4).
    const noControl = names.filter(n => !out[n + '|S'] || out[n + '|S'].startsWith('refused: ')).map(n => [n, (out[n + '|S'] ?? 'no answer').slice(0, 160)]);
    const opened = names.filter(n => out[n + '|C'] && !out[n + '|C'].startsWith('refused: '));
    for (const n of opened) writeFileSync(join(files, n + '.C.html'), '\ufeff' + out[n + '|C']);
    for (const n of names) if (out[n + '|S'] && !out[n + '|S'].startsWith('refused: ')) writeFileSync(join(files, n + '.S.html'), '\ufeff' + out[n + '|S']);
    const windows = [];
    // 2. Each cleaned file opened in WebKit, then each control, so a control's late request falls in no cleaned file's window.
    for (const [variant, list] of [['C', opened], ['S', names.filter(n => existsSync(join(files, n + '.S.html')))]]) {
      const starts = {};
      for (const o of await run({mode: 'open', wait: 1.2, dir: files, held: variant === 'S' ? 'document.documentElement.outerHTML' : HELD, pages: list.map(n => ({id: n, file: join(files, `${n}.${variant}.html`)}))})) {
        if (o.start !== undefined) starts[o.start] = o.t;
        else if (o.id !== undefined) { let read = {}; try { read = JSON.parse(o.read); } catch { read = {err: o.read}; } windows.push({engine: 'webkit', variant, name: o.id, t0: starts[o.id], t1: o.t, href: read.href, held: read.held, navs: (o.navs ?? []).filter(x => !/^(main|sub):(file:|about:)/.test(x))}); }
      }
    }
    // Every file sent to be opened in WebKit came back with what it did: one with no record fails the matrix.
    const expected = [...opened.map(n => 'C ' + n), ...names.filter(n => existsSync(join(files, n + '.S.html'))).map(n => 'S ' + n)];
    const recorded = new Set(windows.filter(w => w.engine === 'webkit').map(w => w.variant + ' ' + w.name));
    const unrecorded = expected.filter(e => !recorded.has(e));
    // 3. Each cleaned file opened in Chrome.
    const chrome = await openPage('about:blank', {cdp: CDP, profile: '/tmp/aphrodite-wall-cleaner-profile'});
    try {
      for (const n of opened) {
        const t0 = at();
        await chrome.send('Page.navigate', {url: 'file://' + join(files, n + '.C.html')});
        await sleep(1200);
        const href = await chrome.evaluate('location.href').catch(e => 'ERR ' + e.message);
        const held = href.startsWith('file:') ? await chrome.evaluate(HELD).catch(e => ({err: e.message})) : null;
        await chrome.send('Page.navigate', {url: 'about:blank'}); await sleep(200);
        windows.push({engine: 'chrome', variant: 'C', name: n, t0, t1: at(), href, held, navs: []});
      }
    } finally { chrome.close(); }
    // 4. Late requests: they still carry their input's id.
    await sleep(2_000);
    for (const w of windows) {
      const next = Math.min(...windows.filter(x => x.engine === w.engine && x.t0 > w.t0).map(x => x.t0), w.t1 + 1.2);
      const token = (w.name + '~' + w.variant).toLowerCase();
      // A request counts for the input whose id it carries, from when its file opened until the next file of the same
      // engine opened (or, for the last, the end): a late one still lands on its own input, never on another's.
      const until = windows.some(x => x.engine === w.engine && x.variant === w.variant && x.t0 > w.t0) ? Math.min(...windows.filter(x => x.engine === w.engine && x.variant === w.variant && x.t0 > w.t0).map(x => x.t0)) : Infinity;
      w.http = events.filter(e => e.k === 'http' && e.t >= w.t0 && (e.t < until || until === Infinity) && (e.path + ' ' + e.host).toLowerCase().replace(/-v([cs])\./, '~$1.').includes(token)).map(e => e.path);
      w.tcp = events.filter(e => e.k === 'tcp' && e.t >= w.t0 && e.t < next).length;
      w.left = !!(w.href && !/^file:/.test(w.href) && w.href !== 'about:blank');
      w.reached = w.http.length + w.tcp + (w.left ? 1 : 0) + w.navs.length;
    }
    const cleaned = windows.filter(w => w.variant === 'C');
    // A control is read back as this WebKit parsed it. One whose input's id is nowhere in it had its probe dropped by the
    // parser itself (an older one drops what a newer one keeps): it is named apart, not counted dead. One that still
    // carries its id and reached nothing is dead, as is one that could not be read.
    const marked = w => { const id = (w.name + '~' + w.variant).toLowerCase(); return typeof w.held !== 'string' || [id, id.replace(/[^a-z0-9~]/g, '').replace('~', '-v')].some(m => w.held.toLowerCase().includes(m)); };
    const quietControls = windows.filter(w => w.variant === 'S' && !w.reached && !quiet.has(w.name));
    return {
      inputs: names.length, refused, unrecorded, noControl,
      // A name that hides one of the document's or a form's own is taken off the element, so the page received hides nothing either.
      hiding: opened.filter(n => /\s(?:name|id)="(?:documentElement|head|body|querySelectorAll|createElement|nextSibling|firstChild|forms|images)"/.test(out[n + '|C'])),
      reached: cleaned.filter(w => w.reached).map(w => [w.engine, w.name, w.http, w.tcp, w.left, w.navs]),
      holding: cleaned.filter(w => w.held && (w.held.bad?.length || w.held.err || w.held.csp?.[0] !== 'head')).map(w => [w.engine, w.name, w.held]),
      unread: cleaned.filter(w => !w.held).map(w => [w.engine, w.name, w.href]),
      alive: windows.filter(w => w.variant === 'S' && w.reached).length,
      dead: quietControls.filter(marked).map(w => w.name),
      parsedAway: quietControls.filter(w => !marked(w)).map(w => w.name),
    };
  } finally { trap.close(); raw.close(); site.close(); }
}
