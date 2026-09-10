import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DurableQueue} from '../src/workspace/durable';
test('native saves are serial and use the acknowledged revision',async()=>{const calls:Array<[string,number]>=[],states:boolean[]=[];const q=new DurableQueue(5,async(data,rev)=>{calls.push([data,rev]);return rev+1;},saved=>states.push(saved));q.enqueue('a');q.enqueue('b');await q.flush();assert.deepEqual(calls,[['a',5],['b',6]]);assert.deepEqual(states,[false,false,true]);});
test('failed native write cannot be followed by a silent overwrite',async()=>{let count=0,error:unknown;const q=new DurableQueue(1,async()=>{count++;throw new Error('conflict');},(_,e)=>{if(e)error=e;});q.enqueue('a');await assert.rejects(q.flush());q.enqueue('b');await assert.rejects(q.flush());assert.equal(count,1);assert.ok(error);});
