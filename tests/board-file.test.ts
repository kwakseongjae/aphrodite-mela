import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync, strToU8, type Zippable} from 'fflate';
import {readBoardFile, writeBoardFile, readZip, readOpenLink, openLink, checkEntries, contentId, BoardFileError, MAX_BOARD_FILE, BOARD_FILE} from '../src/board-file';
import {sizeOf} from '../src/ledger/types';
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
/** A host as src/free-page.ts makes them: an import's files are held until it keeps them, and only those it put here new can be taken back. */
const store = ({failAt}: {failAt?: number} = {}) => {
  const kept = new Map<string, Uint8Array>(), held = new Set<string>(), settled: [string[], boolean][] = [];
  let puts = 0;
  return {kept, held, settled, host: {maxBytes: 500 * 1024 * 1024,
    put: async (blob: Blob, options?: {holding?: true}) => { if (++puts === failAt) throw new Error('the disk is full'); const bytes = new Uint8Array(await blob.arrayBuffer()); const s = sha(bytes); if (!kept.has(s)) { kept.set(s, bytes); if (options?.holding) held.add(s); } else if (!options?.holding) held.delete(s); return {sha: s, mime: blob.type, bytes: bytes.length}; },
    settle: async (shas: string[], keep: boolean) => { settled.push([shas, keep]); for (const s of shas) if (held.delete(s) && !keep) kept.delete(s); },
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
  assert.equal(s.kept.size, 0, 'nothing is placed while the file is read');
  await got.place();
  assert.deepEqual([...s.kept.keys()], [PIC], 'placing puts its file on this board');
  await got.settle(true);
  assert.deepEqual(s.settled, [[[PIC], true]]);
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
  assert.throws(() => read('pages/free.html', n => { unpacked = n; }), /unpacks past the 10 bytes it declared/);
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
  const bytes = await files(twoFiles(), [new Uint8Array([...PNG, 7, 7])]);
  const s = store({failAt: 3});
  await s.host.put(new Blob([PNG], {type: 'image/png'}));
  const got = await readBoardFile(bytes, s.host);
  await assert.rejects(got.place(), /the disk is full/);
  assert.deepEqual([...s.kept.keys()], [PIC], 'the file this Mac had before stays; the one the import placed is gone');
  assert.equal(s.settled.length, 1);
  assert.equal(s.settled[0][1], false);
});

test('a received board sees only the files it carried: one it names but did not carry is missing here, even when this Mac has it', async () => {
  const p = twoFiles();
  const sent = await files(p);
  const s = store();
  await s.host.put(new Blob([new Uint8Array([...PNG, 7, 7])], {type: 'image/png'}));
  const got = await readBoardFile(sent, s.host);
  assert.deepEqual(got.left.map(l => l.file), [PIC2]);
  assert.ok(!JSON.stringify(got.project).includes(PIC2), 'nothing on the received board names the file it did not carry');
  await got.place();
  const again = readZip((await writeBoardFile(got.project, s.host)).bytes, 500 * 1024 * 1024).names;
  assert.ok(!again.some(n => n.includes(PIC2)), 'and sending it on does not carry this Mac\'s copy');
});

test('a file whose texts could unpack past what a board holds is refused before any is unpacked', () => {
  const a = new Uint8Array(5_900_000).fill(0x61);
  const p = board();
  const entries: Zippable = {'board.json': strToU8(JSON.stringify({...p, pages: Array.from({length: 11}, (_, i) => ({id: 'p' + i, name: 'P', blocks: [], kind: 'html'}))}))};
  for (let i = 0; i < 11; i++) entries[`pages/p${i}.html`] = [a, {level: 1}];
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

test('a page starting with a byte order mark or holding a lone surrogate comes back exactly as it went', async () => {
  const p = board();
  p.pages[1].html = '\ufeff<p>front</p><p>lone \ud800 and \udc00 halves</p>';
  const got = await readBoardFile(await written(p), store().host);
  assert.equal(got.project.pages[1].html, p.pages[1].html);
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

test('a picture from the image library goes with the board, and one it could not carry is missing where it lands', async () => {
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
  assert.ok(!JSON.stringify(got.project).includes(`local:${gone}`), 'the one not carried is not looked for in this Mac\'s library');
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
