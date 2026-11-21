import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync, strToU8, type Zippable} from 'fflate';
import {settleAgain, unsettledImports, readBoardFile, writeBoardFile, readZip, readOpenLink, openLink, checkEntries, contentId, BoardFileError, MAX_BOARD_FILE, BOARD_FILE} from '../src/board-file';
import {sizeOf} from '../src/ledger/types';
import {ensureSpace} from '../src/editor/space';
import {readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialProject, isApproved, fingerprint, parseProject, type Project} from '../src/model';
import {parseBatch} from '../src/agent/ops';
import {MAX_EXPORT_FILE} from '../src/page-export';

/**
 * 0.3-P3: a board file is someone else's. Nothing in it is taken on its word: names off a list, sizes
 * added up before anything is unpacked and held while it is, every page, file and change checked, and no
 * approval, ever. A received board is always a new board.
 */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const PIC = sha(PNG);
/** A host as src/free-page.ts and src-tauri/src/board.rs make them: each import places under its own ticket, and only what that import alone put here new can be taken back. `failAtNew` makes the nth new file fail to be put. */
const store = ({failAtNew, stuck = 0, keepFails = 0}: {failAtNew?: number; stuck?: number; keepFails?: number} = {}) => {
  const kept = new Map<string, Uint8Array>(), held = new Map<string, string>(), tickets = new Set<string>(), settled: [string, boolean][] = [];
  let fresh = 0, n = 0;
  return {kept, held, settled, host: {maxBytes: 500 * 1024 * 1024,
    hold: async () => { const t = 't' + ++n; tickets.add(t); return t; },
    put: async (blob: Blob, options?: {holding?: string}) => {
      const bytes = new Uint8Array(await blob.arrayBuffer()), s = sha(bytes), holding = options?.holding;
      if (holding !== undefined && !tickets.has(holding)) throw new Error('that import has ended');
      if (!kept.has(s)) { if (++fresh === failAtNew) throw new Error('the disk is full'); kept.set(s, bytes); if (holding !== undefined) held.set(s, holding); }
      else if (held.get(s) !== holding) held.delete(s);
      return {sha: s, mime: blob.type, bytes: bytes.length};
    },
    settle: async (ticket: string, keep: boolean) => {
      settled.push([ticket, keep]);
      if (!tickets.has(ticket)) return true;
      if (keep && keepFails > 0) { keepFails--; throw new Error('the keep did not go through'); }
      if (!keep && stuck > 0) { stuck--; return false; }
      for (const [s, owner] of [...held]) if (owner === ticket) { held.delete(s); if (!keep) kept.delete(s); }
      tickets.delete(ticket);
      return true;
    },
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
  // Laid out on the board, as every board the app saves is: where each frame stands goes with the board.
  ensureSpace(p);
  p.space!.frames.free = {...p.space!.frames.free, x: 777, y: 333};
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
  assert.deepEqual(got.project.space, p.space, 'each frame stands where it stood');
  assert.equal(got.project.approvedFingerprint, undefined);
  assert.equal(isApproved(got.project), false, 'no file gives an approval');
  assert.equal(s.kept.size, 0, 'nothing is placed while the file is read');
  await got.place();
  assert.deepEqual([...s.kept.keys()], [PIC], 'placing puts its file on this board');
  await got.settle(true);
  assert.deepEqual(s.settled, [['t1', true]]);
  assert.deepEqual([got.files, got.left], [1, []]);
  assert.deepEqual(got.project.ledger!.changes.map(c => c.author), [{kind: 'person', name: 'you', elsewhere: true}, {kind: 'agent', name: 'claude-code', elsewhere: true}], 'names kept, never taken for this Mac\'s person or agent');
  const saved = parseProject(JSON.stringify(got.project));
  assert.equal(saved.ledger!.changes[0].author.elsewhere, true, 'saving and reading again keeps where a change was made');
});

test('what board.json and the history say about approval and the board\'s own id is not read', async () => {
  const p = board();
  const files: Zippable = {'board.json': strToU8(JSON.stringify({...p, aphroditeBoardFile: 1, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))})), 'pages/0002.html': strToU8(p.pages[1].html!)};
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
  const zip = patched(zipSync({'board.json': strToU8('{}'), 'pages/0002.html': strToU8('/etc/passwd')}), 'pages/0002.html', (view, at) => { view.setUint16(at + 4, (3 << 8) | 20, true); view.setUint32(at + 38, (0o120777 << 16) >>> 0, true); });
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
  const blown = zipSync({'board.json': strToU8('{}'), 'pages/0002.html': [new Uint8Array(200 * 1024 * 1024), {level: 9}]});
  const zip = patched(blown, 'pages/0002.html', (view, entry) => view.setUint32(entry + 24, 10, true));
  assert.ok(zip.length < 1_000_000);
  const {read} = readZip(zip, 1);
  let unpacked = 0;
  assert.throws(() => read('pages/0002.html', n => { unpacked = n; }), /unpacks past the 10 bytes it declared/);
  assert.ok(unpacked <= 10 + 16 * 1024 * 1024, `it stopped after ${unpacked.toLocaleString('en')} bytes`);
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
  const json = strToU8(JSON.stringify({...p, aphroditeBoardFile: 1, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))}));
  await refused(zipSync({'board.json': json}), /the page free has no html in the file/);
  await refused(zipSync({'board.json': json, 'pages/0002.html': strToU8('<img src="file:///etc/passwd">')}), /a place on this machine/);
  await refused(zipSync({'board.json': json, 'pages/0002.html': new Uint8Array([0xff, 0xfe])}), /not UTF-8/);
  await refused(zipSync({'board.json': strToU8('{"pages":"no"}')}), /not a board/);
  await refused(zipSync({'board.json': strToU8('not json')}), /board\.json is not JSON/);
  await refused(zipSync({'board.json': strToU8(JSON.stringify({aphroditeBoardFile: 1, pages: []}))}), /board\.json: /);
});

test('a file whose bytes are not its name, or not a picture or a video, is left out and said so; the board still comes', async () => {
  const p = board();
  const json = strToU8(JSON.stringify({...p, aphroditeBoardFile: 1, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))}));
  const other = new Uint8Array([...PNG, 9]);
  const s = store();
  const got = await readBoardFile(zipSync({'board.json': json, 'pages/0002.html': strToU8(p.pages[1].html!), [`media/${PIC}.png`]: [other, {level: 0}]}), s.host);
  assert.deepEqual(got.left, [{file: PIC, why: 'its bytes are not the ones its name was made from'}]);
  assert.equal(s.kept.size, 0);
  const text = await readBoardFile(zipSync({'board.json': json, 'pages/0002.html': strToU8(p.pages[1].html!), [`media/${PIC}.png`]: strToU8('hello')}), store().host);
  assert.deepEqual(text.left, [{file: PIC, why: 'it is not the picture or video its name says'}]);
});

/* ---- 0.3-P3-fix1 #5 ---- */
const PIC2 = sha(new Uint8Array([...PNG, 7, 7]));
const twoFiles = (p = board()) => {
  p.pages[1].html += `<img src="media:${PIC2}">`;
  return p;
};
const files = async (p: Project, extra: Uint8Array[] = []) => { const s = store(); await s.host.put(new Blob([PNG], {type: 'image/png'})); for (const e of extra) await s.host.put(new Blob([e as Uint8Array<ArrayBuffer>], {type: 'image/png'})); return (await writeBoardFile(p, s.host)).bytes; };

test('a file that does not hold together refuses before anything is placed, however far in its fault is', async () => {
  const bytes = await files(twoFiles(), [new Uint8Array([...PNG, 7, 7])]);
  const zip = readZip(bytes, 500 * 1024 * 1024);
  const last = zip.names.filter(n => n.startsWith('media/')).sort().at(-1)!;
  // Break the last file's CRC in the central directory: the fault is found only when that file is read.
  const broken = bytes.slice();
  const at = Buffer.from(broken).lastIndexOf(Buffer.from(last));
  const header = at - 46;
  broken[header + 16] ^= 0xff;
  const s = store();
  await assert.rejects(readBoardFile(broken, s.host), /is not what its directory says/);
  assert.equal(s.kept.size, 0, 'no file was put anywhere');
});

test('placing that fails part way takes back only what it put here new, and a file this Mac had stays', async () => {
  const third = new Uint8Array([...PNG, 3, 3, 3]);
  const p = twoFiles();
  p.pages[1].html += `<img src="media:${sha(third)}">`;
  const bytes = await files(p, [new Uint8Array([...PNG, 7, 7]), third]);
  // PIC is here already; of the two the file brings new, the first is put and the second fails.
  const s = store({failAtNew: 3});
  await s.host.put(new Blob([PNG], {type: 'image/png'}));
  const got = await readBoardFile(bytes, s.host);
  await assert.rejects(got.place(), /the disk is full/);
  assert.deepEqual([...s.kept.keys()], [PIC], 'the file this Mac had stays; the one the import put before it failed is gone');
  assert.deepEqual(s.settled.map(x => x[1]), [false]);
});

test('a file two imports rely on is taken back by neither: one with no owner is left, never one another board names', async () => {
  const p = board();
  const bytes = await files(p);
  const s = store();
  const a = await readBoardFile(bytes, s.host), b = await readBoardFile(bytes, s.host);
  await a.place();
  await b.place();
  await a.settle(false);
  assert.ok(s.kept.has(PIC), 'A failing leaves the file B is about to keep');
  await b.settle(false);
  assert.ok(s.kept.has(PIC), 'and B failing too leaves it: a file with no owner, not a file lost');
  const c = await readBoardFile(bytes, s.host);
  await c.settle(false);
  assert.ok(s.kept.has(PIC), 'an import that placed nothing takes nothing back');
});

/* 0.3-P3-fix2 #5: a board received is kept word for word. A file it names and did not carry is listed as left out,
   and shows where this Mac has the same file: media are found by what they hold, so a board sent back and forth
   without a large video still shows it on the Mac that has it. */
test('a received board is kept word for word: a file it names and did not carry shows where this Mac has it, in a picture, a paragraph and a reason alike', async () => {
  const p = twoFiles();
  p.pages[1].html += `<p>The file media:${PIC2} is named here as words.</p>`;
  p.ledger!.changes[1].reason = `Put media:${PIC2} on the page.`;
  const sent = await files(p);
  const s = store();
  await s.host.put(new Blob([new Uint8Array([...PNG, 7, 7])], {type: 'image/png'}));
  const got = await readBoardFile(sent, s.host);
  assert.deepEqual(got.left.map(l => l.file), [PIC2], 'the one it did not carry is said');
  assert.equal(got.project.pages[1].html, p.pages[1].html, 'the page, picture address and words, is the one sent');
  assert.equal(got.project.ledger!.changes[1].reason, p.ledger!.changes[1].reason, 'and the reason');
  assert.deepEqual(got.project.ledger!.changes.map(c => c.ops), p.ledger!.changes.map(c => c.ops), 'and every change as it was recorded, so it undoes as it did');
  assert.ok(s.kept.has(PIC2), 'this Mac has that file, so the page shows it');
});

test('a file whose texts could unpack past what a board holds is refused before any is unpacked', () => {
  const a = new Uint8Array(5_900_000).fill(0x61);
  const p = board();
  const entries: Zippable = {'board.json': strToU8(JSON.stringify({...p, aphroditeBoardFile: 1, pages: Array.from({length: 11}, (_, i) => ({id: 'p' + i, name: 'P', blocks: [], kind: 'html'}))}))};
  for (let i = 0; i < 11; i++) entries[`pages/${String(i + 1).padStart(4, '0')}.html`] = [a, {level: 1}];
  const bytes = zipSync(entries);
  assert.ok(bytes.length < 2_000_000, `the file itself is small: ${bytes.length}`);
  assert.throws(() => readZip(bytes, 500 * 1024 * 1024), /its words come to more than/);
});

test('what the writer makes, the reader takes: too many entries is refused before a file is read', async () => {
  const p = board();
  const named = Array.from({length: 2_100}, (_, i) => createHash('sha256').update(String(i)).digest('hex'));
  p.pages[1].html = named.map(s => `<img src="media:${s}">`).join('');
  let reads = 0;
  const host = {stat: async () => ({mime: 'image/png', bytes: 12}), read: async () => { reads++; return PNG; }};
  await assert.rejects(writeBoardFile(p, host), /entries; a board file has at most 2,000/);
  assert.equal(reads, 0, 'refused before any file was read');
  assert.throws(() => checkEntries([{name: 'board.json', size: 10}, {name: `media/${PIC}.png`, size: MAX_BOARD_FILE - 10}], MAX_BOARD_FILE, {packed: true}), /comes to more than/, 'the zip around the entries is counted too');
});

test('a page starting with a byte order mark comes back exactly as it went, read from its own html entry', async () => {
  const p = board();
  p.pages[1].html = '\ufeff<p>front</p>';
  const bytes = await written(p);
  const zip = readZip(bytes, 500 * 1024 * 1024);
  assert.ok(zip.names.includes('pages/0002.html') || zip.names.some(n => /^pages\/.+\.html$/.test(n)), 'the page travels as its own entry');
  assert.ok(!new TextDecoder().decode(zip.read('board.json')).includes('front'), 'not inside board.json');
  const got = await readBoardFile(bytes, store().host);
  assert.equal(got.project.pages[1].html, p.pages[1].html);
});

/* 0.3-P3-fix2 #4: the desktop's save refuses half a surrogate pair on its own (src-tauri/src/workspace.rs, its test), so no file brings one in and none is written with one. */
test('half a surrogate pair on its own is refused by the writer, saying where, and by the reader, in any value', async () => {
  const p = board();
  p.pages[1].html = '<p>lone \ud800 half</p>';
  await assert.rejects(writeBoardFile(p, store().host), /the page "Free", its html holds half of a surrogate pair/);
  const q = board();
  q.ledger!.changes[1].reason = 'because \udc00';
  await assert.rejects(writeBoardFile(q, store().host), /ledger.*half of a surrogate pair/);
  const clean = await written();
  for (const [entry, change] of [['board.json', (j: Record<string, unknown>) => { j.name = 'a \ud800 b'; }], ['ledger/changes.json', (j: {changes: {reason?: string}[]}) => { j.changes[1].reason = 'x \udbff'; }]] as const) {
    const zip = readZip(clean, 500 * 1024 * 1024), files: Zippable = {};
    for (const n of zip.names) files[n] = zip.read(n);
    const json = JSON.parse(new TextDecoder().decode(files[entry] as Uint8Array));
    (change as (j: never) => void)(json as never);
    files[entry] = strToU8(JSON.stringify(json));
    await assert.rejects(readBoardFile(zipSync(files), store().host), /half of a surrogate pair/, entry);
  }
});


test('a received history is counted again once marked as made elsewhere, within its budget, and reads back the same', async () => {
  const got = await readBoardFile(await written(), store().host);
  for (const c of got.project.ledger!.changes) assert.equal(c.size, sizeOf(c), `${c.id}: its size is what it is saved as`);
  const saved = parseProject(JSON.stringify(got.project));
  assert.deepEqual(saved.ledger!.changes.map(c => [c.id, c.parent, c.size]), got.project.ledger!.changes.map(c => [c.id, c.parent, c.size]));
});

test('a picture is named by the same id the image library gives it (64-bit FNV-1a, as src-tauri/src/image_library.rs)', () => {
  const reference = (bytes: Uint8Array) => { let h = 0xcbf29ce484222325n; for (const b of bytes) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; } return h.toString(16).padStart(16, '0'); };
  for (const bytes of [new Uint8Array(), strToU8('one'), PNG, Uint8Array.from({length: 5000}, (_, i) => (i * 7919) & 255)]) assert.equal(contentId(bytes), reference(bytes));
  const rust = readFileSync(new URL('../src-tauri/src/image_library.rs', import.meta.url), 'utf8');
  assert.match(rust, /let mut hash: u64 = 0xcbf2_9ce4_8422_2325;[\s\S]*?hash \^= \*b as u64;\s*hash = hash\.wrapping_mul\(0x1000_0000_01b3\);/, 'and the library still names pictures that way');
});

test('a picture from the image library goes with the board, and one it could not carry is said to be left out, its name kept', async () => {
  const p = board();
  const pic = new Uint8Array([...PNG, 5, 5, 5]);
  const id = contentId(pic), gone = 'f'.repeat(16);
  p.pages[0].blocks = initialProject().pages[0].blocks;
  p.pages[0].blocks[0].image = `local:${id}`;
  p.pages[0].blocks[1].image = `local:${gone}`;
  const s = store();
  await s.host.put(new Blob([PNG], {type: 'image/png'}));
  const out = await writeBoardFile(p, {...s.host, local: async (want: string) => want === id ? {bytes: pic, mime: 'image/png'} : undefined});
  assert.deepEqual(out.left, [`local:${gone}`], 'the one this Mac does not have is said to be left out');
  assert.ok(readZip(out.bytes, 500 * 1024 * 1024).names.includes(`local/${id}.png`));
  const got = await readBoardFile(out.bytes, store().host);
  assert.deepEqual(got.pictures.map(x => [x.id, x.mime, x.read().length]), [[id, 'image/png', pic.length]]);
  assert.ok(JSON.stringify(got.project).includes(`local:${id}`));
  assert.ok(JSON.stringify(got.project).includes(`local:${gone}`), 'the one not carried keeps its name: it shows if this board\'s library has it');
  assert.deepEqual(got.left.map(l => l.file), [`local:${gone}`]);
});

/* 0.3-P3-fix2 #6: what the writer makes, the reader takes, and the reader reads every entry the file holds. */
test('pages whose ids differ only in case both travel: each page is an entry by its place, not its id', async () => {
  const p = board();
  p.pages.push({id: 'Page', name: 'Upper', blocks: [], kind: 'html', html: '<p>upper</p>'} as never, {id: 'page', name: 'Lower', blocks: [], kind: 'html', html: '<p>lower</p>'} as never);
  const bytes = await written(p);
  assert.ok(readZip(bytes, 500 * 1024 * 1024).names.includes('pages/0004.html'));
  const got = await readBoardFile(bytes, store().host);
  assert.deepEqual(got.project.pages.slice(-2).map(x => [x.id, x.html]), [['Page', '<p>upper</p>'], ['page', '<p>lower</p>']]);
});

test('a board just under what a board holds comes back: its history, marked as made elsewhere, gives way the way a save makes it', async () => {
  const p = board();
  for (let i = 0; i < 9; i++) p.pages.push({id: 'big' + i, name: 'Big ' + i, blocks: [], kind: 'html', html: '<p>' + 'a'.repeat(1_999_000) + '</p>'} as never);
  p.ledger!.changes.push(...Array.from({length: 200}, (_, i) => ({id: 'x' + i, parent: i ? 'x' + (i - 1) : 'c2', seq: 3 + i, at: '2026-11-20T00:00:02.000Z', author: {kind: 'person' as const, name: 'you'}, source: 'editor:change', ops: [{op: 'set', on: 'project', field: 'brief', value: 'b'.repeat(4_000)} as never], anchors: {pages: [], nodes: []}, baseRevision: 'r' + i, revision: 'r' + (i + 1), view: false, size: 0})));
  p.ledger!.seq = 202;
  // A last page filled until the saved board is 500 characters under what a board holds; the marks add more than that.
  p.pages.push({id: 'fill', name: 'Fill', blocks: [], kind: 'html', html: ''} as never);
  const fill = p.pages.at(-1)!;
  fill.html = '<p>' + 'f'.repeat(20_000_000 - 20_000 - JSON.stringify(p).length) + '</p>';
  let saved = parseProject(JSON.stringify(p));
  fill.html = '<p>' + 'f'.repeat(fill.html!.length - 7 + 20_000_000 - 500 - JSON.stringify(saved).length) + '</p>';
  saved = parseProject(JSON.stringify(p));
  assert.equal(JSON.stringify(saved).length, 20_000_000 - 500, 'just under what a board holds');
  const got = await readBoardFile(await written(saved), store().host);
  assert.ok(JSON.stringify(got.project).length <= 20_000_000, 'and it fits once more after the marks');
  assert.ok(got.project.ledger!.changes.every(c => c.author.elsewhere === true));
});

test('the words are counted as they are unpacked, and the reading stops at the page that passes what a board holds', async () => {
  const p = board();
  const entries: Zippable = {'board.json': strToU8(JSON.stringify({...p, aphroditeBoardFile: 1, ledger: undefined, pages: Array.from({length: 11}, (_, i) => ({id: 'p' + i, name: 'P', blocks: [], kind: 'html'}))}))};
  const a = new Uint8Array(1_950_000).fill(0x61);
  for (let i = 0; i < 11; i++) entries[`pages/${String(i + 1).padStart(4, '0')}.html`] = [a, {level: 1}];
  await refused(zipSync(entries), /more than 20,000,024 characters by pages\/0011\.html/);
});

test('a file holding an entry the board does not name, a newer format, or a file bigger than this host takes is refused whole', async () => {
  const clean = await written();
  const zip = readZip(clean, 500 * 1024 * 1024), files: Zippable = {};
  for (const n of zip.names) files[n] = zip.read(n);
  await refused(zipSync({...files, [`media/${'e'.repeat(64)}.png`]: [PNG, {level: 0}]}), /which the board does not name/);
  const newer = JSON.parse(new TextDecoder().decode(files['board.json'] as Uint8Array));
  newer.aphroditeBoardFile = 2;
  await refused(zipSync({...files, 'board.json': strToU8(JSON.stringify(newer))}), /made by a newer Aphrodite/);
  const small = {...store().host, maxBytes: 100 * 1024 * 1024};
  const big = zipSync({...files});
  const name = `media/${PIC}.png`, at = Buffer.from(big).lastIndexOf(Buffer.from(name)) - 46;
  new DataView(big.buffer).setUint32(at + 24, 101 * 1024 * 1024, true);
  await assert.rejects(readBoardFile(big, small), /may be at most 104,857,600/);
});

/* 0.3-P3-fix3 #6: the file's envelope is not counted against what a board holds; a folder entry holds nothing; and the
   history is counted with the rest as it is unpacked. */
test('a board one character under what a board holds, all of it sections, goes out and comes back', async () => {
  // Sections only: board.json is the whole board, and the file's own format is all it adds.
  const p = initialProject();
  delete p.ledger;
  const tmpl = p.pages[0].blocks[0];
  p.pages = Array.from({length: 30}, (_, i) => ({...p.pages[0], id: 'pg' + i, name: 'P' + i, blocks: Array.from({length: 40}, (_, j) => ({...tmpl, id: `b${i}-${j}`, text: 'x'.repeat(15_000)}))}));
  p.activePageId = 'pg0';
  // What is left up to one character under the cap, spread over the blocks from the last, each within what a text holds.
  let left = 20_000_000 - 1 - JSON.stringify(parseProject(JSON.stringify(p))).length;
  for (const block of p.pages.flatMap(g => g.blocks).reverse()) { if (!left) break; const more = Math.min(left, 4_000); block.text += 'y'.repeat(more); left -= more; }
  const saved = parseProject(JSON.stringify(p));
  assert.equal(JSON.stringify(saved).length, 19_999_999);
  const got = await readBoardFile(await written(saved), store().host);
  assert.equal(got.project.pages[29].blocks[39].text, p.pages[29].blocks[39].text);
});

test('a folder entry with something in it refuses the file', async () => {
  const zip = readZip(await written(), 500 * 1024 * 1024), files: Zippable = {};
  for (const n of zip.names) files[n] = zip.read(n);
  await refused(zipSync({...files, 'pages/': strToU8('abc')}), /pages\/ is a folder with something in it/);
  assert.ok(await readBoardFile(zipSync({...files, 'pages/': new Uint8Array(0)}), store().host), 'an empty one is a folder');
});

test('the history is counted with the pages as it is unpacked: one that takes the words past what a board holds refuses at it', async () => {
  const p = board();
  const entries: Zippable = {'board.json': strToU8(JSON.stringify({...p, aphroditeBoardFile: 1, ledger: undefined, pages: Array.from({length: 10}, (_, i) => ({id: 'p' + i, name: 'P', blocks: [], kind: 'html'}))}))};
  for (let i = 0; i < 10; i++) entries[`pages/${String(i + 1).padStart(4, '0')}.html`] = [new Uint8Array(1_950_000).fill(0x61), {level: 1}];
  entries['ledger/changes.json'] = [strToU8(JSON.stringify({seq: 1, changes: [], pad: 'x'.repeat(600_000)})), {level: 1}];
  await refused(zipSync(entries), /by ledger\/changes\.json/);
});

/* 0.3-P3-fix3 #9: the writer reads what the board names before its first wait: a page taken off the board meanwhile still goes. */
test('a board file carries the files its board named when the writing began, whatever happens to the board meanwhile', async () => {
  const p = twoFiles();
  const s = store();
  await s.host.put(new Blob([PNG], {type: 'image/png'}));
  await s.host.put(new Blob([new Uint8Array([...PNG, 7, 7])], {type: 'image/png'}));
  let first = true;
  const host = {...s.host, local: async () => { if (first) { first = false; p.pages.splice(1); } return undefined; }};
  p.pages[0].blocks.push({...p.pages[0].blocks[0], id: 'pic', image: 'local:0123456789abcdef'} as never);
  const {bytes} = await writeBoardFile(p, host);
  const names = readZip(bytes, 500 * 1024 * 1024).names;
  assert.ok(names.includes(`media/${PIC2}.png`), `the file of the page taken off meanwhile goes: ${names.join(', ')}`);
});

/* 0.3-P3-fix3 #9: an import's end that does not go through is not let go of: it is tried again before the next import. */
test('a take-back or a keep that did not go through is tried again before the next import, and a failed keep does not stop the board', async () => {
  await settleAgain();
  const s = store({failAtNew: 2, stuck: 1, keepFails: 1});
  const first = await readBoardFile(await files(twoFiles(), [new Uint8Array([...PNG, 7, 7])]), s.host);
  await assert.rejects(first.place(), /the disk is full/);
  assert.equal(unsettledImports(), 1, 'the take-back that could not remove its file is kept');
  const second = await readBoardFile(await files(board()), s.host);
  await second.place();
  assert.deepEqual(s.settled.slice(0, 2), [['t1', false], ['t1', false]], 'and tried again before the next import began');
  assert.equal(unsettledImports(), 0);
  await second.settle(true);
  assert.equal(unsettledImports(), 1, 'a keep that failed did not throw, and is kept to try again');
  await settleAgain();
  assert.equal(unsettledImports(), 0, 'and goes through the next time');
});

test('a history that does not hold together is dropped, the board kept', async () => {
  const p = board();
  const json = strToU8(JSON.stringify({...p, aphroditeBoardFile: 1, ledger: undefined, pages: p.pages.map(x => ({...x, html: undefined}))}));
  const got = await readBoardFile(zipSync({'board.json': json, 'pages/0002.html': strToU8(p.pages[1].html!), 'ledger/changes.json': strToU8('{"seq":1,"changes":[{"seq":5}]}')}), store().host);
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

test('macOS opens board files and aphrodite:// links with the app, which asks for nothing more', () => {
  const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  // tauri.conf.json cannot read src-tauri/board-file.json, so it is held to it here, word for word.
  assert.deepEqual(conf.bundle.fileAssociations, [{ext: [BOARD_FILE.extension], name: BOARD_FILE.name, description: BOARD_FILE.description, role: 'Editor', rank: 'Owner', mimeType: BOARD_FILE.mime, exportedType: {identifier: BOARD_FILE.type, conformsTo: ['public.zip-archive', 'public.data']}}]);
  const plist = readFileSync(new URL('../src-tauri/Info.plist', import.meta.url), 'utf8');
  assert.match(plist, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>aphrodite<\/string>\s*<\/array>/);
  assert.doesNotMatch(plist, /UsageDescription/, 'no camera, microphone or other ask rides along');
  const rust = readFileSync(new URL('../src-tauri/src/opened.rs', import.meta.url), 'utf8');
  assert.match(rust, /pub const MAX_BOARD_FILE: u64 = 1024 \* 1024 \* 1024;/);
  assert.equal(MAX_BOARD_FILE, 1024 * 1024 * 1024);
});

test('an approval in a received history cannot be sent back: the patch that would set it is refused', async () => {
  const got = await readBoardFile(await written(), store().host);
  const approval = got.project.ledger!.changes.flatMap(c => c.ops).find(op => (op as {field?: string}).field === 'approvedFingerprint');
  assert.ok(approval, 'the history someone sent holds their approval');
  const replay = parseBatch({reason: 'Replaying what they did.', patch: [{...approval, value: fingerprint(got.project)}]});
  assert.ok('error' in replay && /Approving a direction is the person's decision/.test(replay.error), JSON.stringify(replay));
});

/* The board file's name is the owner's to change in one line: its extension, MIME type and macOS type are in
   src-tauri/board-file.json, and nothing else in the repository spells the extension out. */
test('the board file is named in one place, and nothing else spells its extension', () => {
  const named = JSON.parse(readFileSync(new URL('../src-tauri/board-file.json', import.meta.url), 'utf8'));
  assert.deepEqual(BOARD_FILE, named);
  assert.match(BOARD_FILE.extension, /^[a-z0-9]{1,16}$/);
  const root = fileURLToPath(new URL('..', import.meta.url));
  const spelled = new RegExp(`\\.${BOARD_FILE.extension}(?![\\w.\\-:/!=]|\\s*[!=]==?)`, 'i');
  const skip = new Set(['node_modules', 'generated', 'vendor', 'target', 'bin', 'icons', 'dmg', 'dist', '.git', 'lab']);
  const found: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (skip.has(name)) continue; if (statSync(path).isDirectory()) walk(path); else if (/\.(ts|mjs|mts|js|rs|json|md|html|css|plist)$/.test(name)) { const rel = path.slice(root.length); if (rel === 'src-tauri/board-file.json' || rel === 'src-tauri/tauri.conf.json' || rel === 'package-lock.json') continue; readFileSync(path, 'utf8').split('\n').forEach((line, i) => { if (spelled.test(line)) found.push(`${rel}:${i + 1}`); }); } } };
  for (const dir of ['src', 'src-tauri', 'scripts', 'tests', 'mcp', 'docs']) walk(join(root, dir));
  assert.deepEqual(found, []);
});
