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

/* 12: what an import gives back is the project read from the very text it checked, so what is saved and what opens agree;
   a board file's reader tidies its history the same way before it reads the board again. */
import {importedProject} from '../src/workspace/library.ts';
import {readBoardFile} from '../src/board-file.ts';
import {MAX_PROJECT, parseProject} from '../src/model.ts';
import {emptyLedger, record} from '../src/ledger/ledger.ts';
import {zipSync, strToU8, strFromU8} from 'fflate';
const history = () => { const p = initialProject(), next = {...JSON.parse(JSON.stringify(p)), brief: 'Changed'} as Project, ledger = emptyLedger(); record(ledger, p, next, {author: {kind: 'person', name: 'D'}, source: 'editor:change'}); return ledger; };
test('a project file whose history leaves no room is given back as the text it was checked as, and opens', () => {
  const p = initialProject(); delete p.ledger;
  for (let n = 0; ; n++) { const left = MAX_PROJECT - 30 - JSON.stringify(p).length; if (left <= 0) break; const page = {id: 'pad' + n, name: 'Pad', blocks: [], kind: 'html', html: ''}; p.pages.push(page as never); page.html = 'x'.repeat(Math.max(0, Math.min(1_900_000, MAX_PROJECT - 30 - JSON.stringify(p).length))); }
  const got = importedProject(JSON.stringify({...p, ledger: history()}), {version: 1, entries: []});
  assert.ok(JSON.stringify(got).length <= MAX_PROJECT, `${JSON.stringify(got).length}`);
  assert.doesNotThrow(() => parseProject(JSON.stringify(got)), 'and it opens');
});
test('a board file whose words fit but whose history leaves no room once read is read without that history, not refused', async () => {
  const p = initialProject(); delete p.ledger;
  const board: Record<string, unknown> = {...JSON.parse(JSON.stringify(p)), aphroditeBoardFile: 1};
  const files: Record<string, Uint8Array> = {};
  const pages = board.pages as Record<string, unknown>[];
  // Quotes take one character in a page's file and two in the board's JSON, so the board is near the cap only once read.
  const each = 1_900_000, room = (MAX_PROJECT - 40 - JSON.stringify(board).length);
  let left = room;
  for (let n = 0; left > 200; n++) { const quotes = Math.min(each, Math.floor((left - 60) / 2)); pages.push({id: 'q' + n, name: 'Q', blocks: [], kind: 'html'}); left -= 2 * quotes + JSON.stringify(pages.at(-1)).length + 12; files[`pages/${String(pages.length).padStart(4, '0')}.html`] = strToU8('"'.repeat(quotes)); }
  // Made exact: the board as read is a few characters under the cap, too few for even an empty history.
  const quotesOf = (i: number) => strFromU8(files[`pages/${String(i + 1).padStart(4, '0')}.html`] ?? new Uint8Array());
  const read = () => { const {aphroditeBoardFile: _, ...design} = board; return JSON.stringify({...design, pages: pages.map((page, i) => page.kind === 'html' && i > 0 ? {...page, html: quotesOf(i)} : page)}).length; };
  let short = MAX_PROJECT - 8 - read();
  if (short % 2) { board.brief = String(board.brief) + 'x'; short--; }
  const last = pages.length - 1;
  files[`pages/${String(last + 1).padStart(4, '0')}.html`] = strToU8(quotesOf(last) + '"'.repeat(short / 2));
  assert.equal(read(), MAX_PROJECT - 8);
  files['board.json'] = strToU8(JSON.stringify(board));
  files['ledger/changes.json'] = strToU8(JSON.stringify(history()));
  const got = await readBoardFile(zipSync(files), {maxBytes: 500 * 1024 * 1024, put: async () => { throw new Error('nothing to place'); }});
  assert.ok(JSON.stringify(got.project).length <= MAX_PROJECT);
  assert.doesNotThrow(() => parseProject(JSON.stringify(got.project)));
});

/* 16: from the moment the last save of a close or a restart begins until the window goes, an agent's write is turned away to
   be tried again, so none is answered as done and then lost; the restart's code is loaded before that save. */
test('an agent write during the last save of a close or a restart is turned away to be tried again', () => {
  const updates = readFileSync(new URL('../src/editor/updates.ts', import.meta.url), 'utf8');
  assert.match(updates, /case 'update-relaunch': \{\n(?:\s*\/\/.*\n)*\s*try\{const \{relaunch\}=await import\('@tauri-apps\/plugin-process'\);await host\.leaving\(async\(\)=>\{(?:try\{)?await relaunch\(\);/, 'the restart is loaded before the save');
  // Under way by the closer's own word, from the request until it is over or answered (0.3-R fix 4 #2).
  assert.match(main, /if\(closer\.busy\(\)&&isWrite\(gateFor\(c,reachedAction\(c,agentLook\)\)\)\)return \{error:'Aphrodite is saving to close or restart[^']*',status:423\};/);
  assert.match(main, /\(\)=>\{if\(closer\.busy\(\)\)return \{error:'Aphrodite is saving to close or restart/, 'and a batch copying files asks again');
});

/* 10: deleting a workspace puts back only the projects that are still where it moved them, and moves any that arrived in it
   while it waited, so a move made meanwhile is never undone and no project is left in a workspace that is gone. */
test('deleting a workspace puts back only what is still where it moved it, and empties it again after the wait', () => {
  const start = main.indexOf("case 'ws-delete-confirm':");
  const del = main.slice(start, main.indexOf("\n    case '", start + 30));
  assert.match(del, /const back=\(lib:Library\):Library=>\(\{\.\.\.lib,entries:lib\.entries\.map\(e=>moved\.has\(e\.project\.id\)&&\(e\.workspaceId\?\?DEFAULT_WORKSPACE_ID\)===movedTo\?\{\.\.\.e,workspaceId:id\}:e\)\}\);/, 'only what is still where it was moved');
  assert.doesNotMatch(del, /moved\.has\(e\.project\.id\)\?\{\.\.\.e,workspaceId:id\}/, 'never by its id alone');
  assert.match(del, /await moveOut\(\);if\(here\(\)\)await moveOut\(\);/, 'what arrived while it waited moves too');
  assert.ok(del.indexOf('if(here())throw') > del.indexOf('await moveOut();if(here())await moveOut();') && del.indexOf('if(here())throw') < del.indexOf('saveWorkspaces(book)'), 'and a workspace still holding projects is not deleted');
});

/* 9: a tab closed while the person is still in a field puts those words in first, then asks if they could not be saved. */
test('the browser build puts in what is being typed before it decides whether to warn', () => {
  assert.match(main, /window\.addEventListener\('beforeunload',e=>\{saveTyping\(\);if\(!saves\.saved\|\|leaving\)\{e\.preventDefault\(\);e\.returnValue='';\}\}\);/);
});

/* 3: the target a batch names reaches the batch's own check as it was sent, so a target that is not an id is refused, not
   dropped; and the tool says "selection" is only for a write without base_revision, as the guide does. */
import {parseAgentCommand} from '../src/agent/bridge.ts';
import {parseBatch} from '../src/agent/ops.ts';
import {mcpTools} from '../src/agent/commands.mjs';
test('a page_id that is not an id is refused as sent, and the tool tells "selection" apart with base_revision', () => {
  for (const page_id of [42, 'x'.repeat(201)]) {
    const parsed = parseAgentCommand('apply', {reason: 'r', base_revision: 'r2:1:2:3', page_id, ops: [{op: 'page', name: 'New'}, {op: 'add', component_kind: 'hero'}]});
    assert.ok('command' in parsed, JSON.stringify(parsed));
    const c = (parsed as {command: {ops?: unknown[]; patch?: unknown[]; pageId?: unknown; reason?: unknown; baseRevision?: unknown}}).command;
    const batch = parseBatch({ops: c.ops, patch: c.patch, page_id: c.pageId, reason: c.reason, base_revision: c.baseRevision});
    assert.ok('error' in batch && /page_id/.test(batch.error), `${String(page_id).slice(0, 12)}: refused, not dropped`);
  }
  const apply = JSON.stringify(mcpTools().find(t => t.name === 'aphrodite_apply_edits'));
  for (const said of apply.match(/[^."]*\\"selection\\"[^."]*/g) ?? []) assert.match(said, /base_revision/, said);
});

/* 11: the export window counts by the lookups the exports make: a library picture whose file is gone is not counted, and
   the handoff's count leaves out the videos it leaves out. */
test('the export window counts what each export would carry, by its own lookups', async () => {
  const counted = (bf as unknown as Record<string, unknown>).outgoingCount as (p: Project, go: ReturnType<typeof outgoing>) => Promise<Record<string, unknown>>;
  const p = initialProject();
  p.pages.push({id: 'v', name: 'V', blocks: [], kind: 'html', html: `<video src="media:${sha(5)}"></video><img src="media:${sha(6)}">`} as never);
  p.reference = 'local:00000000000000aa';
  p.pages[0].blocks[1].image = 'local:00000000000000bb';
  const host = {stat: async (s: string) => s === sha(5) ? {mime: 'video/mp4', bytes: 10} : s === sha(6) ? {mime: 'image/png', bytes: 4} : undefined, read: async () => undefined};
  const got = await counted(p, outgoing(p, host, async id => id === '00000000000000aa' ? {bytes: new Uint8Array(4), mime: 'image/png'} : undefined));
  assert.equal(got.locals, 1, 'a library picture whose file is gone is not counted');
  assert.equal(got.count, 2);
  assert.equal(got.pictures, 1, 'the handoff leaves the video out');
  assert.match(main, /In the board file: \$\{count\+locals\}/);
  assert.match(main, /in the handoff: \$\{pictures\+locals\}/);
  assert.match(main, /const go=outgoing\(board,frameHost,id=>resolveLocalBytes\(id,board\.id\)\);const \{count,bytes,locals,held,all,pictures\}=await outgoingCount\(board,go\);/);
});

/* 4: a clearing that finds no room in the board's history, near the cap, is kept beside the board in the library's entry. */
import {readLibrary, LEGACY_KEY, LIBRARY_KEY} from '../src/workspace/library.ts';
import {APPROVAL_CLEARED} from '../src/ledger/types.ts';
test('a clearing with no room in the history is kept in the library\'s entry, and read back', () => {
  const p = {...initialProject(), approvedFingerprint: 'stale'} as Project; delete p.ledger;
  for (let n = 0; ; n++) { const left = MAX_PROJECT - 40 - JSON.stringify(p).length; if (left <= 0) break; const page = {id: 'pad' + n, name: 'Pad', blocks: [], kind: 'html', html: ''}; p.pages.push(page as never); page.html = 'x'.repeat(Math.max(0, Math.min(1_900_000, MAX_PROJECT - 40 - JSON.stringify(p).length))); }
  const values = new Map<string, string>([[LEGACY_KEY, JSON.stringify(p)]]);
  const store = {getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }};
  const read = readLibrary(store as never);
  const entry = read.entries[0] as {project: Project; clearedApproval?: string};
  assert.equal(entry.project.approvedFingerprint, undefined);
  assert.notEqual(entry.project.ledger?.changes.at(-1)?.reason, APPROVAL_CLEARED, 'no room for it in the history');
  assert.ok(entry.clearedApproval && Number.isFinite(Date.parse(entry.clearedApproval)), 'so the entry keeps it');
  values.set(LIBRARY_KEY, JSON.stringify(read));
  assert.equal((readLibrary(store as never).entries[0] as {clearedApproval?: string}).clearedApproval, entry.clearedApproval, 'and a read keeps it');
  values.set(LIBRARY_KEY, JSON.stringify({...read, entries: [{...entry, clearedApproval: 'not a time'}]}));
  assert.throws(() => readLibrary(store as never));
});

/* 17: an open that waited and found another board open says so to the agent that asked: a 409 and the board that is open. */
test('an open overtaken by another answers the agent with a 409 and the board that is open', () => {
  const open = main.slice(main.indexOf("case 'hub-open':"), main.indexOf("case 'hub-open':") + 700);
  assert.match(open, /if\(screen!=='home'\)\{d\.outcome=\{error:[^}]*status:409,open:\{project_id:project\.id,name:project\.name\}\};return;\}/);
  assert.match(main, /case 'act':await actViaButton\(c\.action,c\.data,d\);if\(d\.outcome\)return d\.outcome;/);
});

/* 15 (in one process): a batch whose placing throws still lets go of the files it staged. */
test('the staged files are let go of in a finally, whatever the placing does', () => {
  const apply = body('async function applyBatch(');
  assert.match(apply, /let answer:Record<string,unknown>\|undefined;\n\s*try\{answer=\(\(\): Record<string,unknown>=>\{/);
  assert.match(apply, /\}finally\{await frameHost\.releaseMedia\(staged\)\.catch\(\(\)=>\{\}\);\}\n\s*return answer;/);
});
