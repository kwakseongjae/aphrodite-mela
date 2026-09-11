import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planSync} from '../src/workspace/grid-sync';

const keysOf=(ops:ReturnType<typeof planSync>,type:string)=>ops.filter(o=>o.type===type).map(o=>o.key);
const order=(ops:ReturnType<typeof planSync>)=>ops.filter(o=>o.type!=='remove').map(o=>o.key);

test('an unchanged list moves nothing',()=>{
  const ops=planSync(['a','b','c'],['a','b','c']);
  assert.deepEqual(keysOf(ops,'keep'),['a','b','c']);
  assert.equal(ops.filter(o=>o.type!=='keep').length,0);
});

test('filtering removes the gone cards and keeps the survivors in place',()=>{
  const ops=planSync(['a','b','c','d'],['b','d']);
  assert.deepEqual(keysOf(ops,'remove').sort(),['a','c']);
  assert.deepEqual(keysOf(ops,'keep'),['b','d'],'survivors in the same relative order never move');
  assert.equal(keysOf(ops,'move').length,0);
});

test('sorting moves the minimum number of cards',()=>{
  // One card jumps to the front: only that card should move.
  const ops=planSync(['a','b','c','d'],['d','a','b','c']);
  assert.deepEqual(keysOf(ops,'move'),['d']);
  assert.deepEqual(keysOf(ops,'keep'),['a','b','c']);
  assert.deepEqual(order(ops),['d','a','b','c']);
});

test('a full reversal moves all but one',()=>{
  const ops=planSync(['a','b','c'],['c','b','a']);
  assert.equal(keysOf(ops,'keep').length,1);
  assert.equal(keysOf(ops,'move').length,2);
  assert.deepEqual(order(ops),['c','b','a']);
});

test('new cards are inserted and the final order is exactly the new list',()=>{
  const ops=planSync(['b'],['a','b','c']);
  assert.deepEqual(keysOf(ops,'insert'),['a','c']);
  assert.deepEqual(keysOf(ops,'keep'),['b']);
  assert.deepEqual(order(ops),['a','b','c']);
});

test('empty lists and duplicate keys are handled',()=>{
  assert.deepEqual(planSync([],[]),[]);
  assert.deepEqual(keysOf(planSync(['a','b'],[]),'remove'),['a','b']);
  assert.deepEqual(order(planSync([],['a'])),['a']);
  assert.deepEqual(order(planSync(['a','a'],['a','b','b'])),['a','b'],'duplicates collapse');
});
