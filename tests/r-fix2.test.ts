/**
 * 0.3-R fix 2 (Codex check2 of 0.3-R, 2026-11-24).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personOnlyRow, commandById} from '../src/agent/commands.mjs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const updates = readFileSync(new URL('../src/editor/updates.ts', import.meta.url), 'utf8');

/* 1 (high): every command that puts the board on disk back in place of the one in memory. Reloading and relaunching are
   the person's alone, by the table and in the handler, and relaunching goes the way closing the window goes: the board
   is saved first, and if it cannot be, the person is asked. */
test('relaunching is the person\'s alone and saves first, like closing; reloading stays theirs', () => {
  assert.equal(personOnlyRow('update-relaunch'), 'outside.relaunch');
  assert.equal(commandById['outside.relaunch'].author, 'person-only');
  assert.equal(personOnlyRow('disk-reload'), 'outside.disk-reload');
  assert.match(main, /if\(act==='update-relaunch'&&refusal\(d,'outside\.relaunch'\)\)return;/, 'the handler asks who pressed, before anything');
  assert.match(updates, /case 'update-relaunch': \{\n(?:\s*\/\/.*\n)*\s*try\{const \{relaunch\}=await import\('@tauri-apps\/plugin-process'\);await host\.leaving\(async\(\)=>\{(?:try\{)?await relaunch\(\);/, 'and relaunches through the close (its code loaded first, 0.3-R fix 3 #16)');
  assert.match(main, /leaving:go=>closer\.request\(go\)/, 'which main gives as the window\'s close');
});

/* 13 (high): the list of files a board came without is never cut. An import that names more than a board can list is
   refused, saying why; a list a read cannot trust holds back every file of this Mac's. */
import {importedProject} from '../src/workspace/library.ts';
import {initialProject, parseProject, MAX_LEFT_OUT, type Project} from '../src/model.ts';
import {outgoing} from '../src/board-file.ts';
const sha = (n: number) => n.toString(16).padStart(64, '0');
test('a project file naming more files than a board can list is refused, saying so', () => {
  const p = initialProject();
  p.pages.push({id: 'many', name: 'Many', blocks: [], kind: 'html', html: Array.from({length: MAX_LEFT_OUT + 1}, (_, i) => `media:${sha(i + 1)}`).join(' ')} as never);
  assert.throws(() => importedProject(JSON.stringify(p), {version: 1, entries: []}), /names \d[\d,]* files/);
});
test('a list a read cannot trust holds back every file of this Mac\'s, picture and library alike', async () => {
  const p = {...initialProject(), leftOut: ['not a file']} as unknown as Project;
  const read = parseProject(JSON.stringify(p));
  assert.deepEqual(read.leftOut, ['*'], 'read as "everything"');
  const host = {stat: async (_: string) => ({mime: 'image/png', bytes: 4}), read: async (_: string) => new Uint8Array(4)};
  const go = outgoing(read, host, async () => ({bytes: new Uint8Array(4), mime: 'image/png'}));
  assert.equal(await go.host.stat(sha(7)), undefined);
  assert.equal(await go.local!('0123456789abcdef'), undefined);
  const long = parseProject(JSON.stringify({...initialProject(), leftOut: Array.from({length: MAX_LEFT_OUT + 1}, (_, i) => sha(i))}));
  assert.deepEqual(long.leftOut, ['*'], 'a list longer than a board keeps is not cut: it holds back everything');
});

/* 14 (high): a picture of a page an agent asks for is drawn the way the page goes out: what the board came without is not in it. */
import {renderDocument} from '../src/free-page.ts';
test('an agent\'s render draws a page without the files the board came without; the person\'s frames still show them', async () => {
  const mine = sha(42);
  const p = {...initialProject(), leftOut: [mine]} as Project;
  const host = {origins: [], stat: async (_: string) => ({mime: 'image/png', bytes: 4}), read: async (_: string) => new Uint8Array(4), frameCost: async (_: string) => 40, frameMedia: async (_: string) => 'data:image/png;base64,AAAA', mediaUrl: async (_: string) => 'blob:x'};
  const page = {html: `<img src="media:${mine}">`};
  assert.match(await renderDocument(page, host as never), /data:image\/png;base64,AAAA/, 'the board shows it where this Mac has it');
  assert.doesNotMatch(await renderDocument(page, outgoing(p, host).host as never), /data:image\/png;base64,AAAA/, 'an agent\'s picture of it does not');
  assert.match(main, /'render_free_page',\{html:await renderDocument\(page,outgoing\(project,frameHost\)\.host\)/);
});

/* 5: an open that waited behind another runs only if Home is still where it was asked; a handler that waited writes only
   within the opening of the board it began in. */
test('queued opens and late handlers keep to the screen and the opening they began in', () => {
  assert.match(main, /function openProject\(next:Project\)\{editSession\+\+;/);
  assert.match(main, /function sameBoard\(\):\(\)=>boolean\{const id=project\.id,session=editSession;return \(\)=>\{if\(screen==='editor'&&project\.id===id&&editSession===session\)return true;/);
  const open = main.slice(main.indexOf("case 'hub-open':"), main.indexOf("case 'hub-open':") + 400);
  assert.match(open, /await leave\(\(\)=>\{\n[^\n]*\n\s*if\(screen!=='home'\)(?:return;|\{d\.outcome=)/);
  const demo = main.slice(main.indexOf("case 'demo-reference':"), main.indexOf('\n', main.indexOf("case 'demo-reference':")));
  assert.ok(demo.indexOf('if (!here()) break;') > demo.indexOf('await readImage('), 'the sample reference, after its fetch');
  assert.match(main, /const assign=\(image:string\)=>\{if\(!here\(\)\)return;/, 'a collection picture');
});

/* 6: the whole batch is looked at, a batch that is not well formed is a 400 all the way out, and the examples follow the rule. */
import {parseBatch} from '../src/agent/ops.ts';
import {mcpTools} from '../src/agent/commands.mjs';
test('after a page the batch makes, its ops need no page_id, but the selection is still refused; a refusal is a 400; the example follows the rule', () => {
  const made = parseBatch({reason: 'r', base_revision: 'r2:1:2:3', ops: [{op: 'page', name: 'New'}, {op: 'add', component_kind: 'hero'}]});
  assert.ok('batch' in made);
  const later = parseBatch({reason: 'r', base_revision: 'r2:1:2:3', ops: [{op: 'page', name: 'New'}, {op: 'update', block_id: 'selection', fields: {title: 'x'}}]});
  assert.ok('error' in later && /selection/.test(later.error));
  assert.match(main, /if\('error' in parsed\)return \{error:parsed\.error,status:400\};\n\s*const result=await applyBatch\(/);
  assert.match(readFileSync(new URL('../src-tauri/src/agent.rs', import.meta.url), 'utf8'), /\(400 \| 403 \| 409 \| 423, _\) => asked as u16/);
  const apply = JSON.stringify(mcpTools().find(t => t.name === 'aphrodite_apply_edits'));
  for (const example of apply.match(/\{\\"reason\\"[^']*?\]\}/g) ?? []) if (example.includes('base_revision')) assert.doesNotMatch(example, /\\"selection\\"/, example.slice(0, 120));
});

/* 16: a browser tab closed with work not saved asks first. */
test('the browser build warns before a tab with unsaved work is closed', () => {
  assert.match(main, /window\.addEventListener\('beforeunload',e=>\{(?:saveTyping\(\);)?if\(!lastSaved\|\|leaving\)\{e\.preventDefault\(\);e\.returnValue='';\}\}\);/);
});

/* 18: an export that held a library picture back says to put it on the board again. A person doing that is enough: it
   comes off the list (saved even when the board already showed it), and the notice counts from the lookup the export makes. */
import {readBoardFile, writeBoardFile} from '../src/board-file.ts';
import * as bf from '../src/board-file.ts';
test('doing what the notice says sends the picture: putting it back takes it off the list, and the notice counts what the export holds back', async () => {
  const PIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]), ID = bf.contentId(PIC);
  const counted = (bf as unknown as Record<string, unknown>).outgoingCount as (p: Project, go: ReturnType<typeof outgoing>) => Promise<{count: number; bytes: number; locals: number; held: number; all: boolean}>;
  assert.equal(typeof counted, 'function', 'board-file.ts exports outgoingCount');
  const p = {...initialProject(), reference: `local:${ID}`, leftOut: [`local:${ID}`, sha(9)]} as Project;
  const files = {stat: async (_: string) => undefined, read: async (_: string) => undefined};
  const local = async (id: string) => id === ID ? {bytes: PIC, mime: 'image/png'} : undefined;
  const store = {maxBytes: 1 << 20, put: async (blob: Blob) => ({sha: sha(blob.size), mime: blob.type, bytes: blob.size})};
  const send = async () => { const go = outgoing(p, files, local); const out = await writeBoardFile(p, {...go.host, local: go.local}); return {go, pictures: (await readBoardFile(out.bytes, store)).pictures.length}; };
  let sent = await send();
  assert.equal(sent.pictures, 0, 'held back');
  assert.deepEqual(await counted(p, outgoing(p, files, local)), {count: 0, bytes: 0, locals: 0, held: 1, all: false, pictures: 0}, 'and the notice says one');
  assert.equal(bf.carriedNow(p, [sha(8)]), false, 'a file not on the list changes nothing, so nothing is saved');
  assert.equal(bf.carriedNow(p, [`local:${ID}`]), true, 'putting it back changes the list, so the board is saved though the design is the same');
  assert.deepEqual(p.leftOut, [sha(9)]);
  sent = await send();
  assert.equal(sent.pictures, 1, 'and now it goes out');
  assert.deepEqual(await counted(p, outgoing(p, files, local)), {count: 0, bytes: 0, locals: 1, held: 0, all: false, pictures: 0});
  const apply = main.slice(main.indexOf("case 'apply-local':"), main.indexOf("case '", main.indexOf("case 'apply-local':") + 20));
  assert.equal((apply.match(/freed\(\)/g) ?? []).length, 3, 'whether it went on a section, became the reference, or is on the board already');
  assert.match(apply, /\}else if\(localRefsIn\(project\)\.includes\(id\)&&freed\(\)\)toast\(/, 'a picture the board already shows, the reference say, is freed by pressing it, and said so only when it was');
  assert.match(apply, /const freed=\(\)=>\{if\(d\.author\.kind==='person'&&carriedNow\(project,\[src\]\)\)\{persist\(\);return true;\}return false;\};/);
  assert.match(main, /function carriedSummary\(board:Project\):Promise<string>\{\n\s*const go=outgoing\(board,frameHost,id=>resolveLocalBytes\(id,board\.id\)\);const \{count,bytes,locals,held,all,pictures\}=await outgoingCount\(board,go\);/);
});
test('a board whose list could not be read does not tell the person to put a file back, since that cannot send it', () => {
  assert.match(main, /function withheldNote\(n:number,all=false\)/);
  assert.match(main, /withheldNote\(go\.withheld\.size,go\.all\)/);
});

/* 19: what a read or an import adds after the cap was checked (an approval in today's form, a clearing recorded, the list of
   files a board came without) is held to the cap on the text that is written: the history gives way, the approval and the
   list are kept whole. */
import {emptyLedger, record, designOf} from '../src/ledger/ledger.ts';
import {APPROVAL_CLEARED, SYSTEM} from '../src/ledger/types.ts';
import {readLibrary, LIBRARY_KEY} from '../src/workspace/library.ts';
import {MAX_PROJECT} from '../src/model.ts';
/** A board `under` characters under the cap with its history, naming `refs` files, its history `changes` big edits long. */
function nearCap(refs: number, under: number, changes: number, extra: Partial<Project> = {}): Project {
  let p = initialProject(); delete p.ledger;
  if (refs) p.pages.push({id: 'many', name: 'Many', blocks: [], kind: 'html', html: Array.from({length: refs}, (_, i) => `<img src="media:${sha(i + 1)}">`).join('')} as never);
  const ledger = emptyLedger();
  for (let i = 0; i < changes; i++) { const next = JSON.parse(JSON.stringify(p)) as Project; next.brief = String.fromCharCode(97 + i % 26).repeat(20_000); record(ledger, p, next, {author: {kind: 'person', name: 'D'}, source: 'editor:change'}); p = next; }
  p = {...p, ...extra, ledger};
  for (let n = 0; ; n++) {
    const left = MAX_PROJECT - under - JSON.stringify(p).length;
    if (left <= 0) break;
    const page = {id: 'pad' + n, name: 'Pad', blocks: [], kind: 'html', html: ''};
    p.pages.push(page as never);
    page.html = 'x'.repeat(Math.max(0, Math.min(1_900_000, MAX_PROJECT - under - JSON.stringify(p).length)));
  }
  assert.equal(JSON.stringify(p).length, MAX_PROJECT - under);
  return p;
}
test('a project file is held to the cap with the list of files it names, the list whole', () => {
  const p = nearCap(3000, 100_000, 25);
  const got = importedProject(JSON.stringify(p), {version: 1, entries: []});
  assert.equal(got.leftOut?.length, 3000);
  assert.ok(JSON.stringify(got).length <= MAX_PROJECT, `${JSON.stringify(got).length} characters`);
  assert.ok(got.ledger?.changes.length, 'its history gave way, not all of it');
});
test('a board file is held to the cap with the list of files it came without, before a file of it is placed', async () => {
  const p = nearCap(3000, 100_000, 25);
  const none = {stat: async (_: string) => undefined, read: async (_: string) => undefined};
  const written = await writeBoardFile(p, none);
  const got = await readBoardFile(written.bytes, {maxBytes: 500 * 1024 * 1024, put: async () => { throw new Error('nothing is placed'); }});
  assert.equal(got.project.leftOut?.length, 3000);
  assert.ok(JSON.stringify(got.project).length <= MAX_PROJECT, `${JSON.stringify(got.project).length} characters`);
});
test('a library read that records a stale approval\'s clearing holds the board to the cap before it is written back', () => {
  const p = nearCap(0, 10, 3, {approvedFingerprint: 'stale'});
  const values = new Map<string, string>([[LIBRARY_KEY, JSON.stringify({version: 1, entries: [{project: p, createdAt: '2026-11-24T00:00:00.000Z', updatedAt: '2026-11-24T00:00:00.000Z', pinned: false, archived: false}]})]]);
  const read = readLibrary({getItem: (k: string) => values.get(k) ?? null, setItem: () => {}} as never);
  const got = read.entries[0].project;
  assert.equal(got.approvedFingerprint, undefined);
  assert.equal(got.ledger?.changes.at(-1)?.reason, APPROVAL_CLEARED, 'the clearing is recorded');
  assert.ok(JSON.stringify(got).length <= MAX_PROJECT, `${JSON.stringify(got).length} characters`);
});

/* 20: a media batch is held to the library's cap before a file is copied, on a stand-in no shorter than any real file's entry;
   what can be known only from the bytes is known after the copy, so the files a batch copied are staged until it lands, and a
   batch refused after the copy lets go of the ones it was the first to bring. */
import {preflightBatch, runBatch, importMedia} from '../src/agent/apply.ts';
test('a media batch past the library\'s cap is refused before a file is copied, and the stand-in is no shorter than a real entry', () => {
  const batch = {ops: [{op: 'media_add' as const, library_id: '0123456789abcdef', name: 'Shot'}], patch: []};
  let seen = 0;
  const refused = (preflightBatch as unknown as (p: Project, b: unknown, s: string, fits?: (r: {project: Project; designChars: number}) => string | undefined) => {error: string} | undefined)(initialProject(), batch, '', r => { seen = JSON.stringify(designOf(r.project)).length; return 'the library is full'; });
  assert.match(refused?.error ?? '', /the library is full/, 'the library is asked on the dry run');
  for (const media of [
    {src: `media:${sha(1)}`, mime: 'image/png', width: 1, height: 1},
    {src: `media:${sha(2)}`, mime: 'image/jpeg', width: 20_000, height: 20_000},
    {src: `media:${sha(3)}`, mime: 'video/webm', width: 240, height: 20_000, duration: 86_399.99},
    {src: `media:${sha(4)}`, mime: 'video/webm', width: 19_999, height: 19_999, duration: 86_399.99},
  ]) {
    const real = runBatch(initialProject(), batch as never, '', {0: media});
    assert.ok(real.ok);
    // 0.3-R fix 3 #13: the stand-in is the shortest an entry can be, so only a batch that cannot fit is refused before the copy.
    assert.ok(JSON.stringify(designOf(real.project)).length >= seen, `${media.mime} ${media.width}x${media.height} is no shorter than the stand-in`);
  }
});
test('the files a batch copies are staged, and one that fails partway lets go of them; applyBatch lets go of them unless it lands', async () => {
  const asked: {stage?: boolean}[] = [], released: [string[], boolean][] = [];
  const host = {importFile: async (ask: {stage?: boolean}) => { asked.push(ask); return {sha: sha(asked.length), mime: 'image/png', bytes: 4}; }, mediaUrl: async () => 'blob:x', releaseMedia: async (shas: string[], keep: boolean) => { released.push([shas, keep]); }};
  let n = 0;
  const measure = async () => { if (++n === 2) throw new Error('it could not be read'); return {width: 1, height: 1}; };
  const got = await importMedia([{op: 'media_add', library_id: '0123456789abcdef'}, {op: 'media_add', library_id: '0123456789abcdee'}] as never, 'inApp', host as never, 'p', measure);
  assert.ok('error' in got);
  assert.deepEqual(asked.map(a => a.stage), [true, true], 'each copy is staged');
  assert.deepEqual(released, [[[sha(1), sha(2)], false]], 'both are let go of, the one that could not be measured too');
  const body = main.slice(main.indexOf('async function applyBatch('), main.indexOf('\n}\n', main.indexOf('async function applyBatch(')));
  assert.match(body, /preflightBatch\(project,held,selected,r=>libraryRefusal\(library,project,r\.project,/, 'the library is asked before the copy');
  assert.match(body, /await frameHost\.releaseMedia\(staged,answer\??\.ok===true\)/, 'one place lets go of the files, keeping them only when the batch landed');
  const drop = main.slice(main.indexOf('async function putMedia('), main.indexOf('\n}\n', main.indexOf('async function putMedia(')));
  assert.ok(drop.indexOf('preflightBatch(project,') > 0 && drop.indexOf('preflightBatch(project,') < drop.indexOf('frameHost.put('), 'a drop or a paste asks the library before a file is kept too');
});

/* 21: the copies frames in this window show are named on each write, so the desktop never clears one under a frame. */
test('a frame\'s copy is written with the names of the copies the window\'s frames show now', () => {
  const page = readFileSync(new URL('../src/free-page.ts', import.meta.url), 'utf8');
  assert.match(page, /const live = new Set\(\[\.\.\.shown\]\.filter\(\(\[f\]\) => f !== frame && f\.isConnected\)\.map\(\(\[, name\]\) => name\)\);/, 'the frames in the window now: one taken out for a moment keeps its place in the list for when it is back');
  assert.match(page, /if \(shown\.size > 1024\) for \(const f of shown\.keys\(\)\) if \(!f\.isConnected\) shown\.delete\(f\);/, 'a frame not in the window is forgotten only when the list has grown long');
  assert.match(page, /native\.invoke<string>\('free_page_write', \{page, key, html: doc, shown: \[\.\.\.live\]\}\)/);
  assert.match(readFileSync(new URL('../src-tauri/src/board.rs', import.meta.url), 'utf8'), /pub fn free_page_write\(app: AppHandle, page: String, key: String, html: String, shown: Option<Vec<String>>\)/);
});

/* 9 (low): the single-project form before the library drops a stale approval with the clearing in the board's own ledger too. */
import {LEGACY_KEY} from '../src/workspace/library.ts';
test('moving the single-project form into the library records the clearing of a stale approval', () => {
  const p = {...initialProject(), approvedFingerprint: 'stale'};
  const values = new Map<string, string>([[LEGACY_KEY, JSON.stringify(p)]]);
  const read = readLibrary({getItem: (k: string) => values.get(k) ?? null, setItem: () => {}} as never);
  const got = read.entries[0].project;
  assert.equal(got.approvedFingerprint, undefined);
  assert.equal(got.ledger?.changes.at(-1)?.reason, APPROVAL_CLEARED);
  assert.deepEqual(got.ledger?.changes.at(-1)?.author, SYSTEM, 'by the system');
});
