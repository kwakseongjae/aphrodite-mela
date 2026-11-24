/**
 * 0.3-R ①: no change but the person's own brings an approval to a board that did not have it.
 *
 * The rule is kept where a change is recorded (src/ledger/session.ts): `end`, `step`, and the drift `begin` records. A
 * fingerprint the content no longer matches goes as part of the change that made it stale, under that change's author,
 * with a fixed note in its reason; a step by anyone but the person brings content back and never an approval. Codex's two
 * routes (P3 Part B), and the ones the pre-research found, each in turn.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, isApproved, approvalPrint, type Project} from '../src/model.ts';
import * as session from '../src/ledger/session.ts';
import {begin, end, newHistory, step, stepForScreen, HumanOnlyStep, type History} from '../src/ledger/session.ts';
import type {Author} from '../src/ledger/ledger.ts';

const me: Author = {kind: 'person', name: 'you'};
const bot: Author = {kind: 'agent', name: 'Claude Code'};
const s = session as unknown as Record<string, unknown>;
const MARK = () => { assert.equal(typeof s.APPROVAL_CLEARED, 'string', 'session.ts names the note a clearing leaves'); return s.APPROVAL_CLEARED as string; };

function edit(p: Project, h: History, change: (p: Project) => void, author: Author = me, source = 'editor:change', reason?: string) {
  const before = begin(p, h);
  change(p);
  return end(p, before, {author, source, reason}, h);
}
/** An approved board, as the person's own approve leaves it: one change, by the person. */
function approved(): {p: Project; h: History} {
  const p = initialProject(), h = newHistory(p);
  edit(p, h, x => { x.approvedFingerprint = approvalPrint(x); });
  assert.equal(isApproved(p), true);
  return {p, h};
}
const brief = initialProject().brief;

test('Codex route 1: an agent\'s patch that puts the brief back leaves the board a draft', () => {
  const {p, h} = approved();
  const changed = edit(p, h, x => { x.brief = 'Something else'; }, me)!;
  assert.equal(p.approvedFingerprint, undefined, 'the stale fingerprint goes with the change that made it stale');
  assert.ok(changed.ops.some(op => op.op === 'set' && op.on === 'project' && op.field === 'approvedFingerprint'), 'and the ledger says so, in that change');
  assert.ok(changed.reason?.includes(MARK()), 'with the fixed note');
  edit(p, h, x => { x.brief = brief; }, bot, 'agent:apply', 'Put the brief back.');
  assert.equal(isApproved(p), false, 'content that comes back is a draft');
});

test('the clearing is the triggering change\'s, by its author, and keeps the reason it was given', () => {
  const {p, h} = approved();
  const c = edit(p, h, x => { x.brief = 'Agent brief'; }, bot, 'agent:apply', 'Tighter brief.')!;
  assert.deepEqual(c.author, bot);
  assert.ok(c.reason!.startsWith('Tighter brief.'), c.reason);
  assert.ok(c.reason!.includes(MARK()));
  const long = edit(p, h, x => { x.brief = 'x'; }, bot, 'agent:apply', 'y'.repeat(600));
  assert.ok(long && !long.reason?.includes(MARK()), 'a change that clears nothing carries no note');
  const {p: q, h: g} = approved();
  const cut = edit(q, g, x => { x.brief = 'z'; }, bot, 'agent:apply', 'y'.repeat(600))!;
  assert.ok(cut.reason!.length <= 500 && cut.reason!.endsWith(MARK()), 'a long reason gives way to the note, never the other way');
});

test('Codex route 2: an agent\'s undo onto the approved content brings the content back, not the approval', () => {
  const {p, h} = approved();
  edit(p, h, x => { x.brief = 'Something else'; }, me);
  const undone = step(p, 'undo', h, bot)!;
  assert.equal(undone.project.brief, brief, 'the agent may take back the edit');
  assert.equal(isApproved(undone.project), false, 'and the board stays a draft');
  assert.equal(undone.project.approvedFingerprint, undefined);
  assert.ok(undone.change!.reason?.includes(MARK()), 'the step that would have brought it back says why it did not');
  assert.ok(!undone.change!.ops.some(op => op.op === 'set' && op.field === 'approvedFingerprint'), 'and writes no approval');
});

test('an agent may undo its own edit on an approved board: the clearing that came with it is not a write of the approval', () => {
  const {p, h} = approved();
  const title = p.pages[0].blocks[1].title;
  edit(p, h, x => { x.pages[0].blocks[1].title = 'Agent title'; }, bot, 'agent:apply', 'Try a title.');
  const undone = step(p, 'undo', h, bot);
  assert.ok(undone, 'the step was taken');
  assert.equal(undone!.project.pages[0].blocks[1].title, title, 'and took the title back');
  assert.equal(isApproved(undone!.project), false, 'a draft');
});

test('the person\'s own ⌘Z brings the approval back, whoever made the edit', () => {
  for (const author of [me, bot]) {
    const {p, h} = approved();
    edit(p, h, x => { x.brief = 'Something else'; }, author);
    const undone = step(p, 'undo', h, me)!;
    assert.equal(isApproved(undone.project), true, `after an edit by ${author.kind}`);
  }
});

test('an agent\'s redo cannot bring an approval back either', () => {
  const {p, h} = approved();
  edit(p, h, x => { x.brief = 'Something else'; }, me);
  let q = step(p, 'undo', h, me)!.project;
  assert.equal(isApproved(q), true);
  q = step(q, 'redo', h, bot)!.project;
  assert.equal(q.brief, 'Something else');
  const back = step(q, 'undo', h, bot)!.project;
  assert.equal(isApproved(back), false, 'the agent\'s undo after its redo is content only');
});

test('a step by an agent that only writes the approval is still refused, both ways', () => {
  const {p, h} = approved();
  assert.throws(() => step(p, 'undo', h, bot), HumanOnlyStep, 'taking back the person\'s approve');
  const q = step(p, 'undo', h, me)!.project;
  assert.equal(isApproved(q), false);
  assert.throws(() => step(q, 'redo', h, bot), HumanOnlyStep, 'giving it again');
});

test('an agent\'s undo of a step that left the approval as it was keeps the approval (0.2.5 M1)', () => {
  const {p, h} = approved();
  p.pages.push({id: 'second', name: 'Second', blocks: []});
  p.approvedFingerprint = approvalPrint(p);
  const h2 = newHistory(p);
  edit(p, h2, x => { x.activePageId = 'second'; }, bot, 'agent:apply');
  assert.equal(isApproved(p), true, 'opening a page is not a change to the design');
  const undone = step(p, 'undo', h2, bot)!;
  assert.equal(isApproved(undone.project), true);
  void h;
});

test('drift caught after the fact cannot make an approval either (reconcile)', () => {
  const {p, h} = approved();
  edit(p, h, x => { x.brief = 'Something else'; }, me);
  // Behind the ledger: the content goes back, and the old fingerprint is written in with it.
  p.brief = brief;
  p.approvedFingerprint = approvalPrint(p);
  begin(p, h);
  assert.equal(isApproved(p), false, 'an unknown author brings no approval');
  const drift = p.ledger!.changes.at(-1)!;
  assert.equal(drift.author.kind, 'unknown');
  assert.ok(drift.reason?.includes(MARK()));
  assert.ok(!drift.ops.some(op => op.op === 'set' && op.field === 'approvedFingerprint' && op.value !== undefined), 'the drift recorded writes no approval');
});

test('drift that leaves a fingerprint stale clears it as part of the drift', () => {
  const {p, h} = approved();
  p.brief = 'Behind the ledger';
  begin(p, h);
  assert.equal(p.approvedFingerprint, undefined);
  p.brief = brief;
  assert.equal(isApproved(p), false);
});

test('the person editing the content back by hand is a draft too: only approving approves', () => {
  const {p, h} = approved();
  edit(p, h, x => { x.brief = 'Something else'; }, me);
  edit(p, h, x => { x.brief = brief; }, me);
  assert.equal(isApproved(p), false);
});

test('the screen\'s step shows what the ledger says: an agent\'s step shows a draft', () => {
  const {p, h} = approved();
  edit(p, h, x => { x.brief = 'Something else'; }, me);
  const shown = stepForScreen(p, 'undo', h, bot)!;
  assert.equal(shown.project.approvedFingerprint, undefined);
  assert.equal(isApproved(shown.project), false);
});

test('a change made aside from the editor (Home\'s rename) goes through the same rule and is recorded', () => {
  assert.equal(typeof s.changeAside, 'function', 'session.ts exports changeAside');
  const aside = s.changeAside as (p: Project, change: (p: Project) => void, meta: {author: Author; source: string}) => unknown;
  const {p} = approved();
  const name = p.name;
  aside(p, x => { x.name = 'Renamed on Home'; }, {author: me, source: 'home:rename'});
  assert.equal(p.approvedFingerprint, undefined);
  const c = p.ledger!.changes.at(-1)!;
  assert.equal(c.source, 'home:rename');
  assert.ok(c.reason?.includes(MARK()));
  aside(p, x => { x.name = name; }, {author: bot, source: 'home:rename'});
  assert.equal(isApproved(p), false, 'renaming it back is a draft');
});

test('a change whose new board already dropped the stale fingerprint (a batch read back through parseProject) is marked the same', () => {
  const {p, h} = approved();
  const before = begin(p, h);
  // What applyBatch does: the batch's result, read as a saved board is, takes the place of the board.
  const next = {...JSON.parse(JSON.stringify(p)), brief: 'Agent brief'} as Project;
  delete next.approvedFingerprint;
  Object.assign(p, next); delete p.approvedFingerprint;
  const c = end(p, before, {author: bot, source: 'agent:apply', reason: 'Tighter.'}, h)!;
  assert.ok(c.reason?.includes(MARK()), 'the clearing is noted even when the board came in without the fingerprint');
  assert.doesNotThrow(() => step(p, 'undo', h, bot), 'and the agent may take its own change back');
});

test('the person taking back their own approve is not noted as a clearing', () => {
  const {p, h} = approved();
  const undone = step(p, 'undo', h, me)!;
  assert.equal(isApproved(undone.project), false);
  assert.ok(!undone.change?.reason?.includes(MARK()));
});
