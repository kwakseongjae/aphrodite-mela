import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {opControl,opKinds,type OpKind} from '../src/agent/ops';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const table=readFileSync(new URL('../src/agent/commands.mjs',import.meta.url),'utf8');

/**
 * Rule 2 of the tool surface: what an agent can do, a person can do. Each edit operation must have a
 * control in the UI — a button the click dispatcher handles, or a field the inspector binds. If this
 * fails, a capability has grown in the tool layer without growing on the screen, and an agent that
 * works by reading the screen has silently lost ground.
 */
/** Writing a page's html has no hand control until 0.4 (src/agent/ops.ts HAND_EDITING). Exactly these, by name. */
const NOT_YET:OpKind[]=['html_page','html_replace','html_set'];

test('every edit operation has a real control in the interface',()=>{
  for(const kind of opKinds){
    const control=opControl[kind];
    if(control.kind==='not-yet'){assert.ok(NOT_YET.includes(kind),`op "${kind}" has no control and is not one of the named exceptions`);continue;}
    // A gesture is a control a row of the command table names, which tests/command-controls.test.ts finds in main.ts.
    const found=control.kind==='action'
      ? main.includes(`case '${control.name}':`)
      : control.kind==='gesture'?table.includes(`gesture('${control.name}')`)
      : main.includes(`${control.name}="`);
    assert.ok(found,`op "${kind}" claims the ${control.kind} "${control.name}", which does not exist in main.ts`);
  }
});

test('writing a page\'s html is the one thing an agent does that a person cannot do yet, and it says until when',()=>{
  assert.deepEqual(opKinds.filter(k=>opControl[k].kind==='not-yet').sort(),NOT_YET);
  for(const kind of NOT_YET){const c=opControl[kind];assert.ok(c.kind==='not-yet'&&c.until==='0.4'&&c.why.length>20,kind);}
});

test('the mapping does not drift out of the op list',()=>{
  assert.deepEqual(Object.keys(opControl).sort(),[...opKinds].sort());
});
