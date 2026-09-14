import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {opControl,opKinds} from '../src/agent/ops';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');

/**
 * Rule 2 of the tool surface: what an agent can do, a person can do. Each edit operation must have a
 * control in the UI — a button the click dispatcher handles, or a field the inspector binds. If this
 * fails, a capability has grown in the tool layer without growing on the screen, and an agent that
 * works by reading the screen has silently lost ground.
 */
test('every edit operation has a real control in the interface',()=>{
  for(const kind of opKinds){
    const control=opControl[kind];
    const found=control.kind==='action'
      ? main.includes(`case '${control.name}':`)
      : main.includes(`${control.name}="`);
    assert.ok(found,`op "${kind}" claims the ${control.kind} "${control.name}", which does not exist in main.ts`);
  }
});

test('the mapping does not drift out of the op list',()=>{
  assert.deepEqual(Object.keys(opControl).sort(),[...opKinds].sort());
});
