import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAgentCommand} from '../src/agent/bridge';
import {isWrite,isRead} from '../src/agent/authority';

test('changing the design system and exporting are both writes',()=>{
  for(const kind of ['system','export']){
    assert.equal(isWrite(kind),true,`${kind} changes or produces something`);
    assert.equal(isRead(kind),false);
  }
});

test('system takes a built-in id, a DESIGN.md, or loose tokens — but not nothing',()=>{
  const empty=parseAgentCommand('system',{reason:'Why.'});
  assert.ok('error' in empty);
  assert.match(empty.error,/needs/);
  assert.ok('command' in parseAgentCommand('system',{id:'toss',reason:'Why.'}));
  assert.ok('command' in parseAgentCommand('system',{markdown:'# Brand\n\naccent: #ff0000',reason:'Why.'}));
  assert.ok('command' in parseAgentCommand('system',{tokens:{accent:'#ff0000'},reason:'Why.'}));
});

/* 0.3-2b: repainting the whole project is an edit like any other, so it says why and what it read. */
test('system needs a reason, and carries the revision it was written against',()=>{
  const bare=parseAgentCommand('system',{id:'toss'});
  assert.ok('error' in bare);
  assert.match(bare.error,/reason is required/);
  assert.match((parseAgentCommand('system',{id:'toss',reason:'   '}) as {error:string}).error,/reason is required/);
  assert.match((parseAgentCommand('system',{id:'toss',reason:42}) as {error:string}).error,/reason must be text/);
  assert.match((parseAgentCommand('system',{id:'toss',reason:'x'.repeat(501)}) as {error:string}).error,/keep it under 500/);
  assert.deepEqual(parseAgentCommand('system',{id:'toss',reason:'The person asked for it.',base_revision:'1:a:b'}),
    {command:{kind:'system',id:'toss',markdown:undefined,name:undefined,tokens:undefined,reason:'The person asked for it.',baseRevision:'1:a:b'}});
  assert.match((parseAgentCommand('system',{id:'toss',reason:'Why.',base_revision:7}) as {error:string}).error,/base_revision must be/);
});

test('edit needs a reason too, and act and command may carry one',()=>{
  assert.match((parseAgentCommand('edit',{field:'title',text:'Hi'}) as {error:string}).error,/reason is required/);
  assert.match((parseAgentCommand('edit',{field:'title',text:'Hi',reason:'Why.',base_revision:''}) as {error:string}).error,/base_revision must be/);
  assert.deepEqual(parseAgentCommand('act',{action:'add',data:{kind:'cta'},reason:'Why.'}),{command:{kind:'act',action:'add',data:{kind:'cta'},reason:'Why.'}});
  assert.deepEqual(parseAgentCommand('act',{action:'add'}),{command:{kind:'act',action:'add',data:{}}},'optional: none is fine');
  assert.deepEqual(parseAgentCommand('command',{query:'Add CTA',reason:'Why.'}),{command:{kind:'command',query:'Add CTA',reason:'Why.'}});
  assert.match((parseAgentCommand('command',{query:'Add CTA',reason:7}) as {error:string}).error,/reason must be text/);
  // use_interface hands its payload to the verb's own parser, so a command through it keeps its reason.
  assert.ok('command' in parseAgentCommand('ui',{action:'command',query:'Add CTA',reason:'Why.'}));
});

/** An id becomes a lookup key, never anything else. */
test('a system id cannot carry a path or a script',()=>{
  for(const id of ['../../etc','<script>','a b','UPPER']){
    assert.ok('error' in parseAgentCommand('system',{id}),`${id} should be refused`);
  }
});

/* Half a DESIGN.md is not a design system, so an oversized one is refused rather than clamped — and
   the refusal has to say which problem it was. Answering "you sent nothing" to someone who sent
   300 KB just makes them send it again. */
test('an oversized DESIGN.md is refused, and told why',()=>{
  const out=parseAgentCommand('system',{markdown:'#'.repeat(300_000)});
  assert.ok('error' in out);
  assert.match(out.error,/200KB/);
  assert.doesNotMatch(out.error,/needs a built-in/,'that message would send them round the loop again');
});

test('export answers with the contract unless files are asked for',()=>{
  const dflt=parseAgentCommand('export',{});
  assert.ok('command' in dflt);
  assert.equal((dflt.command as {format:string}).format,'contract');
  const files=parseAgentCommand('export',{format:'files'});
  assert.ok('command' in files);
  assert.equal((files.command as {format:string}).format,'files');
  assert.ok('error' in parseAgentCommand('export',{format:'pdf'}));
});
