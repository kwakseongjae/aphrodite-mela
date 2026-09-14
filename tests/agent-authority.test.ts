import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judge,leaseHeld,normalizeCaller,isRead,isWrite,readKinds,writeKinds,HUMAN,HUMAN_IDLE_MS,LEASE_IDLE_MS,type Authority,type Mode} from '../src/agent/authority';

const NOW=1_700_000_000_000;
const at=(mode:Mode,holder:{label:string;since:number}|null=null):Authority=>({mode,holder,now:NOW});
const allowed=(kind:string,caller:string,a:Authority)=>judge(kind,caller,a).allow;
const refused=(kind:string,caller:string,a:Authority)=>{const v=judge(kind,caller,a);assert.equal(v.allow,false,`${kind} should be refused`);return v as {allow:false;status:number;error:string};};

test('every read is allowed in every mode, held or not',()=>{
  const states:Authority[]=[at('design'),at('connected'),at('connected',{label:'astra',since:NOW}),at('connected',{label:HUMAN,since:NOW}),at('delegated')];
  for(const kind of readKinds)for(const a of states){
    assert.equal(allowed(kind,'claude-code',a),true,`${kind} in ${a.mode} holder=${a.holder?.label??'none'}`);
  }
});

test('a write with nobody at the door is refused with 423 and told how to proceed',()=>{
  for(const kind of writeKinds){
    const v=refused(kind,'claude-code',at('design'));
    assert.equal(v.status,423,kind);
    assert.match(v.error,/Connected mode|Agent mode/);
    assert.match(v.error,/Reading works/,'the refusal says what still works');
  }
});

test('Agent mode lets any caller write, exactly as before',()=>{
  for(const kind of writeKinds)assert.equal(allowed(kind,'astra',at('delegated')),true,kind);
  assert.equal(allowed('apply','unknown-agent',at('delegated')),true);
});

test('connected mode hands the free lease to the first writer and keeps it for them',()=>{
  const free=judge('apply','claude-code',at('connected'));
  assert.deepEqual(free,{allow:true,hold:{label:'claude-code',since:NOW}});
  const mine=judge('apply','claude-code',at('connected',{label:'claude-code',since:NOW-1000}));
  assert.deepEqual(mine,{allow:true,hold:{label:'claude-code',since:NOW}},'the hold is renewed, not re-taken');
});

test('a second agent is refused by name rather than by a bare conflict',()=>{
  const v=refused('apply','claude-code',at('connected',{label:'astra',since:NOW}));
  assert.equal(v.status,409);
  assert.match(v.error,/astra/,'it names who is holding the screen');
  assert.match(v.error,/hand it over/);
});

test('the person always wins, and gets out of the way quickly',()=>{
  const typing=refused('apply','claude-code',at('connected',{label:HUMAN,since:NOW-1000}));
  assert.equal(typing.status,409);
  assert.match(typing.error,/the person is using the screen/);
  assert.equal(allowed('apply','claude-code',at('connected',{label:HUMAN,since:NOW-HUMAN_IDLE_MS-1})),true,'a few quiet seconds and the agent may write again');
});

test('a hold expires so a dead agent cannot keep the screen',()=>{
  assert.equal(leaseHeld(at('connected',{label:'astra',since:NOW-LEASE_IDLE_MS+1}))?.label,'astra');
  assert.equal(leaseHeld(at('connected',{label:'astra',since:NOW-LEASE_IDLE_MS-1})),null);
  assert.equal(leaseHeld(at('connected',{label:HUMAN,since:NOW-HUMAN_IDLE_MS-1})),null,'the person expires sooner');
  assert.equal(leaseHeld(at('connected')),null);
  assert.equal(leaseHeld(at('connected',{label:'astra',since:NOW+60_000}))?.label,'astra','a clock that jumped does not drop the hold');
  assert.equal(allowed('apply','claude-code',at('connected',{label:'astra',since:NOW-LEASE_IDLE_MS-1})),true);
});

test('end releases the hold and is refused only when there is nothing to end',()=>{
  assert.deepEqual(judge('end','claude-code',at('connected',{label:'astra',since:NOW})),{allow:true,hold:null});
  assert.deepEqual(judge('end','astra',at('delegated')),{allow:true,hold:null});
  assert.equal(refused('end','claude-code',at('design')).status,409);
});

test('an unknown kind is refused rather than falling through to a write',()=>{
  for(const kind of ['approve','approve-direction','eval','','__proto__']){
    const v=refused(kind,'claude-code',at('delegated'));
    assert.equal(v.status,403,kind);
  }
  assert.equal(isWrite('approve'),false,'approval is not a command at all');
  assert.equal(isRead('approve'),false);
});

test('a caller label is cleaned up and can never claim to be the person',()=>{
  assert.equal(normalizeCaller('claude-code'),'claude-code');
  assert.equal(normalizeCaller('Astra'),'astra');
  assert.equal(normalizeCaller('human'),'unknown-agent');
  assert.equal(normalizeCaller('HUMAN'),'unknown-agent');
  assert.equal(normalizeCaller('  human  '),'unknown-agent');
  assert.equal(normalizeCaller(undefined),'unknown-agent');
  assert.equal(normalizeCaller('<script>alert(1)</script>'),'scriptalert1script');
  assert.equal(normalizeCaller('-'),'unknown-agent');
  assert.equal(normalizeCaller('x'.repeat(80)).length,32);
});

test('an agent cannot hold the screen under the name human',()=>{
  const v=judge('apply','human',at('connected'));
  assert.deepEqual(v,{allow:true,hold:{label:'unknown-agent',since:NOW}});
});
