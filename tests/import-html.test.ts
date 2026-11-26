import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newBoard} from '../src/editor/starter';
import {ensureSpace, frameWidth} from '../src/editor/space';
import {agentDispatch, personAt, sourceFor, type Dispatch} from '../src/agent/dispatch';
import {runBatch} from '../src/agent/apply';
import {begin, end, newHistory, stepForScreen} from '../src/ledger/session';
import {designOf} from '../src/ledger/ledger';
import {MAX_PAGE_HTML, mediaNamed} from '../src/free-page';
import {importHtml, type ImportTarget} from '../src/import/html';

const person = personAt({isTrusted: true})!;
const fixture = (name: string) => readFileSync(new URL('./fixtures/import-html/' + name, import.meta.url));
function setup() {
  const project = newBoard('Test');
  ensureSpace(project);
  const history = newHistory(project);
  const target: ImportTarget = {current: () => project, storage: () => ({library: {version: 1, entries: []}, limit: {unit: 'bytes', limit: 100_000_000}}), defaultName: n => 'Sheet ' + n,
    commit(change, dispatch, row) {
      const before = begin(project, history);
      change();
      end(project, before, {author: dispatch.author, source: sourceFor(row)}, history);
    }};
  return {project, target, history};
}

test('a pasted document is the same page and frame as html_page, with the person on its ledger', async () => {
  const {project, target} = setup(), html = fixture('self.html').toString();
  const agent = runBatch(project, {ops: [{op: 'html_page', name: 'Ink & paper', html, width: 834}]}, '');
  assert.ok(agent.ok);
  const report = await importHtml({text: html}, person, target);
  assert.deepEqual(report.pages, [{id: project.pages[1].id, name: 'Ink & paper'}]);
  assert.deepEqual({...project.pages[1], id: ''}, {...agent.project.pages[1], id: ''});
  assert.deepEqual(project.space!.frames[project.pages[1].id], agent.project.space!.frames[agent.created[0]]);
  assert.equal(project.ledger!.changes.length, 1);
  assert.deepEqual(project.ledger!.changes[0].author, person.author);
  assert.equal(project.ledger!.changes[0].source, 'board:import-html');
});

test('the byte decoder prefers a BOM, then the real meta charset, and replaces bad UTF-8', async () => {
  for (const [bytes, name] of [
    [Buffer.from('<meta charset=windows-1252><title>Café</title>', 'latin1'), 'Café'],
    [Buffer.from('<title>Café</title>', 'latin1'), 'Caf�'],
    [Buffer.from('\ufeff<meta charset=windows-1252><title>Café</title>', 'utf16le'), 'Café'],
    [Buffer.from('<!-- <meta charset=windows-1252> --><title>Café</title>'), 'Café'],
  ] as const) {
    const {project, target} = setup();
    assert.equal((await importHtml({text: bytes}, person, target)).pages[0].name, name);
    assert.equal(frameWidth(project.space!.frames[project.pages[1].id]), 1440);
  }
});

test('a file or paste at the page limit fits, while large, empty and non-HTML documents return codes', async () => {
  const {project, target} = setup();
  const html = '<p>' + 'x'.repeat(MAX_PAGE_HTML - 3);
  assert.equal((await importHtml({text: html}, person, target)).pages[0].name, 'Sheet 1');
  for (const [name, text, code] of [['a.htm', html + 'x', 'too_large'], ['a.html', '  ', 'empty'],
    ['code.tsx', '<main>Hello</main>', 'not_html'], ['readme.md', '<b>Hello</b>', 'not_html'], ['', '# plain text', 'not_html']]) {
    assert.deepEqual((await importHtml({name, text}, person, target)).documents, [{name, code}]);
  }
  const file = new File(['<main>Hello</main>'], 'Demo.htm');
  assert.equal((await importHtml({text: file}, person, target)).pages[0].name, 'Demo.htm');
  assert.equal(project.ledger!.changes.length, 2);
});

test('the import refuses an agent, a forged person and untrusted input before reading anything', async () => {
  const {project, target} = setup();
  let reads = 0;
  const input = {names: ['a.html'], read: async () => { reads++; return fixture('self.html'); }, media: async () => { throw 'missing'; }};
  for (const d of [agentDispatch('agent', 'mcp'), {...person} as Dispatch, undefined]) {
    await assert.rejects(importHtml(input, d, target), e => e === 'person_only');
  }
  assert.equal(reads, 0);
  assert.equal(project.ledger?.changes.length ?? 0, 0);
});

function siblings() {
  const calls: string[] = [], kept = new Map<string, Uint8Array>();
  const read = async (name: string) => {
    calls.push(name);
    try { return fixture('siblings/' + name); } catch { throw 'missing'; }
  };
  return {calls, kept, source: {names: ['c.html', 'b.htm', 'a.html'], read, media: async (name: string) => {
    const bytes = await read(name);
    const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    kept.set(sha, bytes);
    return {sha, bytes: bytes.length, mime: 'application/octet-stream'};
  }}};
}

test('all top-level pages and their shared files land in one undoable change', async () => {
  const {project, target, history} = setup(), {source, calls, kept} = siblings();
  const before = structuredClone(designOf(project));
  const out = await importHtml(source, person, target);
  assert.deepEqual(out.pages.map(p => p.name), ['First', 'Second', 'c.html']);
  assert.equal(out.files.count, 6);
  assert.equal(out.files.bytes, ['photo.png', 'type.woff', 'film.mp4', 'sound.wav', 'styles/site.css', 'styles/type.css']
    .reduce((n, path) => n + fixture('siblings/' + path).length, 0));
  assert.equal(out.remote, 2);
  assert.deepEqual(out.skipped, [{name: 'local.js', code: 'script_mode'}, {name: 'missing.png', code: 'missing'}]);
  const html = project.pages[1].html!;
  assert.match(html, /@font-face/); assert.match(html, /@media screen and/);
  assert.match(html, /<script defer src="local.js"><\/script>/);
  assert.match(html, /srcset="media:[a-f0-9]{64} 1x, https:\/\/example.invalid\/large.png 2x"/);
  assert.match(html, /poster="media:[a-f0-9]{64}"/);
  assert.equal(calls.filter(n => n === 'photo.png').length, 1);
  assert.equal(kept.size, 4);
  const after = structuredClone(designOf(project));
  assert.equal(history.undo.length, 1);
  const undo = stepForScreen(project, 'undo', history, person.author)!.project;
  assert.deepEqual(JSON.parse(JSON.stringify(designOf(undo))), JSON.parse(JSON.stringify(before)));
  assert.deepEqual(undo.pages.flatMap(p => mediaNamed(p.html ?? '')), []);
  const redo = stepForScreen(undo, 'redo', history, person.author)!.project;
  assert.deepEqual(JSON.parse(JSON.stringify(designOf(redo))), JSON.parse(JSON.stringify(after)));
  for (const sha of mediaNamed(html)) assert.ok(kept.has(sha));
});

test('a nearly full board reads only the documents that fit, in name order', async () => {
  const {project, target} = setup(), {source, calls} = siblings();
  for (let i = 1; i < 29; i++) project.pages.push({id: 'prior-' + i, name: 'Prior', blocks: []});
  const out = await importHtml(source, person, target);
  assert.equal(project.pages.length, 30);
  assert.deepEqual(out.pages.map(p => p.name), ['First']);
  assert.deepEqual(out.documents, [{name: 'b.htm', code: 'board_limit'}, {name: 'c.html', code: 'board_limit'}]);
  assert.ok(!calls.includes('b.htm') && !calls.includes('c.html'));
});

test('escaped names, absolute paths, file URLs and an outside base never reach a disk read', async () => {
  const reads: string[] = [];
  for (const base of ['', '<base href="../away/">', '<base href="https://example.invalid/away/">']) {
    const {target} = setup();
    const refs = base ? ['near.png'] : ['../away.png', '/away.png', 'file:///away.png', '%2e%2e/away.png', 'C:\\away.png'];
    const html = base + refs.map(r => `<img src="${r}">`).join('') + '<img src="https://example.invalid/p.png">';
    const out = await importHtml({names: ['a.html'], read: async n => { if (n === 'a.html') return Buffer.from(html); reads.push(n); throw 'missing'; },
      media: async n => { reads.push(n); throw 'missing'; }}, person, target);
    assert.equal(out.pages.length, 1);
    for (const name of refs) assert.ok(out.skipped.some(i => i.name === name && ['outside', 'outside_base'].includes(i.code)), name);
  }
  assert.deepEqual(reads, []);
});

test('CSS recursion is bounded, raw end tags are reported, and comments or script text never choose a file', async () => {
  const map: Record<string, string> = {
    'a.html': '<link href="a.css" rel=stylesheet><script src="raw.js"></script><!-- <img src="fake.png"> --><script>const sample = \'<img src="fake.png">\'</script>',
    'a.css': '@import "b.css";', 'b.css': '@import "a.css"; @import "c.css";',
    'c.css': '@import "d.css";', 'd.css': '@import "e.css";', 'raw.js': 'const html = "</script>";',
  };
  const reads: string[] = [];
  const out = await importHtml({names: ['a.html'], read: async n => { reads.push(n); return Buffer.from(map[n]); },
    media: async n => { reads.push(n); throw 'missing'; }}, person, setup().target);
  assert.deepEqual(out.skipped.map(i => i.code), ['css_cycle', 'css_depth', 'raw_end_tag']);
  assert.ok(!reads.includes('fake.png') && !reads.includes('e.css'));
});

test('edits during a read survive and a switch to a different board cannot receive the pages', async () => {
  const {project, target} = setup();
  const source = {names: ['demo.html'], read: async () => { project.brief = 'Changed elsewhere'; return Buffer.from('<p>Hi</p>'); },
    media: async () => { throw 'missing'; }};
  await importHtml(source, person, target);
  assert.equal(project.brief, 'Changed elsewhere');
  const other = setup();
  await assert.rejects(importHtml({...source, read: async () => { target.current = other.target.current; return Buffer.from('<p>Hi</p>'); }}, person, target),
    e => e === 'board_changed');
  assert.equal(other.project.pages.length, 1);
});

test('an OS hand-over supplies only input and importing it requires the person’s own press', async () => {
  const {takeHtmlHandovers} = await import('../src/agent/dispatch');
  const {pickHtml} = await import('../src/import/native');
  const calls: [string, Record<string, unknown>][] = [];
  const fake = {__APHRODITE_IMPORT__: 'top-only', __TAURI_INTERNALS__: {invoke: async (cmd: string, args: Record<string, unknown>) => {
    calls.push([cmd, args]);
    if (cmd === 'html_import_take') return [{grant: 'os', names: ['a.html']}];
    if (cmd === 'html_import_read') return Uint8Array.from(Buffer.from('<p>Hello</p>')).buffer;
    return null;
  }}};
  Object.defineProperty(globalThis, 'window', {value: fake, configurable: true});
  try {
    await assert.rejects(pickHtml(false, agentDispatch('agent', 'loopback')), e => e === 'person_only');
    assert.equal(calls.length, 0);
    const [input] = await takeHtmlHandovers();
    assert.deepEqual(input.names, ['a.html']);
    assert.ok(!('dispatch' in input));
    const {project, target} = setup();
    await assert.rejects(importHtml(input, undefined, target), e => e === 'person_only');
    assert.equal(project.ledger?.changes.length ?? 0, 0);
    assert.equal((await importHtml(input, person, target)).pages.length, 1);
    assert.deepEqual(calls, [['html_import_take', {shell: 'top-only'}], ['html_import_read', {shell: 'top-only', grant: 'os', name: 'a.html', kind: 'document'}]]);
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});

test('HTML metadata comes from the document, including a late charset and an in-folder base', async () => {
  const {target, project} = setup();
  const html = '<!doctype html><!--' + ' '.repeat(1200) + '--><template><base href="../"><title>Template</title></template>' +
    '<meta charset=windows-1252><title>Café</title><base href="media/"><img src="image.png">';
  const reads: string[] = [];
  const out = await importHtml({names: ['a.html'], read: async () => Buffer.from(html, 'latin1'), media: async name => {
    reads.push(name); return {sha: '1'.repeat(64), mime: 'image/png', bytes: 5};
  }}, person, target);
  assert.equal(out.pages[0].name, 'Café');
  assert.deepEqual(reads, ['media/image.png']);
  assert.match(project.pages[1].html!, /media:1{64}/);
});

test('deferred scripts keep their external timing and integrity requirements stay in place', async () => {
  const {target, project} = setup(), reads: string[] = [];
  const html = '<html><head><script defer src="a.js"></script><link rel=stylesheet href="protected.css" integrity="sha384-test"></head><body><main>Ready</main></body></html>';
  const out = await importHtml({names: ['a.html'], read: async n => {
    reads.push(n); return Buffer.from(n === 'a.html' ? html : 'document.body.dataset.ready=1');
  }, media: async () => { throw 'missing'; }}, person, target);
  const stored = project.pages[1].html!;
  assert.equal(stored, html);
  assert.deepEqual(reads, ['a.html']);
  assert.deepEqual(out.skipped, [{name: 'a.js', code: 'script_mode'}, {name: 'protected.css', code: 'integrity'}]);
});

test('a document that exceeds the remaining design budget leaves its slot for a smaller page', async () => {
  const {project, target} = setup();
  for (let i = 1; i < 29; i++) project.pages.push({id: 'prior-' + i, name: 'Prior', blocks: [], kind: 'html',
    html: i <= 10 ? 'x'.repeat(1_870_000) : ''});
  target.commit = change => change();
  const input = {names: ['a.html', 'b.html'], read: async (name: string) => Buffer.from('<p>' + (name === 'a.html' ? 'x'.repeat(150_000) : 'Fits')),
    media: async () => { throw 'missing'; }};
  const out = await importHtml(input, person, target);
  assert.deepEqual(out.pages.map(p => p.name), ['b.html']);
  assert.deepEqual(out.documents, [{name: 'a.html', code: 'design_limit'}]);
});

test('source maps do not participate in bringing in a stylesheet', async () => {
  const {project, target} = setup();
  const read = async (n: string) => Buffer.from(n === 'a.html' ? '<link rel=stylesheet href="style.css">' : 'body{background:url(img.png)}/*# sourceMappingURL=data:text/plain,ignored */');
  const out = await importHtml({names: ['a.html'], read, media: async () => ({sha: '2'.repeat(64), bytes: 2, mime: 'image/png'})}, person, target);
  assert.deepEqual(out.skipped, []);
  assert.match(project.pages[1].html!, /media:2{64}/);
});

test('the shared page and board exporters carry the imported media', async () => {
  const {project, target} = setup(), {source, kept} = siblings();
  await importHtml(source, person, target);
  const {sniffBoardFile, MAX_MEDIA_BYTES} = await import('../src/free-page');
  const host = {maxBytes: MAX_MEDIA_BYTES, read: async (sha: string) => kept.get(sha), stat: async (sha: string) => {
    const bytes = kept.get(sha); return bytes && {mime: sniffBoardFile(bytes)!, bytes: bytes.length};
  }};
  const {exportPage} = await import('../src/page-export');
  const page = await exportPage(project.pages[1].html!, {scripts: true, videos: 'beside'}, host);
  assert.match(page.html, /data:font\/woff/);
  assert.match(page.html, /data:audio\//);
  assert.equal(page.beside.length, 1);
  const {writeBoardFile, readBoardFile} = await import('../src/board-file');
  const archive = await writeBoardFile(project, host);
  assert.deepEqual(archive.left, []);
  const copied = new Set<string>();
  const received = await readBoardFile(archive.bytes, {...host, put: async blob => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    copied.add(sha); return {sha, bytes: bytes.length, mime: blob.type};
  }});
  await received.place();
  assert.deepEqual(copied, new Set(kept.keys()));
  assert.equal(received.project.pages[1].html, project.pages[1].html);
});

test('text kinds and dot components cannot bring notes, data or hidden files into a page', async () => {
  const {target} = setup(), reads: string[] = [];
  const html = '<script src="notes.txt"></script><link rel=stylesheet href="data.csv"><script src=".env"></script><script src=".d/a.js"></script><img src="pic.txt"><script src="ok.cjs"></script>';
  const out = await importHtml({names: ['a.html'], read: async n => {
    reads.push(n); return Buffer.from(n === 'a.html' ? html : '1');
  }, media: async n => { reads.push(n); throw 'unsupported'; }}, person, target);
  assert.deepEqual(reads, ['a.html', 'ok.cjs']);
  assert.deepEqual(out.files.names, ['ok.cjs']);
  assert.deepEqual(out.skipped.map(i => i.name), ['notes.txt', 'data.csv', '.env', '.d/a.js', 'pic.txt']);
});

test('a UTF-16 meta label without a BOM decodes the UTF-8 title', async () => {
  const {target} = setup();
  assert.equal((await importHtml({text: Buffer.from('<meta charset="utf-16"><title>Café</title>')}, person, target)).pages[0]?.name, 'Café');
});

async function example(html: string, siblings: Record<string, string> = {}) {
  const {project, target} = setup();
  const reads: string[] = [], media = {sha: 'a'.repeat(64), mime: 'image/png', bytes: 7};
  const report = await importHtml({names: ['a.html'], read: async n => {
    reads.push(n);
    if (n === 'a.html') return Buffer.from(html);
    if (!(n in siblings)) throw 'missing';
    return Buffer.from(siblings[n]);
  }, media: async n => { reads.push(n); return media; }}, person, target);
  return {report, reads, html: project.pages[1]?.html};
}

test('double-escaped classic scripts and SVG scripts preserve the following main and paragraph', async () => {
  for (const html of ['<script src=a.js></script><main><p>x</p></main>', '<svg><script src=a.js></script></svg><main><p>x</p></main>']) {
    const r = await example(html, {'a.js': 'var s = "<!--<script>";'});
    assert.equal(r.html, html);
    assert.equal(r.report.files.count, 0);
    assert.equal(r.report.skipped[0].code, html.startsWith('<svg') ? 'namespace' : 'raw_end_tag');
  }
});

test('async, defer, module, nomodule, integrity and data scripts retain their external execution mode', async () => {
  for (const mode of ['async', 'defer', 'type=module', 'nomodule', 'integrity=""', 'type="application/json"']) {
    const html = '<script ' + mode + ' src=a.js></script>', r = await example(html, {'a.js': 'import("./dep.js")'});
    assert.equal(r.html, html);
    assert.deepEqual(r.reads, ['a.html']);
    assert.equal(r.report.skipped.length, 1);
  }
});

test('disabled and alternate sheets stay external, and a sheet that fails to parse stays linked', async () => {
  for (const link of ['<link disabled rel="stylesheet" href="theme.css">', '<link rel="alternate stylesheet" href="theme.css">', '<link rel=stylesheet href="theme.css">']) {
    const r = await example(link, {'theme.css': 'a{'});
    assert.equal(r.html, link);
    assert.equal(r.report.files.count, 0);
    assert.equal(r.report.skipped.length, 1);
  }
});

test('a closing style tag introduced by rewriting a CSS escape leaves the original stylesheet linked', async () => {
  const html = '<link rel=stylesheet href="theme.css"><main>x</main>';
  const r = await example(html, {'theme.css': String.raw`a{background:url("a.png#\3c /style>")}`});
  assert.equal(r.html, html);
  assert.equal(r.report.files.count, 0);
  assert.equal(r.report.skipped.at(-1)?.code, 'raw_end_tag');
});

test('only leading top-level imports are followed and charset and namespace stay legal', async () => {
  const r = await example('<link rel=stylesheet href="theme.css">', {
    'theme.css': '@import "first.css" screen; a{} @import "late.css"; @media screen{@import "nested.css";}',
    'first.css': '@charset "utf-8"; p{color:red}',
  });
  assert.deepEqual(r.reads, ['a.html', 'theme.css', 'first.css']);
  assert.doesNotMatch(r.html!, /@media screen\s*\{\s*@charset/i);
  assert.deepEqual(r.report.skipped.map(x => x.name), ['late.css', 'nested.css']);
  const ns = await example('<link rel=stylesheet href="a.css">', {'a.css': '@import "b.css" print;', 'b.css': '@namespace x "urn:x"; x|p{}'});
  assert.doesNotMatch(ns.html!, /@media print\s*\{\s*@namespace/);
  assert.ok(ns.report.skipped.some(x => x.code === 'css_namespace'));
});

test('image-set strings, remote candidates and invalid srcset descriptors are accounted before a read', async () => {
  const r = await example('<style>a{background:image-set("a.png" 1x, "https://example.invalid/b.png" 2x, url(invalid.png) 2q)}</style><img srcset="c.png 2q">');
  assert.deepEqual(r.reads, ['a.html', 'a.png']);
  assert.equal(r.report.remote, 1);
  assert.deepEqual(r.report.skipped.map(i => i.name), ['invalid.png', 'c.png']);
  assert.match(r.html!, /media:a{64}/);
});

test('a pending inspector rename flushed inside commit survives the final fit', async () => {
  const {project, target} = setup();
  const commit = target.commit;
  target.commit = (...args) => { project.pages[0].name = 'Typed before the press'; commit(...args); };
  const r = await importHtml({text: '<main>new</main>'}, person, target);
  assert.equal(project.pages[0].name, 'Typed before the press');
  assert.equal(r.pages[0].id, project.pages[1].id);
});

test('the batch and single-page fallback respect the live browser library including history reserve', async () => {
  const {project, target} = setup();
  for (let i = 0; i < 2; i++) project.pages.push({id: 'big' + i, name: 'Big', kind: 'html', blocks: [], html: 'x'.repeat(1_750_000)});
  const {BROWSER_LIBRARY_ESTIMATE} = await import('../src/workspace/library');
  const commit = target.commit;
  target.commit = (...args) => {
    target.storage = () => ({library: {version: 1, entries: []}, limit: {unit: 'chars', limit: BROWSER_LIBRARY_ESTIMATE}});
    commit(...args);
  };
  const r = await importHtml({names: ['a.html', 'b.html'], read: async n => Buffer.from('<p>' + (n === 'a.html' ? 'x'.repeat(500_000) : 'ok')),
    media: async () => { throw 'missing'; }}, person, target);
  assert.deepEqual(r.pages.map(p => p.name), ['b.html']);
  assert.deepEqual(r.documents, [{name: 'a.html', code: 'library_limit'}]);
});

test('a supplied photo clears its left-out mark for outgoing boards and pasted hashes stay withheld', async () => {
  const {project, target} = setup(), {source, kept} = siblings();
  const {outgoing} = await import('../src/board-file');
  const {createHash} = await import('node:crypto');
  const hash = createHash('sha256').update(fixture('siblings/photo.png')).digest('hex');
  project.leftOut = [hash];
  const host = {read: async (s: string) => kept.get(s), stat: async () => undefined};
  await importHtml({text: '<img src="media:' + hash + '">'}, person, target);
  assert.ok(outgoing(project, host).holds(hash));
  await importHtml({...source, names: ['b.htm']}, person, target);
  assert.ok(!outgoing(project, host).holds(hash));
  assert.deepEqual(await outgoing(project, host).host.read(hash), kept.get(hash));
});
