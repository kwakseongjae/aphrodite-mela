import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importedProject, upsertProject, boardToOpen, type Library} from '../src/workspace/library';
import {initialProject, fingerprint, isApproved, MAX_PROJECT, parseProject} from '../src/model';

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

test('a project file holding half a surrogate pair on its own is refused: this Mac could not save it', () => {
  const p = initialProject();
  p.name = 'a \ud800 b';
  assert.throws(() => importedProject(JSON.stringify(p), {version: 1, entries: []}), /name holds half of a surrogate pair/);
});

/* 0.3-P3-fix2 O-5: a project file's history is the other copy's, as a board file's is, and is held to what a project holds once marked. */
test('a project file\'s history comes in as made elsewhere, never by this Mac\'s person or agents, and still fits what a project holds', () => {
  const p = initialProject();
  const change = (i: number) => ({id: 'c' + i, ...(i ? {parent: 'c' + (i - 1)} : {}), seq: i + 1, at: '2026-11-20T00:00:00.000Z', author: {kind: (i % 2 ? 'agent' : 'person') as 'agent' | 'person', name: 'you'}, source: 'editor:change', ops: [{op: 'set', on: 'project', field: 'brief', value: 'b'.repeat(1_000)} as never], anchors: {pages: [], nodes: []}, baseRevision: 'r' + i, revision: 'r' + (i + 1), view: false, size: 0});
  p.ledger = {seq: 400, changes: Array.from({length: 400}, (_, i) => change(i))};
  // A history well within its own budget, and pages that bring the whole to 500 characters under what a project
  // holds: the marks push it past, and the history gives way the way a save makes it.
  p.ledger = parseProject(JSON.stringify(p)).ledger;
  for (let i = 0; i < 9; i++) p.pages.push({id: 'big' + i, name: 'Big ' + i, blocks: [], kind: 'html', html: '<p>' + 'a'.repeat(1_999_000) + '</p>'} as never);
  p.pages.push({id: 'fill', name: 'Fill', blocks: [], kind: 'html', html: ''} as never);
  const fill = p.pages.at(-1)!;
  fill.html = '<p>' + 'f'.repeat(MAX_PROJECT - 20_000 - JSON.stringify(p).length) + '</p>';
  fill.html = '<p>' + 'f'.repeat(fill.html.length - 7 + MAX_PROJECT - 500 - JSON.stringify(p).length) + '</p>';
  const padded = JSON.stringify(p);
  assert.equal(padded.length, MAX_PROJECT - 500, 'just under what a project holds');
  const got = importedProject(padded, {version: 1, entries: []});
  assert.ok(got.ledger!.changes.length > 0);
  assert.ok(got.ledger!.changes.every(c => c.author.elsewhere === true), 'every change made elsewhere');
  assert.ok(JSON.stringify(got).length <= MAX_PROJECT, 'and the whole still fits');
});

/* 0.3-P3-fix4: a received board shown after a wait is opened as the library has it then. */
test('a board opened after a wait is the library\'s by its id: moved, in its workspace; renamed, by its name; taken out, none', () => {
  const p = initialProject();
  let lib = upsertProject({version: 1, entries: []}, p, undefined, 'ws-a');
  assert.deepEqual(boardToOpen(lib, p.id)?.workspaceId, 'ws-a');
  lib = upsertProject(lib, p, undefined, 'ws-b');
  assert.equal(boardToOpen(lib, p.id)?.workspaceId, 'ws-b', 'moved: it opens where it is now');
  lib = upsertProject(lib, {...p, name: 'Renamed meanwhile'});
  assert.equal(boardToOpen(lib, p.id)?.project.name, 'Renamed meanwhile', 'renamed: by its name now');
  assert.equal(boardToOpen({version: 1, entries: []}, p.id), undefined, 'taken out: nothing opens');
});
