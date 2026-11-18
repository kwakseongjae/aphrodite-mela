import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judge,gateFor,leaseHeld,normalizeCaller,isRead,isWrite,isAsk,askKinds,readKinds,writeKinds,HUMAN,HUMAN_IDLE_MS,LEASE_IDLE_MS,type Authority,type Mode,connectionState,doorActions,DOOR_KIND,ANYONE,mayWrite,readAllowed,allowAgent,forgetAgent} from '../src/agent/authority';

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

test('listing the picture library is a read; importing and deleting are not',()=>{
  assert.equal(gateFor({kind:'library',action:'list'}),'images');
  assert.equal(gateFor({kind:'library',action:'import'}),'library');
  assert.equal(gateFor({kind:'library',action:'delete'}),'library');
  assert.equal(gateFor({kind:'edit'}),'edit');
  assert.equal(allowed(gateFor({kind:'library',action:'list'}),'claude-code',at('design')),true,'an agent may see what pictures exist without the door open');
  assert.equal(refused(gateFor({kind:'library',action:'delete'}),'claude-code',at('design')).status,423);
});

test('asking is always allowed, and never takes the screen',()=>{
  for(const kind of askKinds)for(const mode of ['design','connected','delegated'] as Mode[]){
    const holder={label:'astra',since:NOW};
    const v=judge(kind,'claude-code',at(mode,holder));
    assert.equal(v.allow,true,`${kind} in ${mode}`);
    assert.deepEqual((v as {hold:unknown}).hold,holder,'asking leaves the hold where it was');
  }
  assert.equal(isAsk('connect'),true);
  assert.equal(isAsk('apply'),false);
  assert.equal(isWrite('connect'),false,'asking to connect is not itself a change');
});

/* Dogfooding the release build caught this: the app was connected, the banner said so, writes
   returned 200 — and `/agent/state` answered `mode: design`, because that field is the editor's
   own tab and the two concepts share a word. An agent that reads state first would have asked a
   person to open a door that was already open. */
test('the state tells an agent about the door, in a word the editor tab cannot shadow',()=>{
  assert.deepEqual(connectionState('design'),{connection:'design',writes:'off'});
  assert.deepEqual(connectionState('connected'),{connection:'connected',writes:'on'});
  assert.deepEqual(connectionState('delegated'),{connection:'delegated',writes:'on'});
  // The editor tab is also called `design`; merging must not let it answer the permission question.
  const dataset={mode:'design',page:'Home'} as Record<string,string>;
  const state:Record<string,string>={...dataset,...connectionState('connected')};
  assert.equal(state.mode,'design','the editor tab survives');
  assert.equal(state.connection,'connected');
  assert.equal(state.writes,'on');
});

/* 0.3-1b: the door is opened per agent and remembered by name. The person writes the list; no agent
   command can, in any mode — an allowed agent could otherwise let a second one in. */
test('connected mode lets in the names the person allowed, and no one else',()=>{
  const open:Authority={mode:'connected',holder:null,now:NOW,allowed:['claude-code']};
  assert.equal(allowed('apply','claude-code',open),true);
  const other=refused('apply','astra',open);
  assert.equal(other.status,423);
  assert.match(other.error,/writing is off for astra/);
  assert.match(other.error,/aphrodite_request_connection/,'it is told the way in');
  assert.equal(allowed('apply','astra',{...open,allowed:['claude-code',ANYONE]}),true,'the switch lets anyone in');
  assert.equal(allowed('state','astra',open),true,'reading never needed the list');
  assert.equal(allowed('apply','astra',{mode:'delegated',holder:null,now:NOW,allowed:[]}),true,'Agent mode is a separate door');
  assert.equal(mayWrite('Claude-Code',['claude-code']),true,'names compare as the receipts spell them');
  assert.equal(mayWrite('human',[ANYONE]),true);
  assert.equal(mayWrite('human',['claude-code']),false);
});

test('no agent command can change who may edit, in any mode',()=>{
  const states:Authority[]=[at('design'),{mode:'connected',holder:null,now:NOW,allowed:['claude-code']},{mode:'connected',holder:null,now:NOW,allowed:[ANYONE]},at('delegated')];
  for(const action of doorActions){
    assert.equal(gateFor({kind:'act',action}),DOOR_KIND,action);
    assert.equal(gateFor({kind:'click'},action),DOOR_KIND,`a click that lands on ${action}`);
    assert.equal(gateFor({kind:'command'},action),DOOR_KIND,`a palette entry that runs ${action}`);
    for(const a of states){
      const v=refused(gateFor({kind:'act',action}),'claude-code',a);
      assert.equal(v.status,403,`${action} in ${a.mode}`);
      assert.match(v.error,/the person's to decide/);
    }
  }
  assert.equal(gateFor({kind:'act',action:'  Ask-Allow '}),DOOR_KIND,'spelling does not get around it');
});

test('the remembered list is read back strictly',()=>{
  assert.deepEqual(readAllowed(JSON.stringify(['claude-code','astra'])),['claude-code','astra']);
  assert.deepEqual(readAllowed(JSON.stringify(['*'])),[ANYONE]);
  assert.deepEqual(readAllowed(null),[]);
  assert.deepEqual(readAllowed('not json'),[]);
  assert.deepEqual(readAllowed('{"claude-code":true}'),[]);
  assert.deepEqual(readAllowed(JSON.stringify(['Claude Code','human','unknown-agent',7,'claude-code','claude-code'])),['claude-code'],'only clean names, once each');
  assert.deepEqual(allowAgent(['claude-code'],'Astra'),['claude-code','astra']);
  assert.deepEqual(allowAgent(['claude-code'],'claude-code'),['claude-code']);
  assert.deepEqual(forgetAgent(['claude-code','astra'],'claude-code'),['astra']);
  assert.notEqual(normalizeCaller('*'),ANYONE,'an agent cannot name itself the switch');
});
