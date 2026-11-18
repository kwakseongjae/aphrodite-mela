/**
 * 0.3-P1-fix2: keeping a project within its cap costs the screen nothing extra while it is far from it.
 * A person's edit does not serialize the design again when the size the last save already measured leaves
 * twice the history's reserve; an agent's batch does not serialize the library again when the size of
 * the last saved library leaves room for anything the batch could add.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, MAX_PROJECT} from '../src/model.ts';
import {fitSaved, emptyLedger, LEDGER_RESERVE} from '../src/ledger/ledger.ts';
import {begin, end, newHistory} from '../src/ledger/session.ts';
import {upsertProjectMeasured} from '../src/workspace/library.ts';

/** How many times JSON.stringify runs while `fn` does. */
function serializations(fn: () => void): number {
  const original = JSON.stringify;
  let calls = 0;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => { calls++; return original(...args); }) as typeof JSON.stringify;
  try { fn(); } finally { JSON.stringify = original; }
  return calls;
}

test('far from the cap, the size the last save measured lets fitSaved return without serializing', () => {
  const p = initialProject();
  p.ledger = emptyLedger();
  assert.equal(serializations(() => fitSaved(p, 10_000)), 0);
  assert.ok(serializations(() => fitSaved(p, MAX_PROJECT - 2 * LEDGER_RESERVE)) > 0, 'near it, it measures');
  assert.ok(serializations(() => fitSaved(p)) > 0, 'with nothing measured yet, it measures');
});

test('a save measures the project it writes, and the session passes that on to the next recording', () => {
  const p = initialProject(), history = newHistory(p);
  const {library, projectChars} = upsertProjectMeasured({version: 1, entries: []}, p);
  assert.equal(projectChars, JSON.stringify(library.entries[0].project).length);
  history.saved = projectChars;
  const before = begin(p, history);
  p.name = 'Renamed';
  const designs = serializations(() => end(p, before, {author: {kind: 'person', name: 'you'}, source: 'editor:change'}, history));
  history.saved = undefined;
  const before2 = begin(p, history);
  p.name = 'Renamed again';
  const measured = serializations(() => end(p, before2, {author: {kind: 'person', name: 'you'}, source: 'editor:change'}, history));
  assert.ok(designs < measured, `${designs} serializations with the size known, ${measured} without`);
});
