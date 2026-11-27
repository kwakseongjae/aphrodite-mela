import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DurableQueue} from '../src/workspace/durable';

test('queued writes return their individual receipts and carry the native revision forward',async()=>{
  const calls:Array<[string,number]>=[];
  const q=new DurableQueue(5,async(text,revision)=>{calls.push([text,revision]);return revision===5?99:105;});
  const a=q.enqueue('a'),b=q.enqueue('b');
  assert.deepEqual(await Promise.all([a,b,q.flush()]),[99,105,105]);
  assert.deepEqual(calls,[['a',5],['b',99]]);
});
test('a failed queue refuses later writes without overwriting the store',async()=>{
  let calls=0;
  const q=new DurableQueue(5,async()=>{calls++;throw new Error('conflict');});
  await assert.rejects(q.enqueue('a'),/conflict/);
  await assert.rejects(q.enqueue('b'),/conflict/);
  await assert.rejects(q.flush(),/conflict/);
  assert.equal(calls,1);
});
