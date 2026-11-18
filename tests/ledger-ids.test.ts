/**
 * 0.3-P1: every change has its own id and names the change it was made on top of (`parent`). The
 * sequence number stays; the ids are what 0.5's folders and branches build on (plan §18.4). A ledger
 * saved before ids is filled in when it is read, the same way every time.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, type Project} from '../src/model.ts';
import {begin, end, step, newHistory} from '../src/ledger/session.ts';
import {readLedger, emptyLedger} from '../src/ledger/ledger.ts';

const PERSON = {kind: 'person' as const, name: 'you'};
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function edited(n: number): Project {
  const p = initialProject(), history = newHistory(p);
  p.ledger = emptyLedger();
  for (let i = 0; i < n; i++) { const before = begin(p, history); p.name = `Name ${i}`; end(p, before, {author: PERSON, source: 'editor:change'}, history); }
  const undone = step(p, 'undo', history, PERSON)!;
  return undone.project;
}

test('each change has its own id and names the one before it as its parent', () => {
  const changes = edited(4).ledger!.changes;
  assert.equal(changes.length, 5, 'four edits and an undo');
  assert.equal(new Set(changes.map(c => c.id)).size, 5);
  for (const c of changes) assert.match(c.id, /^[0-9a-f-]{36}$/);
  assert.equal(changes[0].parent, undefined, 'the first change stands on nothing recorded');
  for (let i = 1; i < changes.length; i++) assert.equal(changes[i].parent, changes[i - 1].id, `change ${changes[i].seq}`);
  assert.deepEqual(changes.map(c => c.seq), [1, 2, 3, 4, 5], 'the sequence numbers stay');
});

test('a ledger saved before ids opens with ids and parents filled in, the same ones on every read', () => {
  const saved = json(edited(3).ledger!) as unknown as {seq: number; changes: Record<string, unknown>[]};
  for (const c of saved.changes) { delete c.id; delete c.parent; }
  const once = readLedger(json(saved)), twice = readLedger(json(saved));
  assert.ok(once, 'an old ledger is read, not dropped');
  assert.deepEqual(once, twice);
  assert.equal(new Set(once!.changes.map(c => c.id)).size, once!.changes.length);
  for (let i = 1; i < once!.changes.length; i++) assert.equal(once!.changes[i].parent, once!.changes[i - 1].id);
});

test('ids a ledger already has are kept, and a parent it names is kept', () => {
  const ledger = edited(2).ledger!;
  const read = readLedger(json(ledger))!;
  assert.deepEqual(read.changes.map(c => [c.id, c.parent]), ledger.changes.map(c => [c.id, c.parent]));
  const odd = json(ledger);
  odd.changes[1].parent = 'elsewhere';
  assert.equal(readLedger(odd)!.changes[1].parent, 'elsewhere', 'a change made on another copy keeps naming where it was made');
  const bad = json(ledger) as unknown as {changes: {parent: unknown}[]};
  bad.changes[1].parent = 42;
  assert.equal(readLedger(bad), undefined, 'a parent that is not an id is not a ledger that holds together');
});
