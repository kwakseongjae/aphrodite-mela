import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync, strToU8, type Zippable} from 'fflate';
import {readBoardFile, writeBoardFile, readZip, readOpenLink, openLink, BoardFileError, MAX_BOARD_FILE} from '../src/board-file';
import {initialProject, isApproved, fingerprint, parseProject, type Project} from '../src/model';
import {MAX_EXPORT_FILE} from '../src/page-export';

/**
 * 0.3-P3: a .aphrodite file is someone else's. Nothing in it is taken on its word: names off a list, sizes
 * added up before anything is unpacked and held while it is, every page, file and change checked, and no
 * approval, ever. A received board is always a new board.
 */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const PIC = sha(PNG);
const store = () => {
  const kept = new Map<string, Uint8Array>();
  return {kept, host: {maxBytes: 500 * 1024 * 1024, put: async (blob: Blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); const s = sha(bytes); kept.set(s, bytes); return {sha: s, mime: blob.type, bytes: bytes.length}; },
    stat: async (s: string) => kept.has(s) ? {mime: 'image/png', bytes: kept.get(s)!.length} : undefined, read: async (s: string) => kept.get(s)}};
};
function board(): Project {
  const p = initialProject();
  p.pages[0].blocks = [];
  p.pages.push({id: 'free', name: 'Free', blocks: [], kind: 'html', html: `<h1>Hi</h1><script>const shadowRoot = 1;</script><img src="media:${PIC}">`} as never);
  p.pages.push({id: 'pic', name: 'Pic', blocks: [], kind: 'media', media: {src: `media:${PIC}`, mime: 'image/png', width: 2, height: 2}} as never);
  p.ledger = {seq: 2, changes: [
    {id: 'c1', seq: 1, at: '2026-11-20T00:00:00.000Z', author: {kind: 'person', name: 'you'}, source: 'editor:change', ops: [{op: 'set', on: 'project', field: 'approvedFingerprint', value: 'x'} as never], anchors: {pages: [], nodes: []}, baseRevision: 'a', revision: 'b', view: false, size: 0},
    {id: 'c2', parent: 'c1', seq: 2, at: '2026-11-20T00:00:01.000Z', author: {kind: 'agent', name: 'claude-code'}, source: 'agent:apply', reason: 'Because.', ops: [], anchors: {pages: ['free'], nodes: []}, baseRevision: 'b', revision: 'c', view: false, size: 0},
  ]};
  p.approvedFingerprint = fingerprint(p);
  return p;
}
const written = async (p = board()) => { const s = store(); await s.host.put(new Blob([PNG], {type: 'image/png'})); return (await writeBoardFile(p, s.host)).bytes; };

test('a board goes out and comes back as a new board: its pages, its files and its history, with no approval', async () => {
  const p = board();
  assert.ok(isApproved(p), 'the board sent was approved');
  const bytes = await written(p);
  const s = store();
  const got = await readBoardFile(bytes, s.host);
  assert.notEqual(got.project.id, p.id, 'a received board is a new board');
  assert.deepEqual(got.project.pages.map(x => [x.id, x.name, x.kind]), p.pages.map(x => [x.id, x.name, x.kind]));
  assert.equal(got.project.pages[1].html, p.pages[1].html, 'the page is the one sent, scripts and all');
  assert.equal(got.project.approvedFingerprint, undefined);
  assert.equal(isApproved(got.project), false, 'no file gives an approval');
  assert.deepEqual([...s.kept.keys()], [PIC], 'its file is on this board before the board is given back');
  assert.deepEqual([got.files, got.left], [1, []]);
  assert.deepEqual(got.project.ledger!.changes.map(c => c.author), [{kind: 'person', name: 'you', elsewhere: true}, {kind: 'agent', name: 'claude-code', elsewhere: true}], 'names kept, never taken for this Mac\'s person or agent');
  const saved = parseProject(JSON.stringify(got.project));
  assert.equal(saved.ledger!.changes[0].author.elsewhere, true, 'saving and reading again keeps where a change was made');
});

test('what board.json and the history say about approval and the board\'s own id is not read', async () => {
  const p = board();
  const files: Zippable = {'board.json': strToU8(JSON.stringify({...p, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))})), 'pages/free.html': strToU8(p.pages[1].html!)};
  files['ledger/changes.json'] = strToU8(JSON.stringify(p.ledger));
  const got = await readBoardFile(zipSync(files), store().host);
  assert.equal(isApproved(got.project), false);
  assert.notEqual(got.project.id, p.id);
});

/** A zip whose directory entry for `name` is changed by `edit(view, at)`, `at` being where the entry starts. */
function patched(zip: Uint8Array, name: string, edit: (view: DataView, at: number) => void): Uint8Array {
  const out = zip.slice(), view = new DataView(out.buffer);
  let end = out.length - 22; while (view.getUint32(end, true) !== 0x06054b50) end--;
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    const length = view.getUint16(at + 28, true);
    if (String.fromCharCode(...out.subarray(at + 46, at + 46 + length)) === name) { edit(view, at); return out; }
    at += 46 + length + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  throw new Error(`no ${name}`);
}
const refused = async (bytes: Uint8Array, why: RegExp) => {
  const s = store();
  await assert.rejects(readBoardFile(bytes, s.host), (error: unknown) => error instanceof BoardFileError && why.test(error.message));
  assert.equal(s.kept.size, 0, 'nothing is put on the board');
};

test('a name a board file does not have refuses the whole file, before anything is unpacked', async () => {
  const ok = strToU8('{}');
  for (const name of ['../board.json', '/etc/passwd', 'pages/../board.json', 'pages\\free.html', `media/${'a'.repeat(63)}.png`, `media/${PIC}.exe`, 'evil.txt', 'pages/free.htm', 'ledger/other.json'])
    await refused(zipSync({'board.json': ok, [name]: ok}), /is not something a board file holds/);
  await refused(zipSync({'board.json': ok, 'pages/a\u0000b.html': ok}), /not plain text/);
  await refused(zipSync({'board.json': ok, 'BOARD.json': ok}), /twice/);
});

test('a link inside the file refuses it', async () => {
  const zip = patched(zipSync({'board.json': strToU8('{}'), 'pages/free.html': strToU8('/etc/passwd')}), 'pages/free.html', (view, at) => { view.setUint16(at + 4, (3 << 8) | 20, true); view.setUint32(at + 38, (0o120777 << 16) >>> 0, true); });
  await refused(zip, /is a link/);
});

test('sizes are added up from the directory and held to their caps before anything is unpacked', async () => {
  const base = zipSync({'board.json': strToU8('{}'), [`media/${PIC}.png`]: [PNG, {level: 0}]});
  await refused(patched(base, 'board.json', (view, at) => view.setUint32(at + 24, 60_000_001, true)), /board\.json unpacks to 60,000,001 bytes; it may be at most 60,000,000/);
  const many: Zippable = {'board.json': strToU8('{}')};
  for (let i = 0; i < 3; i++) many[`media/${String(i).repeat(64)}.mp4`] = strToU8('x');
  let zip: Uint8Array = zipSync(many);
  for (let i = 0; i < 3; i++) zip = patched(zip, `media/${String(i).repeat(64)}.mp4`, (view, at) => { view.setUint32(at + 24, 400 * 1024 * 1024, true); view.setUint16(at + 10, 8, true); });
  await refused(zip, /unpacks to more than 1,073,741,824 bytes/);
  assert.equal(MAX_BOARD_FILE, MAX_EXPORT_FILE);
});

test('an entry that unpacks past the size it declared is stopped while it unpacks', async () => {
  // 200 MB of zeros packs into a few hundred kilobytes; its directory says ten bytes.
  const blown = zipSync({'board.json': strToU8('{}'), 'pages/free.html': [new Uint8Array(200 * 1024 * 1024), {level: 9}]});
  const zip = patched(blown, 'pages/free.html', (view, entry) => view.setUint32(entry + 24, 10, true));
  assert.ok(zip.length < 1_000_000);
  const {read} = readZip(zip, 1);
  let unpacked = 0;
  const t0 = performance.now();
  assert.throws(() => read('pages/free.html', n => { unpacked = n; }), /unpacks past the 10 bytes it declared/);
  assert.ok(unpacked <= 10 + 16 * 1024 * 1024, `it stopped after ${unpacked.toLocaleString('en')} bytes`);
  assert.ok(performance.now() - t0 < 5_000);
});

test('an entry that is not what its directory says, encrypted, or packed another way refuses the file', async () => {
  const zip = zipSync({'board.json': [strToU8('{"version":1}'), {level: 0}]});
  const flipped = zip.slice(); flipped[30 + 'board.json'.length] ^= 1;
  await refused(flipped, /not what its directory says/);
  await refused(patched(zip, 'board.json', (view, at) => view.setUint16(at + 8, 1, true)), /encrypted/);
  await refused(patched(zip, 'board.json', (view, at) => view.setUint16(at + 10, 12, true)), /packed in a way/);
  await refused(new Uint8Array([1, 2, 3]), /not a zip/);
});

test('more entries than a board file has refuses it', async () => {
  const zip = zipSync({'board.json': strToU8('{}')});
  const many = zip.slice(); new DataView(many.buffer).setUint16(many.length - 22 + 8, 2001, true); new DataView(many.buffer).setUint16(many.length - 22 + 10, 2001, true);
  await refused(many, /2001 entries/);
});

test('each page is held to what a page may be, and a page with no html in the file refuses it', async () => {
  const p = board();
  const json = strToU8(JSON.stringify({...p, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))}));
  await refused(zipSync({'board.json': json}), /the page free has no html in the file/);
  await refused(zipSync({'board.json': json, 'pages/free.html': strToU8('<img src="file:///etc/passwd">')}), /a place on this machine/);
  await refused(zipSync({'board.json': json, 'pages/free.html': new Uint8Array([0xff, 0xfe])}), /not UTF-8/);
  await refused(zipSync({'board.json': strToU8('{"pages":"no"}')}), /not a board/);
  await refused(zipSync({'board.json': strToU8('not json')}), /board\.json is not JSON/);
  await refused(zipSync({'board.json': strToU8(JSON.stringify({pages: []}))}), /board\.json: /);
});

test('a file whose bytes are not its name, or not a picture or a video, is left out and said so; the board still comes', async () => {
  const p = board();
  const json = strToU8(JSON.stringify({...p, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))}));
  const other = new Uint8Array([...PNG, 9]);
  const s = store();
  const got = await readBoardFile(zipSync({'board.json': json, 'pages/free.html': strToU8(p.pages[1].html!), [`media/${PIC}.png`]: [other, {level: 0}]}), s.host);
  assert.deepEqual(got.left, [{file: PIC, why: 'its bytes are not the ones its name was made from'}]);
  assert.equal(s.kept.size, 0);
  const text = await readBoardFile(zipSync({'board.json': json, 'pages/free.html': strToU8(p.pages[1].html!), [`media/${PIC}.png`]: strToU8('hello')}), store().host);
  assert.deepEqual(text.left, [{file: PIC, why: 'it is not the picture or video its name says'}]);
});

test('a history that does not hold together is dropped, the board kept', async () => {
  const p = board();
  const json = strToU8(JSON.stringify({...p, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))}));
  const got = await readBoardFile(zipSync({'board.json': json, 'pages/free.html': strToU8(p.pages[1].html!), 'ledger/changes.json': strToU8('{"seq":1,"changes":[{"seq":5}]}')}), store().host);
  assert.equal(got.project.ledger, undefined);
});

test('a board too big for one file is refused before any of its files is read', async () => {
  let reads = 0;
  const p = board();
  await assert.rejects(writeBoardFile(p, {stat: async () => ({mime: 'video/mp4', bytes: MAX_BOARD_FILE}), read: async () => { reads++; return PNG; }}), /at most 1,073,741,824/);
  assert.equal(reads, 0);
});

/* The link an agent's reply carries and macOS hands the app; src-tauri/src/opened.rs reads the same table. */
const links = JSON.parse(readFileSync(new URL('./support/open-links.json', import.meta.url), 'utf8')) as {href: string; opens: {board: string; page?: string} | null}[];
test('an aphrodite:// link names a board and a page and nothing else', () => {
  assert.ok(links.length >= 20);
  for (const {href, opens} of links) assert.deepEqual(readOpenLink(href) ?? null, opens, href);
  assert.deepEqual(readOpenLink(openLink('b-1', 'p_2')), {board: 'b-1', page: 'p_2'});
  assert.deepEqual(readOpenLink(openLink('b-1')), {board: 'b-1'});
});
