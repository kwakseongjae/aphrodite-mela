/**
 * 0.3-P1: an agent makes and changes free pages in one aphrodite_apply_edits call — a page made whole,
 * replaced whole, or one exact passage changed — with a reason and against a revision, all of it or none.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, fingerprint, isApproved, type Project} from '../src/model.ts';
import {parseBatch, type Batch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';
import {htmlWindow} from '../src/free-page.ts';
import {applyPatch, isViewOnly, diffProject} from '../src/ledger/patch.ts';
import {begin, end, step, newHistory} from '../src/ledger/session.ts';
import {emptyLedger, designOf} from '../src/ledger/ledger.ts';
import {sanitizeSpace} from '../src/editor/space.ts';

const REASON = 'The person asked for a briefing page beside the design.';
const PERSON = {kind: 'person' as const, name: 'you'};
const AGENT = {kind: 'agent' as const, name: 'claude-code'};
const PAGE = '<!doctype html><html><head><style>h1{font:600 32px serif}</style></head><body>\n<h1>Briefing</h1>\n<p id="lead">Three things changed this week.</p>\n<p>Row</p>\n<p>Row</p>\n<script>document.body.dataset.ready = "1";</script>\n</body></html>';
const batch = (payload: Record<string, unknown>): Batch => {
  const parsed = parseBatch({reason: REASON, ...payload});
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.batch;
};
/** A project with one free page beside its section page, made the way an agent makes it. */
function withFreePage(): {project: Project; id: string} {
  const p = initialProject();
  const made = runBatch(p, batch({ops: [{op: 'html_page', name: 'Briefing', html: PAGE}]}), '');
  assert.ok(made.ok, made.ok ? '' : made.error);
  if (!made.ok) throw new Error();
  return {project: made.project, id: made.created[0]};
}
/** Everything that would show that something landed. */
const state = (p: Project) => ({revision: fingerprint(p), pages: p.pages.length, html: p.pages.map(x => x.html ?? null), frames: Object.keys(p.space?.frames ?? {}).length});

test('html_page makes an html page with the document exactly as sent, beside the person, not in front of them', () => {
  const p = initialProject(), frozen = JSON.stringify(p);
  const result = runBatch(p, batch({ops: [{op: 'html_page', name: 'Briefing', html: PAGE, width: 900, height: 1400}]}), '');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.created.length, 1, 'the reply names the page it made');
  const page = result.project.pages.find(x => x.id === result.created[0])!;
  assert.deepEqual([page.kind, page.html, page.name, page.blocks], ['html', PAGE, 'Briefing', []]);
  assert.equal(result.project.activePageId, p.activePageId, 'the person stays on the page they were on');
  assert.deepEqual(result.project.space!.frames[page.id], {...result.project.space!.frames[page.id], preset: 'custom', width: 900, height: 1400});
  assert.equal(JSON.stringify(p), frozen, 'the project passed in is never touched');
});

test('html_set replaces the document; html_replace changes one passage, or every one with all', () => {
  const {project, id} = withFreePage();
  const set = runBatch(project, batch({ops: [{op: 'html_set', page_id: id, html: '<p>Fresh</p>'}]}), '');
  assert.ok(set.ok && set.project.pages.find(x => x.id === id)!.html === '<p>Fresh</p>');
  const once = runBatch(project, batch({ops: [{op: 'html_replace', page_id: id, find: 'Three things changed', replace: 'Four things changed'}]}), '');
  assert.ok(once.ok);
  if (!once.ok) return;
  assert.equal(once.project.pages.find(x => x.id === id)!.html, PAGE.replace('Three things changed', 'Four things changed'));
  const every = runBatch(project, batch({ops: [{op: 'html_replace', page_id: id, find: '<p>Row</p>', replace: '<p>Line $& $1</p>', all: true}]}), '');
  assert.ok(every.ok);
  if (!every.ok) return;
  assert.equal(every.project.pages.find(x => x.id === id)!.html, PAGE.split('<p>Row</p>').join('<p>Line $& $1</p>'), 'the replacement is taken literally');
});

test('a passage read with a window onto the page can be sent back as find', () => {
  const {project, id} = withFreePage();
  const html = project.pages.find(x => x.id === id)!.html!;
  const read = htmlWindow(html, {start: html.indexOf('<p id="lead">'), end: html.indexOf('</p>', html.indexOf('<p id="lead">')) + 4});
  const result = runBatch(project, batch({ops: [{op: 'html_replace', page_id: id, find: read.html, replace: '<p id="lead">Nothing changed.</p>'}]}), '');
  assert.ok(result.ok, result.ok ? '' : result.error);
});

test('the six ways an html batch can fail all change nothing', () => {
  const {project, id} = withFreePage();
  const section = project.pages[0].id, before = state(project), frozen = JSON.stringify(project);
  const cases: [string, Record<string, unknown>[], RegExp][] = [
    ['the passage is not there', [{op: 'html_replace', page_id: id, find: 'Five things', replace: 'x'}], /not on page/],
    ['the passage is there more than once', [{op: 'html_replace', page_id: id, find: '<p>Row</p>', replace: 'x'}], /2 times/],
    ['the second op fails', [{op: 'html_set', page_id: id, html: '<p>Fine</p>'}, {op: 'html_replace', page_id: id, find: 'missing', replace: 'x'}], /not on page/],
    ['a page is made and then an op fails', [{op: 'html_page', name: 'Orphan', html: '<p>Orphan</p>'}, {op: 'html_set', page_id: 'no-such-page', html: 'x'}], /no page no-such-page/],
    ['an html op on a section page', [{op: 'html_set', page_id: section, html: '<p>x</p>'}], /section page/],
    ['a section op on an html page', [{op: 'add', component_kind: 'cta'}], /html page/],
  ];
  for (const [why, ops, says] of cases) {
    const result = runBatch(project, batch({ops, ...(why === 'a section op on an html page' ? {page_id: id} : {})}), '');
    assert.ok(!result.ok, why);
    if (result.ok) continue;
    assert.match(result.error, says, why);
    assert.equal(JSON.stringify(project), frozen, `${why}: the project passed in is untouched`);
  }
  assert.deepEqual(state(project), before);
});

test('what an html page may hold is checked where it is written: no paths on this machine, no more than 2MB', () => {
  const {project, id} = withFreePage();
  for (const ops of [
    [{op: 'html_page', name: 'Shot', html: '<img src="file:///Users/someone/shot.png">'}],
    [{op: 'html_set', page_id: id, html: '<video src="asset://localhost/clip.mp4"></video>'}],
    [{op: 'html_replace', page_id: id, find: '<h1>Briefing</h1>', replace: '<img src="http://asset.localhost/a.png">'}],
  ]) {
    const result = runBatch(project, batch({ops}), '');
    assert.ok(!result.ok && /media:/.test(result.error), JSON.stringify(ops));
  }
  const grown = runBatch(project, batch({ops: [{op: 'html_replace', page_id: id, find: '<p>Row</p>', replace: 'x'.repeat(1_100_000), all: true}]}), '');
  assert.ok(!grown.ok && /2,000,000/.test(grown.error), 'two passages growing past the cap');
  const patched = runBatch(project, batch({patch: [{op: 'set', on: 'page', page_id: id, field: 'html', value: '<img src="file:///etc/x.png">'}]}), '');
  assert.ok(!patched.ok && /media:/.test(patched.error), 'a patch is held to the same rule');
  const sections = runBatch(project, batch({patch: [{op: 'insert_block', page_id: id, index: 0, block: project.pages[0].blocks[0]}]}), '');
  assert.ok(!sections.ok, 'a patch cannot put sections on an html page');
});

test('no html path writes the approval: a changed page is simply not the one the person approved', () => {
  const {project, id} = withFreePage();
  project.approvedFingerprint = fingerprint(project);
  assert.ok(isApproved(project), 'the person approved this composition');
  const payloads: Record<string, unknown>[] = [
    {ops: [{op: 'html_set', page_id: id, html: '<p>Other</p>'}]},
    {ops: [{op: 'html_replace', page_id: id, find: 'Three things', replace: 'Two things'}]},
    {patch: [{op: 'text', on: 'page', page_id: id, field: 'html', hunks: [{at: 0, remove: '<!doctype html>', insert: ''}]}]},
  ];
  for (const payload of payloads) {
    const result = runBatch(project, batch(payload), '');
    assert.ok(result.ok, result.ok ? '' : result.error);
    if (!result.ok) continue;
    assert.equal(result.project.approvedFingerprint, project.approvedFingerprint, 'the approval record stays the person\'s, untouched');
    assert.equal(isApproved(result.project), false, 'the changed page is not the approved one');
  }
  assert.ok('error' in parseBatch({reason: REASON, patch: [{op: 'text', on: 'project', page_id: id, field: 'approvedFingerprint', hunks: [{at: 0, remove: '', insert: 'x'}]}]}), 'a text diff cannot reach the approval');
  project.ledger = emptyLedger();
  const history = newHistory(project), before = begin(project, history);
  const changed = runBatch(project, batch(payloads[0]), '');
  assert.ok(changed.ok);
  if (!changed.ok) return;
  const current = {...changed.project, ledger: project.ledger};
  end(current, before, {author: AGENT, source: 'agent:apply', reason: REASON}, history);
  const undone = step(current, 'undo', history, AGENT)!;
  assert.equal(undone.project.approvedFingerprint, project.approvedFingerprint, 'an agent\'s undo of its own html change moves no approval');
});

test('a media item arrives with media_add (0.3-P2), not through a patch', () => {
  const p = initialProject();
  const media = {id: 'media-1', name: 'Clip', blocks: [], kind: 'media', media: {src: `media:${'b'.repeat(64)}`, mime: 'video/mp4', width: 640, height: 360}};
  const inserted = runBatch(p, batch({patch: [{op: 'insert_page', index: 1, page: media}]}), '');
  assert.ok(!inserted.ok && /media_add/.test(inserted.error), inserted.ok ? 'landed' : inserted.error);
});

test('thirty pages of html that would not fit in a saved project are refused, not half made', () => {
  const p = initialProject();
  const big = '<p>' + 'x'.repeat(1_900_000) + '</p>';
  const result = runBatch(p, batch({ops: Array.from({length: 12}, (_, i) => ({op: 'html_page', name: `Big ${i}`, html: big}))}), '');
  assert.ok(!result.ok && /20MB|invalid/.test(result.error), result.ok ? 'landed' : result.error);
});

test('the person\'s ⌘Z takes back an agent\'s whole replacement, exactly', () => {
  const {project, id} = withFreePage();
  project.ledger = emptyLedger();
  const history = newHistory(project);
  let current = project;
  const before = begin(current, history);
  const result = runBatch(current, batch({ops: [{op: 'html_set', page_id: id, html: PAGE.replace('Briefing', 'Rewritten').replace(/Row/g, 'Other')}]}), '');
  assert.ok(result.ok);
  if (!result.ok) return;
  current = {...result.project, ledger: current.ledger};
  const change = end(current, before, {author: AGENT, source: 'agent:apply', reason: REASON}, history)!;
  assert.equal(change.author.kind, 'agent');
  const undone = step(current, 'undo', history, PERSON)!;
  assert.equal(undone.project.pages.find(x => x.id === id)!.html, PAGE);
  assert.equal(undone.change!.author.kind, 'person');
  assert.deepEqual(designOf(undone.project), designOf(project));
});

test('a frame\'s height is the design, and moving the frame is still only the view', () => {
  const {project, id} = withFreePage();
  assert.deepEqual(sanitizeSpace({frames: {[id]: {x: 1, y: 2, preset: 'desktop', height: 1200}}}), {frames: {[id]: {x: 1, y: 2, preset: 'desktop', height: 1200}}});
  assert.deepEqual(sanitizeSpace({frames: {[id]: {x: 1, y: 2, preset: 'desktop', height: 50}}}), {frames: {}});
  const moved = JSON.parse(JSON.stringify(project)) as Project, taller = JSON.parse(JSON.stringify(project)) as Project;
  moved.space!.frames[id] = {...moved.space!.frames[id], x: 4000};
  taller.space!.frames[id] = {...taller.space!.frames[id], height: 3000};
  assert.equal(isViewOnly(diffProject(project, moved), project, moved), true);
  assert.equal(isViewOnly(diffProject(project, taller), project, taller), false);
  assert.deepEqual(applyPatch(project, diffProject(project, taller)), taller);
});
