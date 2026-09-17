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
  const empty=parseAgentCommand('system',{});
  assert.ok('error' in empty);
  assert.match(empty.error,/needs/);
  assert.ok('command' in parseAgentCommand('system',{id:'toss'}));
  assert.ok('command' in parseAgentCommand('system',{markdown:'# Brand\n\naccent: #ff0000'}));
  assert.ok('command' in parseAgentCommand('system',{tokens:{accent:'#ff0000'}}));
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
