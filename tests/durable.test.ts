import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DurableQueue} from '../src/workspace/durable';
test('native saves are serial and use the acknowledged revision',async()=>{const calls:Array<[string,number]>=[],states:boolean[]=[];const q=new DurableQueue(5,async(data,rev)=>{calls.push([data,rev]);return rev+1;},saved=>states.push(saved));q.enqueue('a');q.enqueue('b');await q.flush();assert.deepEqual(calls,[['a',5],['b',6]]);assert.deepEqual(states,[false,false,true]);});
test('failed native write cannot be followed by a silent overwrite',async()=>{let count=0,error:unknown;const q=new DurableQueue(1,async()=>{count++;throw new Error('conflict');},(_,e)=>{if(e)error=e;});q.enqueue('a');await assert.rejects(q.flush());q.enqueue('b');await assert.rejects(q.flush());assert.equal(count,1);assert.ok(error);});

/* The queue must take the revision the writer hands back, not guess its own. `workspace_write`
   returns `expected+1` today, but the number is Rust's to decide — after a recovery or a rotation it
   may jump. A queue that incremented locally would drift one behind and every later save would be
   refused as stale, which reads to the person as "another window changed this workspace" when no
   other window exists. */
test('the next write uses the revision the writer acknowledged, not a local guess',async()=>{
  const seen:number[]=[];
  const q=new DurableQueue(4,async(_data,rev)=>{seen.push(rev);return rev===4?99:rev+1;},()=>{});
  q.enqueue('a');await q.flush();
  q.enqueue('b');await q.flush();
  assert.deepEqual(seen,[4,99],'the second write carries the revision Rust returned');
});

/* Only the newest enqueue may report "saved". Two quick edits in a row both resolve, and if the
   older one flipped the indicator green the person would see "Saved" while the newer edit was still
   in flight. */
test('an overtaken write does not report saved on behalf of the newer one',async()=>{
  const states:boolean[]=[];
  const q=new DurableQueue(0,async(_d,rev)=>rev+1,saved=>states.push(saved));
  q.enqueue('a');q.enqueue('b');
  await q.flush();
  assert.deepEqual(states,[false,false,true],'one green at the end, not one per write');
});
