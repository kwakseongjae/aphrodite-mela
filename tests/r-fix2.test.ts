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
