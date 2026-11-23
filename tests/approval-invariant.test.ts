/**
 * 0.3-R ①: an approval is the person's, and a fingerprint that is kept always matches the board it is on.
 *
 * Before 0.3-R a board changed after its approval kept the old fingerprint, so whatever brought the content back
 * (an agent's patch, an agent's undo, a rename on Home) brought the approval back with it. Now a fingerprint the
 * content no longer matches goes the moment it is stale, wherever a board is changed, read or saved; only the person's
 * approve and the person's own undo or redo give a board an approval it did not have.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.ts';
import {initialProject, parseProject, fingerprint, isApproved, type Project} from '../src/model.ts';
import {sampleProject} from '../src/workspace/onboarding.ts';
import * as omd from '../src/design/omd.ts';
import {ensureSpace} from '../src/editor/space.ts';

const m = model as unknown as Record<string, unknown>;
const fn = <T>(name: string): T => { assert.equal(typeof m[name], 'function', `model.ts exports ${name}`); return m[name] as T; };
const print = (p: Project) => fn<(p: Project) => string>('approvalPrint')(p);
const approve = (p: Project) => { p.approvedFingerprint = print(p); return p; };
const reparse = (p: Project) => parseProject(JSON.stringify(p));
/** Every object's keys the other way round: what a store that sorts keys (Rust's serde_json) gives back. */
const reversed = (v: unknown): unknown => Array.isArray(v) ? v.map(reversed) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reversed(x)])) : v;

test('an approval made the old way (the fingerprint as main wrote it) still holds, and reads back in the new form', () => {
  const p = initialProject();
  p.approvedFingerprint = fingerprint(p);
  assert.equal(isApproved(p), true, 'an approval already on disk is not taken away');
  const read = reparse(p);
  assert.equal(isApproved(read), true);
  assert.equal(read.approvedFingerprint, print(read), 'read once, it is kept in the form key order cannot break');
});

test('the order an object\'s keys were made in does not take an approval away', () => {
  const p = approve(initialProject());
  const turned = reversed(p) as Project;
  assert.notEqual(fingerprint(turned), fingerprint(p), 'the old fingerprint does depend on key order');
  assert.equal(isApproved(turned), true);
  assert.equal(isApproved(reparse(turned)), true);
});

test('a fingerprint the content no longer matches is dropped where a board is read', () => {
  const p = approve(initialProject());
  p.brief = 'Something else';
  assert.equal(isApproved(p), false);
  const read = reparse(p);
  assert.equal(read.approvedFingerprint, undefined, 'a stale fingerprint is not carried into the board read');
  read.brief = initialProject().brief;
  assert.equal(isApproved(read), false, 'and the content coming back cannot bring it back');
});

test('dropStaleApproval drops a stale fingerprint and keeps one that holds, saying which', () => {
  const drop = fn<(p: Project) => boolean>('dropStaleApproval');
  const p = approve(initialProject());
  assert.equal(drop(p), false);
  assert.equal(isApproved(p), true);
  p.name = 'Renamed';
  assert.equal(drop(p), true);
  assert.equal(p.approvedFingerprint, undefined);
  p.name = initialProject().name;
  assert.equal(isApproved(p), false);
});

/** Boards the app makes, each approved: a read gives back the same design, and the approval with it (0.2.5 M3). */
const boards: [string, () => Project][] = [
  ['a new board', () => initialProject()],
  ['the English sample', () => sampleProject('en')],
  ['the Korean sample', () => sampleProject('ko')],
  // Through the import's own entry: colour names a board cannot keep, and type roles out of order.
  ['a design-system graph import', () => {
    const graphSystem = (omd as unknown as Record<string, unknown>).graphSystem as ((base: Project['system'], read: ReturnType<typeof omd.importDesignGraph>, name: string, description: string) => Project['system']) | undefined;
    assert.equal(typeof graphSystem, 'function', 'omd.ts exports graphSystem');
    const read = omd.importDesignGraph({foundations: {tokens: {'Brand Blue': {$type: 'color', $value: '#1d4ed8'}, link_hover: {$type: 'color', $value: '#1e40af'}, primary: {$type: 'color', $value: '#0f172a'}}}, typography_assets: {roles: [{id: 'body', size: 16}, {id: 'display', size: 48}, {id: 'heading', size: 32}]}});
    const p = initialProject();
    p.system = graphSystem!(p.system, read, 'Graph', 'Imported');
    return p;
  }],
  ['a mobile frame', () => { const p = initialProject(); ensureSpace(p); p.space!.frames[p.pages[0].id].preset = 'mobile'; return p; }],
  ['a free page', () => { const p = initialProject(); p.pages.push({id: 'free-1', name: 'Free', blocks: [], kind: 'html', html: '<p>Hi</p>'}); return p; }],
  ['Korean content', () => { const p = initialProject(); p.contentLanguage = 'ko'; return p; }],
];
for (const [name, board] of boards) test(`${name}: approved, read and read again, it is the same design and still approved`, () => {
  const p = approve(board());
  const once = reparse(p), twice = reparse(once);
  assert.equal(fingerprint(once), fingerprint(p), 'a read does not change the design');
  assert.equal(isApproved(once), true);
  assert.equal(isApproved(twice), true);
});

test('canonicalSystem gives a system the shape a read keeps', () => {
  const canonical = fn<(s: Project['system']) => Project['system']>('canonicalSystem');
  const p = initialProject();
  p.system = canonical({...p.system, carried: {'Brand Blue': '#123456', 'link.hover': '#654321'}});
  assert.deepEqual(reparse(p).system, p.system);
  assert.deepEqual(p.system.carried, {'link.hover': '#654321'});
});

import {readLibrary, readTidied, upsertProject, importedProject, LIBRARY_KEY, type Library} from '../src/workspace/library.ts';
const store = (library: unknown) => ({getItem: (k: string) => k === LIBRARY_KEY ? JSON.stringify(library) : null, setItem: () => {}});
const entry = (project: Project) => ({project, createdAt: '2026-11-23T00:00:00.000Z', updatedAt: '2026-11-23T00:00:00.000Z', pinned: false, archived: false});

test('a save never writes a stale fingerprint, whatever the board in memory holds', () => {
  const p = approve(initialProject());
  p.brief = 'Changed behind the ledger';
  const saved = upsertProject({version: 1, entries: []}, p);
  assert.equal(saved.entries[0].project.approvedFingerprint, undefined);
});

test('reading a library tidies its approvals, and says so, so the app writes it back once', () => {
  const stale = approve(initialProject()); stale.brief = 'Changed';
  const old = initialProject(); old.approvedFingerprint = fingerprint(old);
  const read = readLibrary(store({version: 1, entries: [entry(stale), entry(old)]}));
  assert.equal(read.entries[0].project.approvedFingerprint, undefined, 'the stale one is gone');
  assert.equal(read.entries[1].project.approvedFingerprint, print(read.entries[1].project), 'the old one holds, in its new form');
  assert.equal(readTidied(read), true);
  const again = readLibrary(store(read));
  assert.equal(readTidied(again), false, 'a library already tidy is not written again');
  assert.equal(isApproved(again.entries[1].project), true);
});

test('a project file opened from disk is never approved, matching or not', () => {
  const p = approve(initialProject());
  assert.equal(importedProject(JSON.stringify(p), {version: 1, entries: []} as Library).approvedFingerprint, undefined);
});
