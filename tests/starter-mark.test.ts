/**
 * 0.3-L4-3 fix 1 #1: the page a new board is made with is hidden by a mark the new board carries, not guessed from the
 * ledger. The mark is put on only where a new project is made; any change that reaches that page (a section, its name,
 * its frame's size or place), or takes it away, drops it for good, and a board without it hides nothing. Each case is
 * run the way the editor runs it: the new-project path, then begin, the change (a person's, or an agent's batch) and end.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, parseProject, fingerprint, agentRevision, makeBlock, type Project} from '../src/model.ts';
import {parseBatch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';
import {begin, end, newHistory, stepForScreen, type History} from '../src/ledger/session.ts';
import {compact} from '../src/ledger/ledger.ts';
import {ensureSpace, openingCamera} from '../src/editor/space.ts';
import {newBoard, isStarterPage, visiblePages, hasSectionPage, shownPage, firstShown, placeNewFrames, revealStarter, fullBoard} from '../src/editor/starter.ts';
import type {Author} from '../src/ledger/types.ts';
import {readBoardFile, writeBoardFile} from '../src/board-file.ts';
import {cloneProject} from '../src/workspace/library.ts';

const YOU: Author = {kind: 'person', name: 'you'};
const AGENT: Author = {kind: 'agent', name: 'claude-code'};
const PAGE = '<!doctype html><html><body><h1>Briefing</h1></body></html>';
/** A change as commit() in main.ts makes it: begin, the change, the frames, end. */
function edit(h: History, p: Project, change: (p: Project) => void, author = YOU): Project {
  const before = begin(p, h); change(p); placeNewFrames(p); ensureSpace(p); end(p, before, {author, source: 'editor:change'}, h); return p;
}
/** An agent's batch as applyBatch in main.ts runs it: the batch inside the change, its result in place of the board. */
function apply(h: History, p: Project, payload: Record<string, unknown>): Project {
  const parsed = parseBatch({reason: 'The person asked for this.', ...payload});
  if ('error' in parsed) throw new Error(parsed.error);
  const before = begin(p, h);
  const done = runBatch(p, parsed.batch, '');
  if (!done.ok) throw new Error(done.error);
  const next: Project = {...done.project, ...(p.ledger ? {ledger: p.ledger} : {})};
  ensureSpace(next); end(next, before, {author: AGENT, source: 'agent:apply'}, h); return next;
}
const opened = (p: Project) => { const q = parseProject(JSON.stringify(p)); ensureSpace(q); return q; };

test('a new board carries the mark on its first page, and only a new board does', () => {
  const p = opened(newBoard('Empty'));
  assert.equal(p.starter, p.pages[0].id);
  assert.equal(isStarterPage(p, p.pages[0]), true);
  assert.deepEqual(visiblePages(p), []);
  assert.equal(initialProject().starter, undefined, 'the sample and every other project are made without it');
});

test('a board without the mark hides nothing: an old project left empty on purpose, or a board received without it', () => {
  const old = initialProject(); old.pages[0].blocks = [];
  const p = opened(old);
  assert.equal(isStarterPage(p, p.pages[0]), false);
  assert.deepEqual(visiblePages(p).map(x => x.id), [p.pages[0].id]);
  assert.equal(hasSectionPage(p), true, 'its empty section page is there to work on');
});

test('a mark that names no page, or a page that is not an empty section page, is dropped where the board is read', () => {
  const p = newBoard('Empty');
  assert.equal(opened({...p, starter: 'nobody'}).starter, undefined);
  const filled = JSON.parse(JSON.stringify(p)) as Project; filled.pages[0].blocks.push(makeBlock('hero'));
  assert.equal(opened(filled).starter, undefined);
  const html = JSON.parse(JSON.stringify(p)) as Project; Object.assign(html.pages[0], {kind: 'html', html: PAGE});
  assert.equal(opened(html).starter, undefined);
});

test('a section put on the starter and deleted again leaves the page on the board, even once the ledger is cut short', () => {
  const h = newHistory(), p = opened(newBoard('Empty'));
  edit(h, p, q => { q.pages[0].blocks.push(makeBlock('hero')); });
  edit(h, p, q => { q.pages[0].blocks = []; });
  assert.equal(isStarterPage(p, p.pages[0]), false);
  const ledger = JSON.parse(JSON.stringify(p.ledger)); compact(ledger, 0);
  const cut = opened({...p, ledger});
  assert.equal(isStarterPage(cut, cut.pages[0]), false, 'what the page went through is no longer read off the ledger');
  assert.equal(hasSectionPage(cut), true);
});

test('an agent\'s large change elsewhere on the board leaves the untouched starter hidden', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  p = apply(h, p, {ops: Array.from({length: 6}, (_, i) => ({op: 'html_page', name: `Page ${i}`, html: PAGE}))});
  assert.equal(isStarterPage(p, p.pages[0]), true);
  assert.equal(visiblePages(p).length, 6);
});

test('resizing or moving the starter\'s frame, renaming it or taking it away drops the mark', () => {
  for (const change of [(q: Project) => { q.space!.frames[q.pages[0].id].preset = 'mobile'; }, (q: Project) => { q.space!.frames[q.pages[0].id].x = 400; }, (q: Project) => { q.pages[0].name = 'Landing'; }]) {
    const h = newHistory(), p = opened(newBoard('Empty'));
    edit(h, p, change);
    assert.equal(p.starter, undefined);
    assert.equal(visiblePages(p).length, 1);
  }
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  p = apply(h, p, {ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]});
  const starter = p.pages[0].id;
  edit(h, p, q => { q.pages = q.pages.filter(x => x.id !== starter); q.activePageId = q.pages[0].id; });
  assert.equal(p.starter, undefined, 'a page that is gone takes its mark with it');
});

test('undoing the change that showed the starter does not hide it again, and the mark stays out of the design', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  const before = {print: fingerprint(p), revision: agentRevision(p)};
  const marked = fingerprint({...p, starter: undefined}), revision = agentRevision({...p, starter: undefined});
  assert.deepEqual(before, {print: marked, revision}, 'the mark is not design: the fingerprint and the revision are as without it');
  edit(h, p, q => { q.pages[0].blocks.push(makeBlock('hero')); });
  const undone = stepForScreen(p, 'undo', h, YOU);
  p = undone!.project;
  assert.equal(p.pages[0].blocks.length, 0);
  assert.equal(p.starter, undefined, 'a page once seen stays seen');
  assert.equal(isStarterPage(p, p.pages[0]), false);
  assert.ok(!(p.ledger?.changes ?? []).some(c => JSON.stringify(c.ops).includes('starter')), 'no change records the mark');
});

test('the mark goes with the board: saved, copied, and in a board file', async () => {
  const p = opened(newBoard('Empty'));
  assert.equal(opened(cloneProject(p)).starter, p.starter, 'a copy keeps its page ids, and its mark');
  const host = {maxBytes: 1 << 20, put: async () => ({sha: '', mime: '', bytes: 0}), stat: async () => undefined, read: async () => undefined};
  const {bytes} = await writeBoardFile(p, host);
  const got = await readBoardFile(bytes, host);
  assert.equal(got.project.starter, p.pages[0].id);
  assert.deepEqual(visiblePages(got.project), [], 'a new board sent on as it is opens empty');
});

/** Two boxes that share some of the board; a section page reaches down as far as its sections go. */
const overlap = (p: Project, a: string, b: string) => { const box = (id: string) => { const f = p.space!.frames[id], w = f.preset === 'custom' ? f.width ?? 1200 : ({desktop: 1440, tablet: 834, mobile: 390})[f.preset]; return {x: f.x, y: f.y, r: f.x + w, b: f.height === undefined ? Infinity : f.y + f.height}; }; const [m, o] = [box(a), box(b)]; return m.x < o.r && o.x < m.r && m.y < o.b && o.y < m.b; };

test('a section an agent adds to the hidden page shows it beside the page already there, not under it', () => {
  for (const extra of [{}, {patch: [{op: 'set', on: 'project', field: 'name', value: 'Renamed'}]}]) {
    const h = newHistory();
    let p = opened(newBoard('Empty'));
    p = apply(h, p, {ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]});
    const [starter, html] = [p.pages[0].id, p.pages[1].id];
    assert.deepEqual([p.space!.frames[html].x, p.space!.frames[html].y], [0, 0], 'the agent\'s page took the place the starter would have');
    p = apply(h, p, {ops: [{op: 'add', component_kind: 'hero'}], ...extra});
    assert.equal(p.pages[0].blocks.length, 1, 'with no page named, the section went to the open page, the starter');
    assert.equal(p.starter, undefined);
    assert.equal(overlap(p, starter, html), false, 'it shows beside the page, not under it');
    assert.ok(p.space!.frames[starter].x > 0);
  }
});

test('the move is part of the change that showed it: one undo takes back the section and the move, and the page stays shown', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  p = apply(h, p, {ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]});
  const starter = p.pages[0].id;
  p = apply(h, p, {ops: [{op: 'add', component_kind: 'hero'}]});
  p = stepForScreen(p, 'undo', h, YOU)!.project;
  assert.deepEqual([p.pages[0].blocks.length, p.space!.frames[starter].x], [0, 0], 'the section and the move are taken back together');
  assert.equal(isStarterPage(p, p.pages[0]), false, 'the brief\'s rule: a page once shown stays shown, here back on its first place');
});

test('a starter that shows where nothing else is stays where it was', () => {
  const h = newHistory(), p = opened(newBoard('Empty'));
  edit(h, p, q => { q.pages[0].blocks.push(makeBlock('hero')); });
  assert.deepEqual([p.space!.frames[p.pages[0].id].x, p.space!.frames[p.pages[0].id].y], [0, 0]);
});

test('preview and export mean the page the board shows: the open one when it shows, else the first that does', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  assert.equal(shownPage(p).id, p.pages[0].id, 'an empty board has only its hidden page to mean');
  p = apply(h, p, {ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]});
  assert.equal(p.activePageId, p.pages[0].id, 'making a page does not open it: the hidden page is still the open one');
  assert.equal(shownPage(p).name, 'Briefing', 'the page on the board is the one previewed and exported');
  assert.equal(p.activePageId, p.pages[0].id, 'and the board\'s open page is left as it is');
});

test('deleting a page opens the first page the board shows, not the hidden one', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  p = apply(h, p, {ops: [{op: 'html_page', name: 'One', html: PAGE}, {op: 'html_page', name: 'Two', html: PAGE}]});
  edit(h, p, q => { q.activePageId = q.pages[1].id; });
  edit(h, p, q => { q.pages = q.pages.filter(x => x.id !== q.activePageId); q.activePageId = firstShown(q).id; });
  assert.equal(p.pages.find(x => x.id === p.activePageId)!.name, 'Two');
  assert.equal(p.starter, p.pages[0].id, 'opening another page leaves the hidden one hidden');
});

test('a page added, copied or drafted on a new board takes the board\'s first place, not one beside the hidden page', () => {
  const h = newHistory(), p = opened(newBoard('Empty'));
  edit(h, p, q => { const page = {id: 'about', name: 'About', blocks: [makeBlock('hero')]}; q.pages.push(page); q.activePageId = page.id; });
  assert.deepEqual([p.space!.frames.about.x, p.space!.frames.about.y], [0, 0]);
  edit(h, p, q => { q.pages.push({id: 'copy', name: 'About copy', blocks: [makeBlock('hero')]}); });
  assert.ok(p.space!.frames.copy.x > 0, 'the next one goes beside the first');
  assert.equal(p.starter, p.pages[0].id, 'the hidden page is still hidden, and still where it was');
  assert.deepEqual([p.space!.frames[p.pages[0].id].x, p.space!.frames[p.pages[0].id].y], [0, 0]);
});

test('a board opened with no camera of its own starts at its start, and waits to be fitted until it shows a frame', () => {
  assert.deepEqual(openingCamera(undefined), {camera: {x: 0, y: 0, zoom: 1}, fit: true}, 'not the camera of the board looked at before');
  assert.deepEqual(openingCamera({x: -900, y: 40, zoom: 0.5}), {camera: {x: -900, y: 40, zoom: 0.5}, fit: false});
});

test('the person going to the hidden page (Edit in the app) shows it, beside the page that took its place, in that step', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  p = apply(h, p, {ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]});
  const [starter, html] = [p.pages[0].id, p.pages[1].id];
  edit(h, p, q => { assert.equal(revealStarter(q, html), false, 'going to another page leaves it hidden'); });
  assert.equal(p.starter, starter);
  edit(h, p, q => { assert.equal(revealStarter(q, starter), true); });
  assert.equal(p.starter, undefined);
  assert.deepEqual(visiblePages(p).map(x => x.id), [starter, html]);
  assert.equal(overlap(p, starter, html), false);
});

test('a full board with its hidden page says the page holds one of the places; any other full board says only the limit', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  p = apply(h, p, {ops: Array.from({length: 29}, (_, i) => ({op: 'html_page', name: `Page ${i}`, html: PAGE}))});
  assert.equal(visiblePages(p).length, 29);
  assert.match(fullBoard(p, false), /at most 30 pages/);
  assert.match(fullBoard(p, false), /empty page/, 'the board shows 29, so why it is full is said');
  assert.match(fullBoard(p, true), /빈 페이지/);
  assert.doesNotMatch(fullBoard(initialProject(), false), /empty page/);
});

test('a reveal that moves nothing still leaves the history\'s baseline without the mark, so a later edit never moves the page', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  const starter = p.pages[0].id;
  edit(h, p, q => { revealStarter(q, starter); });
  assert.equal(p.starter, undefined);
  assert.equal(h.last?.starter, undefined, 'the state the next change is read against has no mark either');
  p = apply(h, p, {ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]});
  const html = p.pages[1].id;
  edit(h, p, q => { q.space!.frames[html] = {...q.space!.frames[html], x: 0, y: 0}; });
  assert.deepEqual([p.space!.frames[starter].x, p.space!.frames[starter].y], [0, 0], 'the shown page stays where it is when a frame is moved over it');
});

test('undo and redo of a change elsewhere, and a batch that only patches, leave the hidden page hidden', () => {
  const h = newHistory();
  let p = opened(newBoard('Empty'));
  p = apply(h, p, {ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]});
  p = stepForScreen(p, 'undo', h, YOU)!.project;
  assert.equal(p.starter, p.pages[0].id, 'after undo');
  p = stepForScreen(p, 'redo', h, YOU)!.project;
  assert.equal(p.starter, p.pages[0].id, 'after redo');
  p = apply(h, p, {ops: [], patch: [{op: 'set', on: 'project', field: 'name', value: 'Renamed'}]});
  assert.equal(p.name, 'Renamed');
  assert.equal(p.starter, p.pages[0].id, 'after a batch that only patches');
  assert.deepEqual(visiblePages(p).map(x => x.name), ['Briefing']);
});
