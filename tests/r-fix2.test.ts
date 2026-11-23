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
  assert.match(updates, /case 'update-relaunch': \{\n\s*try\{await host\.leaving\(async\(\)=>\{const \{relaunch\}=await import\('@tauri-apps\/plugin-process'\);await relaunch\(\);\}\);\}/, 'and relaunches through the close');
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
  assert.match(open, /await leave\(\(\)=>\{\n[^\n]*\n\s*if\(screen!=='home'\)return;/);
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
  assert.match(main, /window\.addEventListener\('beforeunload',e=>\{if\(!lastSaved\|\|leaving\)\{e\.preventDefault\(\);e\.returnValue='';\}\}\);/);
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
  assert.deepEqual(await counted(p, outgoing(p, files, local)), {count: 0, bytes: 0, locals: 0, held: 1, all: false}, 'and the notice says one');
  assert.equal(bf.carriedNow(p, [sha(8)]), false, 'a file not on the list changes nothing, so nothing is saved');
  assert.equal(bf.carriedNow(p, [`local:${ID}`]), true, 'putting it back changes the list, so the board is saved though the design is the same');
  assert.deepEqual(p.leftOut, [sha(9)]);
  sent = await send();
  assert.equal(sent.pictures, 1, 'and now it goes out');
  assert.deepEqual(await counted(p, outgoing(p, files, local)), {count: 0, bytes: 0, locals: 1, held: 0, all: false});
  const apply = main.slice(main.indexOf("case 'apply-local':"), main.indexOf("case '", main.indexOf("case 'apply-local':") + 20));
  assert.match(apply, /if\(d\.author\.kind==='person'&&carriedNow\(project,\[src\]\)\)persist\(\);/, 'the person\'s press frees it and saves');
  assert.equal((apply.match(/freed\(\);/g) ?? []).length, 2, 'whether it went on a section or became the reference');
  assert.match(main, /function carriedSummary\(board:Project\):Promise<string>\{\n\s*const go=outgoing\(board,frameHost\);const \{count,bytes,locals,held,all\}=await outgoingCount\(board,go\);/);
});
test('a board whose list could not be read does not tell the person to put a file back, since that cannot send it', () => {
  assert.match(main, /function withheldNote\(n:number,all=false\)/);
  assert.match(main, /withheldNote\(go\.withheld\.size,go\.all\)/);
});
