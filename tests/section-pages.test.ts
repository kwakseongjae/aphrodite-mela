/**
 * 0.3-L4b: a new board looks empty. The section page every project is made with is kept (the model, its fingerprint, the
 * ledger and undo do not change), but while it carries the new board's mark it is not drawn, not listed and takes no
 * place on the board; the section tools show only once the board has a section page to use them on.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, fingerprint, agentRevision, type Project} from '../src/model.ts';
import {parseBatch, type Batch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';
import {newBoard, isStarterPage, visiblePages, hasSectionPage, placementSpace} from '../src/editor/starter.ts';
import {dockHtml, dockShortcut} from '../src/editor/dock.ts';
import {commandTable, sectionOnly} from '../src/editor/command-palette.ts';
import {referencesPanelHtml, type Reference} from '../src/design/references.ts';
import {ensureSpace} from '../src/editor/space.ts';

const REASON = 'The person asked for this.';
const batch = (payload: Record<string, unknown>): Batch => { const parsed = parseBatch({reason: REASON, ...payload}); if ('error' in parsed) throw new Error(parsed.error); return parsed.batch; };
/** A project as the new-project form makes one: the starter section page, with no sections. */
function fresh(): Project { const p = newBoard('Empty'); ensureSpace(p); return p; }
const PAGE = '<!doctype html><html><body><h1>Briefing</h1></body></html>';

test('a new board shows no page: its starter is not drawn, and there is no section page to use the tools on', () => {
  const p = fresh();
  assert.equal(isStarterPage(p, p.pages[0]), true);
  assert.deepEqual(visiblePages(p), []);
  assert.equal(hasSectionPage(p), false);
});

test('the sample, and any board whose first page has sections, is drawn as before', () => {
  const p = initialProject();
  assert.equal(isStarterPage(p, p.pages[0]), false);
  assert.deepEqual(visiblePages(p).map(x => x.id), p.pages.map(x => x.id));
  assert.equal(hasSectionPage(p), true);
});

test('a page an agent puts on a new board is the only thing on it, and takes the place the starter would have', () => {
  const p = fresh();
  const made = runBatch(p, batch({ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]}), '');
  if (!made.ok) throw new Error(made.error);
  const q = made.project;
  assert.deepEqual(visiblePages(q).map(x => x.name), ['Briefing']);
  assert.equal(hasSectionPage(q), false, 'an html page is not a section page: the section tools stay away');
  const placed = q.space!.frames[visiblePages(q)[0].id];
  assert.deepEqual([placed.x, placed.y], [0, 0], 'it sits where the board starts, not to the right of an empty frame no one sees');
});

test('a new section frame is drawn, empty, and brings the section tools; the starter stays out of sight', () => {
  const p = fresh();
  const made = runBatch(p, batch({ops: [{op: 'page', name: 'Landing'}]}), '');
  if (!made.ok) throw new Error(made.error);
  assert.deepEqual(visiblePages(made.project).map(x => x.name), ['Landing']);
  assert.equal(hasSectionPage(made.project), true);
});

test('only the first page can be the starter: an empty section page made later is a frame the person asked for', () => {
  const p = fresh();
  const later = {id: 'later', name: 'Frame', blocks: []};
  p.pages.push(later);
  assert.equal(isStarterPage(p, later), false);
  assert.deepEqual(visiblePages(p).map(x => x.id), ['later']);
});

test('deciding what to draw changes nothing that is saved: the fingerprint, the revision and the ledger are as made', () => {
  const p = fresh();
  const before = {json: JSON.stringify(p), print: fingerprint(p), revision: agentRevision(p)};
  visiblePages(p); hasSectionPage(p); placementSpace(p);
  assert.deepEqual({json: JSON.stringify(p), print: fingerprint(p), revision: agentRevision(p)}, before);
  assert.equal(p.ledger, undefined, 'a new board has no ledger yet, and drawing it does not start one');
});

test('the space the next item is placed in leaves the starter out, and keeps every other frame', () => {
  const p = fresh();
  const made = runBatch(p, batch({ops: [{op: 'html_page', name: 'One', html: PAGE}]}), '');
  if (!made.ok) throw new Error(made.error);
  const q = made.project;
  assert.deepEqual(Object.keys(placementSpace(q).frames), [visiblePages(q)[0].id]);
  assert.ok(q.space!.frames[q.pages[0].id], 'the starter keeps its frame in the saved space');
});

test('a board whose first page is shown (no mark) places the next item beside it, not on top of it', () => {
  const p = initialProject(); p.pages[0].blocks = []; ensureSpace(p);
  const made = runBatch(p, batch({ops: [{op: 'html_page', name: 'Beside', html: PAGE}]}), '');
  if (!made.ok) throw new Error(made.error);
  const beside = made.project.space!.frames[made.created[0]];
  assert.ok(beside.x > 0, 'the empty page is on the board, so the new one goes to its right');
});

test('without a section page the dock has no add, reference or Get Vibe, and A, R and G do nothing', () => {
  const none = dockHtml({mode: 'design', language: 'en', sections: false});
  for (const action of ['component-explorer', 'reference', 'autofill']) assert.doesNotMatch(none, new RegExp(`data-action="${action}"`), action);
  assert.match(none, /data-action="new-frame"/, 'making a frame, which starts section work, stays');
  for (const key of ['A', 'R', 'G']) assert.equal(dockShortcut(key, false), null, key);
  assert.equal(dockShortcut('F', false)?.tool?.action, 'new-frame');
  const some = dockHtml({mode: 'design', language: 'en'});
  assert.match(some, /data-action="component-explorer"/);
  assert.equal(dockShortcut('A')?.tool?.action, 'component-explorer');
});

test('without a section page the palette offers no section tool, but still the new frame and the Archive', () => {
  const ctx = {hasSelection: false, canUndo: false, canRedo: false, approved: false, viewport: 'desktop' as const};
  const none = commandTable({...ctx, sections: false}).map(c => c.action);
  for (const action of ['focus-component-search', 'autofill', 'systems', 'theme-review', 'component-explorer', 'reference', 'moa-recipe', 'add']) assert.ok(!none.includes(action), action);
  assert.ok(none.includes('new-frame'));
  assert.ok(commandTable({...ctx, sections: false}).some(c => c.action === 'tab' && c.data?.tab === 'archive'), 'the Archive opens from the palette');
  const some = commandTable(ctx).map(c => c.action);
  for (const action of ['focus-component-search', 'autofill', 'systems', 'component-explorer', 'reference', 'add']) assert.ok(some.includes(action), action);
});

test('a section tool is asked again when it runs: a palette drawn before the board lost its last section page cannot run one', () => {
  for (const action of ['focus-component-search', 'autofill', 'systems', 'theme-review', 'component-explorer', 'reference', 'moa-recipe', 'add', 'reference-promote']) assert.equal(sectionOnly(action), true, action);
  for (const action of ['new-frame', 'tab', 'page', 'export', 'preview', 'undo', 'reference-add-image', 'reference-open', 'reference-delete']) assert.equal(sectionOnly(action), false, action);
});

test('on a board without a section page the Archive keeps its pictures and links, and offers no analysis', () => {
  const kept: Reference = {id: 'a1', kind: 'link', scope: 'shared', url: 'https://www.example.com/a', title: 'A lamp', addedAt: '2026-09-16T09:00:00Z', addedBy: 'you'};
  const none = referencesPanelHtml([kept], 'all', false, true, false);
  assert.doesNotMatch(none, /data-action="reference-promote"/);
  for (const action of ['reference-add-image', 'reference-add-link', 'reference-open', 'reference-delete', 'reference-scope']) assert.match(none, new RegExp(`data-action="${action}"`), action);
  assert.match(referencesPanelHtml([kept], 'all', false, true), /data-action="reference-promote"/, 'with a section page it is offered as before');
});
