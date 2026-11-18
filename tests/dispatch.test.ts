import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NOBODY,PERSON,agentDispatch,dispatchOf,personAt,refusal,send,sendAs,sourceFor,watchTyping,type Dispatch} from '../src/agent/dispatch';
import {commands} from '../src/agent/commands.mjs';

/**
 * 0.3-2b: who made a change is an argument, carried from the input that started it to `commit()`.
 * These hold the two rules that make that safe — the person is only ever on the screen, and only a
 * trusted event is the person — and hold main.ts to having no other way to say who is editing.
 */
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const trusted={isTrusted:true} as Event;
/** An event as the browser fires it: node lets a test say what only the browser can. */
const fromBrowser=(type:string,init:Record<string,unknown>={})=>{const e=new Event(type);for(const [k,v] of Object.entries({isTrusted:true,...init}))Object.defineProperty(e,k,{value:v});return e;};
/** Sends `e` to a fresh target and returns who its listener was told sent it. */
function sentAs(e:Event,d:Dispatch|undefined){const t=new EventTarget();let seen:Dispatch|undefined;t.addEventListener(e.type,ev=>{seen=dispatchOf(ev);});send(t,e,d);return seen;}

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
  assert.match(refusal(sentAs(new Event('change'),forged))!,/person's own input/);
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
  assert.equal(sentAs(new Event('click'),d),d);
  assert.equal(sentAs(new Event('click'),undefined),undefined);
  // The person's own Dispatch passed on — the palette's Enter, a menu's change — is still theirs.
  const theirs=personAt(trusted)!;
  assert.equal(refusal(sentAs(new Event('change'),theirs)),undefined);
});

test('an event carries its Dispatch for the one sending only',()=>{
  const t=new EventTarget(),theirs=personAt(trusted)!;let kept:Event|undefined,seen:Dispatch|undefined;
  t.addEventListener('change',e=>{kept=e;seen=dispatchOf(e);});
  send(t,new Event('change'),theirs);
  assert.equal(seen,theirs);
  // Captured as it passed and sent again: nobody is named, so nothing is recorded under the person.
  t.dispatchEvent(kept!);
  assert.equal(seen,undefined);
});

test('what the browser fires while an agent’s event is being sent is the agent’s, trusted or not',()=>{
  const d=agentDispatch('claude-code','loopback');
  // The submit a submit button's click makes the browser fire: trusted, and nobody carried it.
  const t=new EventTarget();let submitted:Dispatch|undefined;
  t.addEventListener('submit',e=>{submitted=dispatchOf(e);});
  t.addEventListener('click',()=>{t.dispatchEvent(fromBrowser('submit'));});
  send(t,new Event('click'),d);
  assert.equal(submitted,d);
  assert.equal(sendAs(d,()=>personAt(trusted)),undefined,'nobody is the person while code is sending');
  assert.equal(sendAs(undefined,()=>dispatchOf(fromBrowser('change'))),undefined,'sent for nobody, it is nobody\'s');
  assert.equal(refusal(dispatchOf(fromBrowser('click'))),undefined,'and once it has been sent, the person is the person again');
});

test('sendAs covers only what happens before it returns',()=>{
  const a=agentDispatch('a','loopback'),b=agentDispatch('b','mcp');
  assert.equal(sendAs(a,()=>sendAs(b,()=>dispatchOf(fromBrowser('click')))),b,'the inner sender, inside');
  assert.equal(sendAs(a,()=>{sendAs(b,()=>0);return dispatchOf(fromBrowser('click'));}),a,'the outer one again after');
  assert.throws(()=>sendAs(a,()=>{throw new Error('boom');}),/boom/);
  assert.notEqual(dispatchOf(fromBrowser('click')),a,'a throw does not leave it set');
  assert.throws(()=>sendAs(a,()=>Promise.resolve()),/cannot wait/);
  assert.notEqual(dispatchOf(fromBrowser('click')),a,'nor does a promise');
  assert.equal(NOBODY.author.kind,'unknown');
});

test('the change that saves what the person typed is theirs, even while an agent is sending',()=>{
  const field=new EventTarget(),other=new EventTarget(),d=agentDispatch('claude-code','loopback');
  // Each field is watched on itself here; in the app, the window watches every field's events as they pass.
  for(const t of [field,other])watchTyping(t);
  const at=(target:EventTarget,e:Event)=>{let seen:Dispatch|undefined;const take=(ev:Event)=>{seen=dispatchOf(ev);};target.addEventListener(e.type,take);target.dispatchEvent(e);target.removeEventListener(e.type,take);return seen;};
  const typing=()=>fromBrowser('input',{inputType:'insertText'});
  // The person types; an agent's click moves the selection, and the field saves as it loses focus.
  at(field,typing());
  assert.equal(refusal(sendAs(d,()=>at(field,fromBrowser('change')))),undefined,'the person’s words');
  assert.equal(sendAs(d,()=>at(field,fromBrowser('change'))),d,'once saved, a second change is not theirs');
  // A field the person never typed into, or a checkbox the agent clicked, is the agent's.
  assert.equal(sendAs(d,()=>at(other,fromBrowser('change'))),d);
  // The agent typing over the person's words takes the field: its change is the agent's.
  at(field,typing());
  sendAs(d,()=>at(field,new Event('input')));
  assert.equal(sendAs(d,()=>at(field,fromBrowser('change'))),d);
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
