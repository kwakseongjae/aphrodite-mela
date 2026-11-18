import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tools,toolByName,PREFIX} from '../mcp/aphrodite-mcp/tools.mjs';
import {toolSnapshot} from './support/tool-snapshot.mjs';

/**
 * 0.3-2 moves the tool list into the command table and generates it from there. A client must not be
 * able to tell: same names in the same order, the same words, the same schema, and every call reaching
 * the same route with the same query or body. The fixture is the list as 0.3-1b shipped it; a change to
 * it is a change every connected agent sees, so it is made on purpose, in the commit that means it.
 */
const pinned=JSON.parse(readFileSync(new URL('./support/mcp-tools-0.3-1b.json',import.meta.url),'utf8'));

test('the tool list a client sees is the one 0.3-1b shipped, call for call',()=>{
  const live=JSON.parse(JSON.stringify(toolSnapshot(tools)));
  assert.deepEqual(live.map((t:{name:string})=>t.name),pinned.map((t:{name:string})=>t.name),'same tools, same order');
  for(const [i,tool] of live.entries())assert.deepEqual(tool,pinned[i],tool.name);
});

test('the exports the in-app panel branch imports keep their shape',()=>{
  assert.equal(PREFIX,'aphrodite_');
  assert.ok(Array.isArray(tools));
  for(const tool of tools)assert.equal(toolByName[tool.name],tool,`toolByName finds ${tool.name}`);
  assert.equal(Object.keys(toolByName).length,tools.length);
});
