/**
 * 0.3-R fix 1 (Codex mid-review of 0.3-R, 2026-11-23).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personOnlyRow, commandById} from '../src/agent/commands.mjs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const caseOf = (name: string) => { const at = main.indexOf(`case '${name}':`); assert.ok(at >= 0, name); return main.slice(at, main.indexOf('\n', at)); };

/* 1 (high): reloading from disk puts the saved copy back, an approved one included, over a draft whose save failed. It is
   the person's alone, by the table and in the handler, before the library is replaced. */
test('reloading from disk is the person\'s alone: an agent\'s command is refused, and the handler asks who pressed before it reads the disk', () => {
  assert.equal(personOnlyRow('disk-reload'), 'outside.disk-reload');
  assert.equal(commandById['outside.disk-reload'].author, 'person-only');
  assert.match(caseOf('disk-reload'), /case 'disk-reload': if\(refusal\(d,'outside\.disk-reload'\)\)break;await reloadFromDisk\(\);/);
});

/* 4: what an approve button was drawn over names the board, and the review card follows the canvas when an edit redraws only
   the canvas, so the person's first press after it approves. */
test('an approve button holds the board it was drawn for, and the card takes the canvas\'s state when a field edit redraws only the canvas', () => {
  assert.match(main, /function shownState\(\)\{return `\$\{project\.id\}\|\$\{fingerprint\(project\)\}\|/);
  const at = main.indexOf("const review = document.querySelector('.review-card');");
  const block = main.slice(at, main.indexOf('syncStateAttributes();', at));
  assert.match(block, /approve\.dataset\.shown = shownState\(\);/);
});

/* 8: libraries frozen as v0.2.4 and main (374480b) wrote them, each with what its own reader said of every board (made by
   that code, from a checkout of it). What was approved there is approved on the first read here; a draft stays a draft. */
import {readLibrary, LIBRARY_KEY} from '../src/workspace/library.ts';
import {isApproved} from '../src/model.ts';
for (const name of ['library-v0.2.4.json', 'library-main-374480b.json']) test(`a library ${name.slice(8, -5)} wrote keeps every approval its own reader saw, and no other`, () => {
  const frozen = JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as {library: string; approved: Record<string, boolean>};
  assert.ok(Object.values(frozen.approved).filter(Boolean).length >= 4, 'it holds approved boards');
  assert.ok(frozen.library.includes('"lineHeight":1.5,"weight":400,"size":16'), 'and a type role stored in another key order');
  const read = readLibrary({getItem: k => k === LIBRARY_KEY ? frozen.library : null, setItem: () => {}});
  for (const e of read.entries) assert.equal(isApproved(e.project), frozen.approved[e.project.id], e.project.id);
});

/* 3: a page or a block an agent puts in carries only what a page or a block has; and whatever a read keeps, a change can
   record, so the person's undo brings back exactly the board they approved. */
import {parseBatch} from '../src/agent/ops.ts';
import {initialProject, approvalPrint, parseProject, fingerprint, type Project} from '../src/model.ts';
import {begin, end, newHistory, step} from '../src/ledger/session.ts';
const REASON = 'Replacing a page.';
test('a page or block an agent inserts with a property no page or block has is refused, naming it', () => {
  const p = initialProject(), page = p.pages[0];
  for (const [patch, name] of [
    [[{op: 'insert_page', index: 1, page: {id: 'extra', name: 'X', blocks: [], sneaky: 1}}], 'sneaky'],
    [[{op: 'insert_block', page_id: page.id, index: 0, block: {...page.blocks[0], id: 'nb', hidden: true}}], 'hidden'],
    [[{op: 'insert_page', index: 1, page: {id: 'extra', name: 'X', blocks: [{...page.blocks[0], id: 'nb2', hidden: true}]}}], 'hidden'],
    [[{op: 'set', on: 'page', page_id: page.id, field: 'sneaky', value: 1}], 'sneaky'],
  ] as const) {
    const got = parseBatch({reason: REASON, patch});
    assert.ok('error' in got, JSON.stringify(patch));
    assert.match((got as {error: string}).error, new RegExp(name));
  }
});
test('a page read keeps only what a page has, so the record of a change sees everything an approval sees', () => {
  const p = initialProject() as Project & {pages: (Project['pages'][number] & {sneaky?: number})[]};
  p.pages[0].sneaky = 1;
  const read = parseProject(JSON.stringify(p)) as typeof p;
  assert.equal(read.pages[0].sneaky, undefined);
  // An approved board, a same-id page replaced with an extra property behind the agent door, and the person's undo.
  const q = initialProject(); q.approvedFingerprint = approvalPrint(q);
  const h = newHistory(q), before = begin(q, h);
  const replaced = parseProject(JSON.stringify({...q, pages: [{...q.pages[0], sneaky: 1}]}));
  Object.assign(q, {pages: replaced.pages}); delete q.approvedFingerprint;
  end(q, before, {author: {kind: 'agent', name: 'bot'}, source: 'agent:apply', reason: 'x'}, h);
  const undone = step(q, 'undo', h, {kind: 'person', name: 'you'})!.project;
  assert.equal(fingerprint(undone), fingerprint(before), 'the undo gives back the design approved');
  assert.equal(isApproved(undone), true, 'and the approval with it');
});

test('over random histories, undoing every change gives back the design the approval was made on, approval and all', () => {
  let seed = 7;
  const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let run = 0; run < 40; run++) {
    const p = initialProject(); p.approvedFingerprint = approvalPrint(p);
    const start = fingerprint(p), h = newHistory(p);
    const steps = 1 + rand(8);
    for (let i = 0; i < steps; i++) {
      const before = begin(p, h), kind = rand(5);
      // Each change as the app would leave it: the board read again (what a batch's result is).
      const next = JSON.parse(JSON.stringify(p)) as Project & Record<string, unknown>;
      if (kind === 0) next.pages[0].name = 'Page ' + rand(100);
      else if (kind === 1 && next.pages[0].blocks.length) next.pages[0].blocks[rand(next.pages[0].blocks.length)].title = 'T' + rand(100);
      else if (kind === 2 && next.pages.length < 5) next.pages.push({id: 'p' + run + '-' + i, name: 'New', blocks: [], sneaky: rand(9)} as never);
      else if (kind === 3 && next.pages.length > 1) next.pages.pop();
      else if (kind === 4) (next.pages[rand(next.pages.length)] as unknown as Record<string, unknown>).sneaky = rand(9);
      const read = parseProject(JSON.stringify(next));
      for (const k of Object.keys(p) as (keyof Project)[]) if (k !== 'ledger') delete p[k];
      Object.assign(p, {...read, ledger: p.ledger});
      end(p, before, {author: {kind: 'agent', name: 'bot'}, source: 'agent:apply', reason: 'r'}, h);
    }
    let cur: Project = p;
    for (let i = 0; i < steps; i++) { const s = step(cur, 'undo', h, {kind: 'person', name: 'you'}); if (s) cur = s.project; }
    assert.equal(fingerprint(cur), start, `run ${run}`);
    assert.equal(isApproved(cur), true, `run ${run}: approved again`);
  }
});

/* 5: Home's open is Home's; a board opened from Home opens in its own workspace; a handler that waited writes only to the
   board it began on. */
import {actionScreen} from '../src/editor/screens.ts';
test('opening a board from a card is Home\'s, and opens it in the workspace it is in', () => {
  assert.equal(actionScreen('hub-open'), 'home');
  assert.match(caseOf('hub-open') + main.slice(main.indexOf("case 'hub-open':"), main.indexOf("case 'hub-open':") + 900), /const ws=entry\.workspaceId\?\?DEFAULT_WORKSPACE_ID;if\(ws!==workspaces\.activeId\)\{saveWorkspaces\(setActiveWorkspace\(workspaces,ws\)\)/);
});
test('every handler that waits before it writes asks whether its board is still open, the board\'s id and not only its design', () => {
  // fix 2 #5 narrows it to the opening the handler began in.
  assert.match(main, /function sameBoard\(\):\(\)=>boolean\{const id=project\.id,session=editSession;return \(\)=>\{if\(screen==='editor'&&project\.id===id&&editSession===session\)return true;/);
  for (const name of ['block-image', 'upload-reference']) assert.match(caseOf(name), /await readImage\(file\); if \(!here\(\)\) return; commit\(/, name);
  const omd = main.slice(main.indexOf("case 'apply-omd':"), main.indexOf("case 'omd-issue':"));
  assert.ok(omd.indexOf('if(!here())break;') > omd.indexOf('await verifyReference('), 'apply-omd, after its fetch');
  const md = main.slice(main.indexOf("case 'import-md':"), main.indexOf("case 'import-md':") + 400);
  assert.match(md, /const text = await file\.text\(\);\n\s*if \(!here\(\)\) return;/);
  assert.match(main, /archive\.handle\(act,el,pickFile,src=>\{if\(!here\(\)\)return;/);
  assert.match(main, /vibePending\.board!==project\.id/);
});

/* 7: the revision just read is known even to a board with no history; a 409 lists the view changes that moved the revision. */
import {changesSince} from '../src/ledger/ledger.ts';
import {agentRevision} from '../src/model.ts';
import {ensureSpace} from '../src/editor/space.ts';
test('the live revision is known with nothing after it, and a frame moved since a revision is listed when asked for what moved it', () => {
  const p = initialProject(); ensureSpace(p);
  const now = agentRevision(p);
  const fresh = changesSince(p.ledger, now, {current: now} as never);
  assert.deepEqual([fresh.known, fresh.changes.length], [true, 0]);
  const h = newHistory(p), b = begin(p, h);
  p.space!.frames[p.pages[0].id].x += 100;
  end(p, b, {author: {kind: 'person', name: 'you'}, source: 'pointer:move'}, h);
  assert.equal(changesSince(p.ledger, now).changes.length, 0, 'a frame moved is a view change, left out by default');
  assert.equal(changesSince(p.ledger, now, {moved: true} as never).changes.length, 1, 'but listed when what moved the revision is asked for');
  assert.match(main, /changesSince\(project\.ledger,baseRevision,\{limit:20,moved:true,current:now\}\)/, 'as a 409 asks');
});

/* 9: a clearing at the library's edge is in the board's ledger too; replaying a recorded edit whose clearing came with it works. */
import {readLibrary as readLib, upsertProject as upsert, LIBRARY_KEY as KEY} from '../src/workspace/library.ts';
test('a stale fingerprint dropped where a library is read or a board saved is recorded in that board\'s ledger, by the system', () => {
  const p = initialProject(); p.approvedFingerprint = approvalPrint(p); p.brief = 'Changed behind the ledger';
  const read = readLib({getItem: k => k === KEY ? JSON.stringify({version: 1, entries: [{project: p, createdAt: 'x', updatedAt: '2026-11-23T00:00:00.000Z', pinned: false, archived: false}].map(e => ({...e, createdAt: e.updatedAt}))}) : null, setItem: () => {}});
  const last = read.entries[0].project.ledger?.changes.at(-1);
  assert.ok(last, 'the read recorded it');
  assert.equal(last!.author.name, 'system');
  assert.match(last!.reason ?? '', /Approval cleared/);
  assert.ok(last!.ops.some(op => op.op === 'set' && op.field === 'approvedFingerprint'));
  const q = initialProject(); q.approvedFingerprint = approvalPrint(q); q.name = 'Changed too';
  const saved = upsert({version: 1, entries: []}, q).entries[0].project;
  assert.match(saved.ledger?.changes.at(-1)?.reason ?? '', /Approval cleared/, 'and so is a save');
  assert.match(q.ledger?.changes.at(-1)?.reason ?? '', /Approval cleared/, 'in the board in memory as on disk');
});
test('a recorded edit replayed with the clearing it carried lands; the clearing alone, or an approval written, is still refused', () => {
  const page = initialProject().pages[0].id;
  const unset = {op: 'set', on: 'project', field: 'approvedFingerprint', unset: true};
  const withEdit = parseBatch({reason: REASON, patch: [unset, {op: 'set', on: 'page', page_id: page, field: 'name', value: 'Renamed'}]});
  assert.ok('batch' in withEdit, JSON.stringify(withEdit));
  if ('batch' in withEdit) assert.ok(!withEdit.batch.patch.some(op => op.op === 'set' && op.field === 'approvedFingerprint'), 'the clearing is left to the edit, which makes it');
  assert.ok('error' in parseBatch({reason: REASON, patch: [unset]}), 'alone it would take an approval away');
  assert.ok('error' in parseBatch({reason: REASON, patch: [{op: 'set', on: 'project', field: 'approvedFingerprint', value: 'x'}, {op: 'set', on: 'page', page_id: page, field: 'name', value: 'R'}]}), 'a value is an approval written');
});

test('a patch of two clearings and nothing else is refused, not taken as an empty batch', () => {
  const unset = {op: 'set', on: 'project', field: 'approvedFingerprint', unset: true};
  assert.ok('error' in parseBatch({reason: REASON, patch: [unset, {...unset}]}));
});

/* 10: every write into the disk's line is held to what the desktop can save. */
test('every library put in the disk\'s line goes through libraryText', () => {
  const calls = [...main.matchAll(/enqueue\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(calls.length >= 2);
  for (const arg of calls) assert.ok(arg === 'raw' || arg.startsWith('libraryText('), `enqueue(${arg})`);
  assert.match(main, /const raw=libraryText\(next\);if\(diskQueue\)\{diskQueue\.enqueue\(raw\);\}/);
  assert.doesNotMatch(main, /enqueue\(JSON\.stringify/);
});

/* 11: text cut to a length is cut on whole characters wherever it goes out: a concise contract's brief, a media item's name,
   the reason a clearing records, a run's intent. */
import {designContract} from '../src/agent/contract.ts';
import {newRun} from '../src/agent/run.ts';
import {halfPair} from '../src/free-page.ts';
const EMOJI = '\u{1F600}';
test('text cut to a length never ends on half a pair', () => {
  const p = initialProject(); p.brief = 'b'.repeat(399) + EMOJI + 'tail';
  const brief = (designContract(p, '') as {project: {brief: string}}).project.brief;
  assert.equal(halfPair(brief), -1, 'the concise contract\'s brief');
  const run = newRun(p, 'i'.repeat(1199) + EMOJI, 'm'.repeat(99) + EMOJI, 1, 1);
  assert.equal(halfPair(run.intent) + halfPair(run.modelLabel), -2, 'a run\'s intent and model');
  const q = initialProject(); q.approvedFingerprint = approvalPrint(q);
  const h = newHistory(q), b = begin(q, h); q.brief = 'x';
  const c = end(q, b, {author: {kind: 'agent', name: 'bot'}, source: 'agent:apply', reason: 'r'.repeat(500 - 'Approval cleared: only the person brings an approval back.'.length - 3 - 1) + EMOJI + 'r'.repeat(80)}, h)!;
  assert.equal(halfPair(c.reason!), -1, 'the reason a clearing records');
  assert.ok(!c.reason!.includes('\uFFFD'), 'cut, not mended');
  assert.match(readFileSync(new URL('../src/agent/apply.ts', import.meta.url), 'utf8'), /name: clip\(name, MAX_PAGE_NAME\)/, 'a media item\'s name');
});

/* 6 (as decided 2026-11-23): a write sent with the revision it read names what it changes. A page opened or a selection
   moved since does not change the revision, so a batch that leans on them would land elsewhere. Without base_revision a
   write is not checked, and the tools say so. */
import {parseAgentCommand} from '../src/agent/bridge.ts';
import {mcpTools} from '../src/agent/commands.mjs';
const REV = 'r2:1:2:3';
test('a batch sent with base_revision names its page for the ops that work on one, and a component by id, not the selection', () => {
  for (const [ops, what] of [
    [[{op: 'add', component_kind: 'hero'}], /page_id/],
    [[{op: 'update', block_id: 'selection', fields: {title: 'x'}}], /selection/],
    [[{op: 'frame', preset: 'mobile'}], /page_id/],
  ] as const) {
    const got = parseBatch({reason: REASON, base_revision: REV, ops});
    assert.ok('error' in got, JSON.stringify(ops));
    assert.match((got as {error: string}).error, what);
  }
  assert.ok('batch' in parseBatch({reason: REASON, base_revision: REV, page_id: 'p1', ops: [{op: 'add', component_kind: 'hero'}]}), 'with the page named it goes');
  assert.ok('batch' in parseBatch({reason: REASON, base_revision: REV, ops: [{op: 'page', name: 'New'}, {op: 'add', component_kind: 'hero'}]}), 'a page it makes is named by the making');
  assert.ok('batch' in parseBatch({reason: REASON, ops: [{op: 'add', component_kind: 'hero'}]}), 'without base_revision nothing changes: it is not checked, as the tools say');
  const edit = parseAgentCommand('edit', {reason: REASON, base_revision: REV, field: 'title', text: 'x'});
  assert.ok('error' in edit && /blockId/.test(edit.error), 'edit with a revision names its block');
});
test('the tools say a write without base_revision is not checked', () => {
  for (const name of ['aphrodite_apply_edits', 'aphrodite_set_design_system']) {
    const tool = mcpTools().find(t => t.name === name)!;
    assert.match(JSON.stringify(tool), /without base_revision[^"]*not checked/i, name);
  }
});
