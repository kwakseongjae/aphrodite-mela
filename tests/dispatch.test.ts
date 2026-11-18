import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PERSON,agentDispatch,carry,dispatchOf,personAt,refusal,sourceFor,type Dispatch} from '../src/agent/dispatch';
import {commands} from '../src/agent/commands.mjs';

/**
 * 0.3-2b: who made a change is an argument, carried from the input that started it to `commit()`.
 * These hold the two rules that make that safe — the person is only ever on the screen, and only a
 * trusted event is the person — and hold main.ts to having no other way to say who is editing.
 */
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const trusted={isTrusted:true} as Event;

test('the person is whoever the browser says pressed, and nothing else',()=>{
  const d=personAt(trusted);
  assert.deepEqual(d,{author:PERSON,surface:'ui'});
  assert.equal(refusal(d),undefined,'their own input is recorded as theirs');
  assert.equal(personAt(new Event('click')),undefined,'an event code made is nobody');
  assert.equal(dispatchOf(new Event('click')),undefined);
});

test('code cannot claim to be the person',()=>{
  const forged:Dispatch={author:{kind:'person',name:'you'},surface:'ui'};
  assert.match(refusal(forged)!,/person's own input/);
  // Passing it along on an event does not make it theirs either.
  assert.match(refusal(dispatchOf(carry(new Event('change'),forged)))!,/person's own input/);
  assert.match(refusal({...personAt(trusted)!})!,/person's own input/,'a copy is not the one their event made');
});

test('the person is only on the screen, and an agent never is',()=>{
  for(const surface of ['loopback','mcp','inApp'] as const)
    assert.match(refusal({author:PERSON,surface})!,/only ever on the screen/,surface);
  assert.match(refusal({author:{kind:'agent',name:'claude-code'},surface:'ui'})!,/only the person/);
  assert.throws(()=>agentDispatch('claude-code','ui' as never),/not on ui/);
  assert.match(refusal(undefined)!,/nobody is named/);
  assert.match(refusal({author:{kind:'unknown',name:'unknown'},surface:'loopback'})!,/names the agent/);
});

test('an agent is named on the transport it came by, with its reason and revision',()=>{
  const d=agentDispatch('claude-code','loopback',{reason:'Why',baseRevision:'1:a:b'});
  assert.deepEqual(d,{author:{kind:'agent',name:'claude-code'},surface:'loopback',reason:'Why',baseRevision:'1:a:b'});
  assert.equal(refusal(d),undefined);
  assert.equal(refusal(agentDispatch('panel','inApp')),undefined);
});

test('an event the app makes for an agent carries that agent, and an event it makes for nobody carries nobody',()=>{
  const d=agentDispatch('claude-code','loopback');
  const click=carry(new Event('click'),d);
  assert.equal(dispatchOf(click),d);
  assert.equal(dispatchOf(carry(new Event('click'),undefined)),undefined);
  // The person's own Dispatch passed on — the palette's Enter, a menu's change — is still theirs.
  const theirs=personAt(trusted)!;
  assert.equal(refusal(dispatchOf(carry(new Event('change'),theirs))),undefined);
});

test('a source comes from the row the edit belongs to',()=>{
  assert.equal(sourceFor('edit.text'),'editor:change','the person’s field edit, not the agent’s route');
  assert.equal(sourceFor('edit.text','agent:edit'),'agent:edit');
  assert.equal(sourceFor('edit.system','agent:system'),'agent:system');
  assert.equal(sourceFor('edit.add','catalog:drop'),'catalog:drop');
  assert.throws(()=>sourceFor('edit.add','editor:change'),/does not write "editor:change"/);
  assert.throws(()=>sourceFor('read.contract'),/not a row that writes/);
  assert.throws(()=>sourceFor('edit.nope'),/not a row that writes/);
});

test('every agent source belongs to a row an agent reaches by name',()=>{
  for(const row of commands)for(const s of row.ledger?.sources??[])
    if(s.startsWith('agent:'))assert.ok(row.route&&(row.surfaces.loopback||row.surfaces.mcp||row.surfaces.inApp),`${row.id} writes ${s} but no agent reaches it by name`);
});

test('main.ts has no other way to say who is editing',()=>{
  assert.doesNotMatch(main,/\bcommandCaller\b/,'the global is gone');
  assert.match(main,/function commit\(change: \(\) => void, d: Dispatch, row: string/,'commit() takes who and which row');
  assert.doesNotMatch(main,/function author\(/,'no default author to fall back on');
  for(const m of main.matchAll(/\bcommit\(\(\)\s*=>/g)){
    // Every call names the Dispatch it records under: commit(() => …, d, 'edit.…'…)
    const call=main.slice(m.index,m.index+4000);
    let depth=0,end=0;
    for(let i=call.indexOf('(');i<call.length;i++){if(call[i]==='(')depth++;else if(call[i]===')'&&--depth===0){end=i;break;}}
    assert.match(call.slice(0,end),/,\s*(d|dispatch|agent|by)\b[^,]*,\s*'(edit|human)\.[a-z-]+'/,`a commit without a Dispatch and a row: ${call.slice(0,120)}`);
  }
});
