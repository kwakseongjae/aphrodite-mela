import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importedProject, upsertProject, type Library} from '../src/workspace/library';
import {initialProject, fingerprint, isApproved} from '../src/model';

/* 0.3-P3-fix1 #2: no file can make an approval. A project file someone sent comes in as a draft, whether or not its id is one this library has. */
test('a project file comes in unapproved, with or without an id this library has, and the board here keeps its own approval', () => {
  const sent = initialProject();
  sent.approvedFingerprint = fingerprint(sent);
  assert.ok(isApproved(sent));
  const empty: Library = {version: 1, entries: []};
  const fresh = importedProject(JSON.stringify(sent), empty);
  assert.equal(fresh.id, sent.id, 'a new id stays');
  assert.equal(isApproved(fresh), false);
  assert.equal(fresh.approvedFingerprint, undefined);
  const mine = upsertProject(empty, sent);
  const copy = importedProject(JSON.stringify(sent), mine);
  assert.notEqual(copy.id, sent.id, 'an id this library has becomes a copy');
  assert.equal(isApproved(copy), false);
  assert.equal(isApproved(mine.entries[0].project), true, 'the board already here keeps its approval');
});
