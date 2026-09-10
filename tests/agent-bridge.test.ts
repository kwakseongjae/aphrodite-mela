import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAgentCommand,isHumanHatch,bridgeExamples} from '../src/agent/bridge';

test('parseAgentCommand validates every kind and rejects junk',()=>{
  assert.deepEqual(parseAgentCommand('state',null),{command:{kind:'state'}});
  assert.deepEqual(parseAgentCommand('act',{action:'add',data:{kind:'hero'}}),{command:{kind:'act',action:'add',data:{kind:'hero'}}});
  assert.match((parseAgentCommand('act',{action:'Add Thing'}) as {error:string}).error,/kebab-case/);
  assert.match((parseAgentCommand('act',{action:'add',data:{'bad key':'x'}}) as {error:string}).error,/bad data key/);
  assert.deepEqual(parseAgentCommand('click',{selector:'[data-action="page"]'}),{command:{kind:'click',selector:'[data-action="page"]'}});
  assert.match((parseAgentCommand('click',{selector:'<script>'}) as {error:string}).error,/selector/);
  assert.deepEqual(parseAgentCommand('type',{selector:'[data-field=title]',text:'hi',submit:true}),{command:{kind:'type',selector:'[data-field=title]',text:'hi',submit:true}});
  assert.deepEqual(parseAgentCommand('key',{key:'1',shift:true}),{command:{kind:'key',key:'1',code:undefined,meta:false,shift:true,ctrl:false,alt:false}});
  assert.deepEqual(parseAgentCommand('command',{query:' 버튼 추가 '}),{command:{kind:'command',query:'버튼 추가'}});
  assert.deepEqual(parseAgentCommand('edit',{field:'title',text:'Hello'}),{command:{kind:'edit',field:'title',text:'Hello'}});
  assert.deepEqual(parseAgentCommand('edit',{field:'text',text:'x',blockId:'abc-1'}),{command:{kind:'edit',field:'text',text:'x',blockId:'abc-1'}});
  assert.match((parseAgentCommand('edit',{field:'image',text:'x'}) as {error:string}).error,/field/);
  assert.match((parseAgentCommand('dance',{}) as {error:string}).error,/unknown command kind/);
});

test('the only human key while locked is ⌘⇧A',()=>{
  assert.equal(isHumanHatch({key:'a',code:'KeyA',metaKey:true,shiftKey:true}),true);
  assert.equal(isHumanHatch({key:'A',metaKey:true,shiftKey:true}),true);
  assert.equal(isHumanHatch({key:'a',code:'KeyA',metaKey:true,shiftKey:false}),false);
  assert.equal(isHumanHatch({key:'Escape',code:'Escape',metaKey:false,shiftKey:false}),false);
});

test('bridge examples carry the base url and token',()=>{
  const text=bridgeExamples('http://127.0.0.1:4321','abc');
  assert.match(text,/http:\/\/127\.0\.0\.1:4321\/agent\/state/);
  assert.match(text,/Bearer abc/);
  assert.match(text,/\/agent\/end/);
});
