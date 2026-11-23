/**
 * 0.3-R ⑥: the four middles of the brief's §3 (Codex P3 Part B).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBatch} from '../src/agent/ops.ts';

const REASON = 'Checking a batch with one half wrong.';

test('a batch whose ops are good and whose patch is not a list is refused whole, and the other way round', () => {
  for (const payload of [
    {reason: REASON, ops: [{op: 'add', component_kind: 'hero'}], patch: {op: 'move_page'}},
    {reason: REASON, ops: [{op: 'add', component_kind: 'hero'}], patch: 'nope'},
    {reason: REASON, ops: {op: 'add', component_kind: 'hero'}, patch: [{op: 'set', on: 'project', field: 'brief', value: 'x'}]},
    {reason: REASON, ops: null, patch: [{op: 'set', on: 'project', field: 'brief', value: 'x'}]},
  ]) {
    const got = parseBatch(payload);
    assert.ok('error' in got, `${JSON.stringify(payload)} was taken as ${JSON.stringify(got)}`);
    assert.match((got as {error: string}).error, /must be a list/);
  }
  assert.ok('batch' in parseBatch({reason: REASON, ops: [{op: 'add', component_kind: 'hero'}], patch: []}), 'an empty list on one side is still fine');
  assert.ok('batch' in parseBatch({reason: REASON, ops: [], patch: [{op: 'set', on: 'project', field: 'brief', value: 'x'}]}));
});

import * as apply from '../src/agent/apply.ts';
import {initialProject, MAX_PAGES, type Project} from '../src/model.ts';

const pf = () => { const f = (apply as unknown as Record<string, unknown>).preflightBatch; assert.equal(typeof f, 'function', 'apply.ts exports preflightBatch'); return f as (p: Project, b: {ops: unknown[]; patch: unknown[]; pageId?: string}, selected: string) => {ok: false; index: number; part: string; error: string} | undefined; };

test('a media batch that will be refused is refused before a file is copied: a full board, a page that is not there, a bad op after it', async () => {
  const full = initialProject();
  for (let i = full.pages.length; i < MAX_PAGES; i++) full.pages.push({id: `p${i}`, name: `P${i}`, blocks: []});
  let copies = 0;
  const host = {importFile: async () => { copies++; return {sha: 'a'.repeat(64), mime: 'image/png', bytes: 4}; }, mediaUrl: async () => 'blob:x'};
  for (const [name, p, batch] of [
    ['thirty pages', full, {ops: [{op: 'media_add', library_id: 'abc'}], patch: []}],
    ['a page that is not there', initialProject(), {ops: [{op: 'media_add', library_id: 'abc'}], patch: [], pageId: 'gone'}],
    ['a bad op after it', initialProject(), {ops: [{op: 'media_add', library_id: 'abc'}, {op: 'delete', block_id: 'nope'}], patch: []}],
  ] as const) {
    const refused = pf()(p, batch as never, '');
    assert.ok(refused, `${name}: refused before copying`);
    if (!refused) await apply.importMedia(batch.ops as never, 'loopback', host as never, p.id, async () => ({width: 1, height: 1}));
  }
  assert.equal(copies, 0, 'no file was copied');
  assert.equal(pf()(initialProject(), {ops: [{op: 'media_add', library_id: 'abc'}], patch: []}, ''), undefined, 'a batch that would land is let through to copy');
});

test('applyBatch asks the preflight, and the door, before it copies a file', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const start = main.indexOf('async function applyBatch(');
  const body = main.slice(start, main.indexOf('\n}\n', start));
  const copy = body.indexOf('await importMedia(');
  assert.ok(body.indexOf('preflightBatch(project,held,selected)') > 0 && body.indexOf('preflightBatch(project,held,selected)') < copy, 'the preflight comes first');
  assert.ok(body.indexOf('stillAllowed()') < copy, 'and so does the door');
});
