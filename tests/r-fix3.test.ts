/**
 * 0.3-R fix 3 (Codex check3 of 0.3-R, 2026-11-24).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject, type Project} from '../src/model.ts';
import {outgoing} from '../src/board-file.ts';
import * as bf from '../src/board-file.ts';
import {renderDocument} from '../src/free-page.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const sha = (n: number) => n.toString(16).padStart(64, '0');
const body = (name: string) => { const start = main.indexOf(name); return main.slice(start, main.indexOf('\n}\n', start)); };

/* 7a (high): an agent's render may load the files that render was given and no other. Its policy names each one, not the
   app's whole asset origin, so a page that makes an address at run time for a file the board came without draws nothing. */
test('an agent render\'s policy names the files it was given, not the asset origin', async () => {
  const mine = sha(1), held = sha(2);
  const p = {...initialProject(), leftOut: [held]} as Project;
  const host = {origins: ['http://asset.localhost'], stat: async () => ({mime: 'image/png', bytes: 4}), read: async () => new Uint8Array(4), frameCost: async (s: string) => `http://asset.localhost/board-media/${s}.png`.length, frameMedia: async (s: string) => `http://asset.localhost/board-media/${s}.png`, mediaUrl: async () => 'blob:x'};
  const doc = await renderDocument({html: `<img src="media:${mine}"><img src="media:${held}">`}, outgoing(p, host).host as never);
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(doc)![1];
  assert.match(csp, new RegExp(`img-src data: http://asset\\.localhost/board-media/${mine}\\.png;`), 'the file it was given');
  assert.doesNotMatch(csp, /img-src[^;]*http:\/\/asset\.localhost(?:[ ;]|$)/, 'never the whole origin');
  assert.doesNotMatch(csp, new RegExp(held), 'and nothing of the file the board came without');
  assert.match(csp, /media-src data: http:\/\/asset\.localhost\/board-media\//);
});

/* 7b (high): only the person putting a file back lets it go out. An agent's media_add of a file the board came without, by
   its library id, by its bytes, or as a picture of the library's under another name, is refused, saying the person must place it. */
test('an agent cannot put back a file the board came without: by library id, by hash, or by a library picture\'s bytes', () => {
  const held = (bf as unknown as Record<string, unknown>).heldFromAgent as (p: Project, file: string) => string | undefined;
  assert.equal(typeof held, 'function', 'board-file.ts exports heldFromAgent');
  const p = {...initialProject(), leftOut: [sha(3), 'local:0123456789abcdef']} as Project;
  assert.match(held(p, 'local:0123456789abcdef') ?? '', /came without.*person/);
  assert.match(held(p, sha(3)) ?? '', /came without.*person/);
  assert.equal(held(p, sha(4)), undefined);
  assert.equal(held(initialProject(), sha(3)), undefined);
  const apply = body('async function applyBatch(');
  const copy = apply.indexOf('await importMedia(');
  assert.ok(apply.indexOf("heldFromAgent(project,`local:${") > 0 && apply.indexOf("heldFromAgent(project,`local:${") < copy, 'a library id is asked before anything is copied');
  assert.ok(apply.indexOf('heldFromAgent(project,sha)') > copy, 'what was copied is asked by its hash');
  assert.ok(apply.indexOf('heldFromAgent(project,`local:${contentId(') > copy, 'and a picture by the id the library would give it');
  assert.doesNotMatch(apply, /carriedNow\(/, 'an agent\'s file never takes one off the list');
});

/* 8: every leaving that holds the editor still waits for the save a bounded time, and gives up then; a close whose question
   was answered before its turn came does nothing when its turn comes. */
import {windowCloser, type CloseAnswer} from '../src/workspace/closing.ts';
test('a close the person already answered does nothing when its turn comes at last', async () => {
  let turnCame!: () => void, over: (() => boolean) | undefined;
  const turn = new Promise<void>(r => { turnCame = r; });
  const closer = windowCloser(async (destroy, answered) => { over = answered; await turn; if (answered?.()) return; await destroy(); }, async (): Promise<CloseAnswer> => 'cancel', async () => false, 50);
  let destroyed = 0;
  await closer.request(async () => { destroyed++; });
  assert.equal(over?.(), true, 'the close is told its question was answered');
  turnCame(); await new Promise(r => setTimeout(r, 10));
  assert.equal(destroyed, 0);
});
test('leaving the board waits for the save a bounded time, and a close behind it gives up when its question was answered', () => {
  const at = main.indexOf('function leave<T>(');
  const leave = main.slice(at, main.indexOf('\n}\n', at));
  for (const wait of ['flushDisk()', 'heldWrites']) assert.ok(leave.includes(`within(${wait},SAVE_LIMIT)`), `${wait}, bounded`);
  assert.doesNotMatch(leave, /await flushDisk\(\)|await heldWrites/, 'nothing waited for without a bound');
  assert.match(main, /function closeWindow\(destroy:\(\)=>Promise<void>,answered:\(\)=>boolean=\(\)=>false\)\{return turn\(async\(\)=>\{if\(answered\(\)\)return;/);
});

/* 13: before a file is copied, only a batch that could not fit even with the shortest entry a file can have is refused; the
   exact entry is measured before the staged files are kept. A drop sets aside what is not a picture or video first. */
test('a drop sets aside the files it cannot take before it asks the library, and counts only the rest', () => {
  const put = body('async function putMedia(');
  assert.ok(put.indexOf('mediaRefusal(') > 0 && put.indexOf('mediaRefusal(') < put.indexOf('preflightBatch('), 'refusals first');
  assert.match(put, /if\(project\.pages\.length\+kept\.length>MAX_PAGES\)/, 'the page count is of what it takes');
  assert.match(put, /preflightBatch\(project,\{ops:kept\.map\(/);
});
