import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describeCaller} from '../src/agent/callers';

/* 0.3-1b owner review: the request said "claude-review" and nobody could tell what that was. The
   stored name stays the raw one the program sent; what the person reads is this. */
test('known programs are named the way a person knows them, with where they run',()=>{
  assert.deepEqual(describeCaller('claude-code'),{name:'Claude Code',source:'terminal',known:true,raw:'claude-code'});
  assert.deepEqual(describeCaller('codex-mcp-client'),{name:'Codex',source:'mcp',known:true,raw:'codex-mcp-client'});
  assert.equal(describeCaller('codex').name,'Codex');
  assert.equal(describeCaller('cursor-vscode').name,'Cursor');
  assert.equal(describeCaller('cursor').source,'mcp');
  assert.equal(describeCaller('claude-desktop').name,'Claude Desktop');
  assert.equal(describeCaller('claude-ai').name,'Claude Desktop','Claude Desktop introduces itself to MCP servers as claude-ai');
  assert.deepEqual(describeCaller('chatgpt'),{name:'ChatGPT',source:'in-app',known:true,raw:'chatgpt'});
});

test('an unknown program is shown by the name it gave, and said to be unknown',()=>{
  assert.deepEqual(describeCaller('claude-review'),{name:'claude-review',source:'unknown',known:false,raw:'claude-review'});
  assert.equal(describeCaller('mcp-client').known,false);
  assert.equal(describeCaller('unknown-agent').known,false);
  assert.equal(describeCaller('claude').known,false,'a prefix alone is not a match');
});
