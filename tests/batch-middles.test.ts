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
