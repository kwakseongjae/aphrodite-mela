/**
 * 0.3-R ②: the revision an agent reads and sends back binds the board, its design and its frames.
 *
 * Before, base_revision was the design's fingerprint alone: a batch written against board A landed on a copy of A with
 * the same design, and one written before the person resized a frame landed after it. Now the revision is the board's
 * id, the design and every frame's place and size (all a batch can change), and the approval's print is left as it was.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.ts';
import {initialProject, fingerprint, approvalPrint, type Project} from '../src/model.ts';
import {ensureSpace} from '../src/editor/space.ts';
import {changesSince, record, emptyLedger, readLedger, type Author} from '../src/ledger/ledger.ts';
import {begin, end, newHistory} from '../src/ledger/session.ts';

const bot: Author = {kind: 'agent', name: 'Claude Code'};
const rev = (p: Project) => { const f = (model as unknown as Record<string, unknown>).agentRevision; assert.equal(typeof f, 'function', 'model.ts exports agentRevision'); return (f as (p: Project) => string)(p); };
const board = () => { const p = initialProject(); ensureSpace(p); return p; };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test('a copy of a board with the same design is another revision (Codex: a batch for A lands on its copy)', () => {
  const a = board(), copy = {...clone(a), id: 'copy-of-a'};
  assert.equal(fingerprint(copy), fingerprint(a), 'the design is the same');
  assert.notEqual(rev(copy), rev(a));
});

test('a frame resized or moved is another revision (Codex: a batch written before the person resized lands after it)', () => {
  const a = board(), id = a.pages[0].id;
  const resized = clone(a); resized.space!.frames[id].preset = 'mobile';
  const wide = clone(a); wide.space!.frames[id].preset = 'custom'; wide.space!.frames[id].width = 900;
  const moved = clone(a); moved.space!.frames[id].x += 40;
  for (const [name, b] of [['resized', resized], ['custom width', wide], ['moved (a batch can replace the whole space)', moved]] as const) assert.notEqual(rev(b), rev(a), name);
});

test('what a batch cannot change, and key order, leave the revision as it is', () => {
  const a = board();
  const approved = {...clone(a), approvedFingerprint: approvalPrint(a)};
  assert.equal(rev(approved), rev(a), 'the approval is not something a batch writes');
  const turned = JSON.parse(JSON.stringify(a, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)) as Project;
  assert.equal(rev(turned), rev(a));
  assert.equal(rev(clone(a)), rev(a), 'a read gives the same revision');
});

test('the approval\'s print is not the revision, and does not move with the board or its frames', () => {
  const a = board(), copy = {...clone(a), id: 'copy-of-a'};
  copy.space!.frames[copy.pages[0].id].preset = 'mobile';
  assert.equal(approvalPrint(copy), approvalPrint(a), 'an approval is of the design');
});

test('the ledger records the revisions an agent reads: base and result', () => {
  const p = board(), h = newHistory(p);
  const before = rev(p);
  const b4 = begin(p, h);
  p.brief = 'Changed';
  const c = end(p, b4, {author: bot, source: 'agent:apply', reason: 'x'}, h)!;
  assert.equal(c.baseRevision, before);
  assert.equal(c.revision, rev(p));
});

test('changes since a revision: one a change made, one a kept change started from, and one not kept here', () => {
  const p = board(), h = newHistory(p);
  const first = rev(p);
  for (const brief of ['One', 'Two', 'Three']) { const b = begin(p, h); p.brief = brief; end(p, b, {author: bot, source: 'agent:apply'}, h); }
  const second = p.ledger!.changes[0].revision;
  assert.deepEqual(changesSince(p.ledger, second).changes.map(c => c.seq), [2, 3]);
  assert.deepEqual(changesSince(p.ledger, first).changes.map(c => c.seq), [1, 2, 3], 'the revision the first kept change started from');
  const unknown = changesSince(p.ledger, 'r2:nowhere') as ReturnType<typeof changesSince> & {known?: boolean};
  assert.equal(unknown.known, false, 'a revision not kept here is said to be unknown');
  assert.deepEqual(unknown.changes, [], 'rather than answered with the history from its start');
});

test('a ledger written before 0.3-R still reads, and its revisions are still found', () => {
  const p = board();
  const ledger = emptyLedger();
  const old = clone(p); old.brief = 'Old';
  record(ledger, p, old, {author: bot, source: 'agent:apply'});
  // As main wrote them: the design's fingerprint.
  ledger.changes[0].baseRevision = fingerprint(p); ledger.changes[0].revision = fingerprint(old);
  const read = readLedger(clone(ledger))!;
  assert.equal(read.changes[0].revision, fingerprint(old), 'an old entry is not rewritten');
  assert.deepEqual(changesSince(read, fingerprint(p)).changes.map(c => c.seq), [1]);
});

test('edit and system read the revision again once the commit has saved what the person was typing', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /commit\(\(\)=>\{late=staleSince\(d\.baseRevision,'edit'\);if\(late\)return;/, 'edit');
  assert.match(main, /commit\(\(\)=>\{late=staleSince\(d\.baseRevision,'system'\);if\(late\)return;/, 'system');
  assert.match(main, /function revisionInfo\(\)\{return \{revision:agentRevision\(project\)/, 'and every reply names the agent revision');
  // What the check does is shown with the app running: verify:tools sends edit and system with the revision read before the
  // person typed and holds the 409 and the board unchanged (0.3-R fix 1 #12); this pins only where the check sits.
  const tools = readFileSync(new URL('../scripts/verify-agent-tools.mjs', import.meta.url), 'utf8');
  assert.match(tools, /edit and system sent with the revision read before the person typed are refused with a 409/);
});
