/**
 * aphrodite_apply_edits since the ledger: a reason on every batch, a revision to write against, the
 * ledger's own ops accepted back as `patch`, and the batch run as a function of the project — no app.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject, makeBlock, type Project} from '../src/model.ts';
import {parseBatch, MAX_PATCH, type Batch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';
import {parseAgentCommand} from '../src/agent/bridge.ts';
import {isRead} from '../src/agent/authority.ts';
import {changesSince, designOf} from '../src/ledger/ledger.ts';
import {begin, end, newHistory} from '../src/ledger/session.ts';

const REASON = 'The brief asks for it.';
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const batch = (payload: Record<string, unknown>): Batch => {
  const parsed = parseBatch(payload);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.batch;
};

test('a batch without a reason is refused, and the refusal says what to write', () => {
  const missing = parseBatch({ops: [{op: 'delete', block_id: 'selection'}]});
  assert.ok('error' in missing);
  assert.match(missing.error, /reason/);
  assert.match(missing.error, /shown to the person/);
  assert.ok('error' in parseBatch({reason: '   ', ops: [{op: 'delete', block_id: 'selection'}]}));
  assert.ok('error' in parseBatch({reason: 'x'.repeat(501), ops: [{op: 'delete', block_id: 'selection'}]}));
  assert.equal(batch({reason: REASON, ops: [{op: 'delete', block_id: 'selection'}]}).reason, REASON);
});

test('ops, a patch, or both — but not neither', () => {
  assert.ok('error' in parseBatch({reason: REASON}));
  assert.ok('error' in parseBatch({reason: REASON, ops: [], patch: []}));
  const patchOnly = batch({reason: REASON, patch: [{op: 'set', on: 'project', field: 'name', value: 'Renamed'}]});
  assert.deepEqual([patchOnly.ops.length, patchOnly.patch.length], [0, 1]);
  // 0.3-R fix 1 #6: sent with a revision, a batch names the page its section ops work on.
  assert.equal(batch({reason: REASON, base_revision: '12:ab:cd', page_id: 'p1', ops: [{op: 'delete', block_id: 'x'}]}).baseRevision, '12:ab:cd');
});

test('a patch cannot approve, cannot replay a left-out picture, and keeps to its shape', () => {
  const approve = parseBatch({reason: REASON, patch: [{op: 'set', on: 'project', field: 'approvedFingerprint', value: 'x'}]});
  assert.ok('error' in approve);
  assert.match(approve.error, /person's decision/);
  const picture = parseBatch({reason: REASON, patch: [{op: 'set', on: 'block', page_id: 'p', block_id: 'b', field: 'image', value: {$omitted: 'data-url', bytes: 9000}}]});
  assert.ok('error' in picture);
  assert.match(picture.error, /\$omitted/);
  for (const bad of [
    {op: 'drop_table'},
    {op: 'set', on: 'universe', field: 'x', value: 1},
    {op: 'set', on: 'block', page_id: 'p', field: 'title', value: 'x'},
    {op: 'set', on: 'project', field: 'name'},
    {op: 'set', on: 'project', field: 'name', value: 'x', unset: true},
    {op: 'move_block', page_id: 'p', block_id: 'b', index: -1},
    {op: 'insert_block', page_id: 'p', index: 0, block: 'not an object'},
    {op: 'remove_page', page_id: 'bad"id'},
  ]) assert.ok('error' in parseBatch({reason: REASON, patch: [bad]}), JSON.stringify(bad));
  const tooMany = Array.from({length: MAX_PATCH + 1}, () => ({op: 'set', on: 'project', field: 'name', value: 'x'}));
  assert.ok('error' in parseBatch({reason: REASON, patch: tooMany}));
});

test('the bridge carries reason, base_revision and patch through, and reads changes', () => {
  const parsed = parseAgentCommand('apply', {reason: REASON, base_revision: 'r1', patch: [{op: 'remove_page', page_id: 'p'}]});
  assert.ok('command' in parsed && parsed.command.kind === 'apply');
  assert.deepEqual(parsed.command, {kind: 'apply', patch: [{op: 'remove_page', page_id: 'p'}], reason: REASON, baseRevision: 'r1'});
  const changes = parseAgentCommand('changes', {since: '12', include_view: 'true', limit: '20'});
  assert.deepEqual('command' in changes && changes.command, {kind: 'changes', since: 12, includeView: true, limit: 20});
  assert.deepEqual('command' in parseAgentCommand('changes', {since: '1830:4fa1c2:9b0e11'}) && parseAgentCommand('changes', {since: '1830:4fa1c2:9b0e11'}), {command: {kind: 'changes', since: '1830:4fa1c2:9b0e11'}});
  assert.ok('error' in parseAgentCommand('changes', {limit: 900}));
  assert.ok(isRead('changes'), 'reading the ledger is a read');
});

test('every command kind the app takes has a loopback route', () => {
  const rs = readFileSync(new URL('../src-tauri/src/agent.rs', import.meta.url), 'utf8');
  for (const route of ['GET /agent/changes', 'POST /agent/apply', 'GET /agent/contract', 'GET /agent/state']) assert.ok(rs.includes(`"${route}",`), `${route} is not served`);
  // The tools are generated from the command table, so the route is written down there.
  const table = readFileSync(new URL('../src/agent/commands.mjs', import.meta.url), 'utf8');
  assert.match(table, /path: '\/agent\/changes'/);
});

test('a batch runs without the app, and the project passed in is never touched', () => {
  const p = initialProject(), frozen = JSON.stringify(p);
  const result = runBatch(p, batch({reason: REASON, ops: [{op: 'add', component_kind: 'cta', content: {title: 'Visit'}}]}), '');
  assert.ok(result.ok);
  if (!result.ok) return;
  const added = result.project.pages[0].blocks.at(-1)!;
  assert.deepEqual([added.kind, added.title], ['cta', 'Visit']);
  assert.equal(result.selected, added.id, 'a new block is selected, as it is when a person adds one');
  assert.equal(JSON.stringify(p), frozen);
});

test('a failing op names itself and nothing lands', () => {
  const p = initialProject(), frozen = JSON.stringify(p);
  const result = runBatch(p, batch({reason: REASON, ops: [{op: 'update', block_id: p.pages[0].blocks[1].id, fields: {title: 'Fine'}}, {op: 'delete', block_id: 'missing'}]}), '');
  assert.ok(!result.ok);
  if (result.ok) return;
  assert.deepEqual([result.part, result.index], ['ops', 1]);
  assert.equal(JSON.stringify(p), frozen);
});

test('a patch that would leave the project invalid is refused whole', () => {
  const p = initialProject(), page = p.pages[0].id, block = p.pages[0].blocks[1].id;
  const result = runBatch(p, batch({reason: REASON, patch: [
    {op: 'set', on: 'project', field: 'name', value: 'Fine'},
    {op: 'set', on: 'block', page_id: page, block_id: block, field: 'kind', value: 'script'},
  ]}), '');
  assert.ok(!result.ok);
  if (!result.ok) assert.match(result.error, /invalid/);
  const badImage = runBatch(p, batch({reason: REASON, patch: [{op: 'set', on: 'block', page_id: page, block_id: block, field: 'image', value: 'javascript:alert(1)'}]}), '');
  assert.ok(!badImage.ok);
});

test('round trip: a person\'s edits read from the ledger and sent back as a patch rebuild the same design', () => {
  const base = initialProject();
  const theirs = json(base) as Project, h = newHistory();
  const person = {kind: 'person' as const, name: 'you'};
  const edit = (change: (p: Project) => void) => { const before = begin(theirs, h); change(theirs); end(theirs, before, {author: person, source: 'editor:change'}, h); };
  edit(p => { p.pages[0].blocks[1].title = 'By hand'; });
  edit(p => { p.pages[0].blocks.splice(2, 0, makeBlock('testimonial', true)); });
  edit(p => { p.pages[0].blocks.reverse(); });
  edit(p => { p.system.accent = '#7a3b2e'; p.system.radius = 6; });
  edit(p => { p.pages.push({id: 'about', name: 'About', blocks: [makeBlock('hero', true)]}); p.activePageId = 'about'; });
  edit(p => { const b = p.pages[0].blocks.find(x => x.kind === 'footer')!; delete b.parentId; b.eyebrow = 'Since 2026'; });
  edit(p => { p.pages[0].blocks = p.pages[0].blocks.filter(x => x.kind !== 'features'); });
  // What an agent reads, as it would arrive over the wire.
  const wire = json(changesSince(theirs.ledger, 0, {includeView: true, limit: 200}).changes);
  const patch = wire.flatMap(c => c.ops);
  const replayed = runBatch(base, batch({reason: 'Replaying the person\'s edits.', patch}), '');
  assert.ok(replayed.ok, replayed.ok ? '' : replayed.error);
  if (!replayed.ok) return;
  assert.deepEqual(json(designOf(replayed.project)), json(designOf(theirs)));
});
