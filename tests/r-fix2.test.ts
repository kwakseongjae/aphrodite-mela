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
