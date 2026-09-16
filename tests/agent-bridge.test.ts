import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAgentCommand,isHumanHatch,bridgeExamples,libraryActions} from '../src/agent/bridge';

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

/* The agent console printed these lines with the live token inside them, so any demo, stream or
   screenshot of that panel carried a working credential out of the room. The lines now read the
   token out of the endpoint file at run time — the same recipe docs/AGENT-CHANNEL.md gives. */
test('bridge examples reach the channel without ever printing the token',()=>{
  const secret='s3cret-token-value';
  const text=bridgeExamples('http://127.0.0.1:4321','/Users/someone/Library/Application Support/studio.aphrodite.mela/agent-endpoint.json');
  assert.ok(!text.includes(secret),'no caller secret can reach the screen: the function is not given one');
  assert.doesNotMatch(text,/Bearer [A-Za-z0-9]{8}/,'nothing that looks like a literal token is rendered');
  assert.match(text,/agent-endpoint\.json/,'it says where the token lives');
  assert.match(text,/Bearer \$T/,'the shell reads the token at run time');
  assert.match(text,/\$B\/agent\/state/);
  assert.match(text,/\/agent\/end/);
});

test('library commands validate the action, the scope and the payload',()=>{
  assert.deepEqual(libraryActions,['list','delete','import']);
  assert.deepEqual(parseAgentCommand('library',{}),{command:{kind:'library',action:'list',scope:'global'}});
  assert.deepEqual(parseAgentCommand('library',{action:'list',scope:'project'}),{command:{kind:'library',action:'list',scope:'project'}});
  assert.deepEqual(parseAgentCommand('library',{action:'delete',id:'0123456789abcdef'}),{command:{kind:'library',action:'delete',id:'0123456789abcdef',scope:'global'}});
  assert.match((parseAgentCommand('library',{action:'delete'}) as {error:string}).error,/16-character/);
  assert.match((parseAgentCommand('library',{action:'delete',id:'nope'}) as {error:string}).error,/16-character/);
  assert.match((parseAgentCommand('library',{action:'wipe'}) as {error:string}).error,/list\|delete\|import/);
  assert.match((parseAgentCommand('library',{scope:'/etc'}) as {error:string}).error,/scope/);
  assert.match((parseAgentCommand('library',{action:'import',name:'x'}) as {error:string}).error,/base64/);
  assert.match((parseAgentCommand('library',{action:'import',base64:'AAAA'}) as {error:string}).error,/name/);
  assert.match((parseAgentCommand('library',{action:'import',name:'x',base64:'not base64 <>'}) as {error:string}).error,/base64/);
  assert.deepEqual(parseAgentCommand('library',{action:'import',name:'hero',base64:'AAAA',scope:'project'}),{command:{kind:'library',action:'import',name:'hero',base64:'AAAA',scope:'project'}});
});
