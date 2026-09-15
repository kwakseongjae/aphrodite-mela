import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// The server is plain JavaScript with no dependencies, so a client needs nothing installed to run it.
import {tools,toolManifest,PREFIX} from '../mcp/aphrodite-mcp/tools.mjs';

const agentRs=readFileSync(new URL('../src-tauri/src/agent.rs',import.meta.url),'utf8');
const routes=[...agentRs.matchAll(/"(GET|POST) (\/agent\/[a-z]+)"/g)].map(m=>`${m[1]} ${m[2]}`);

test('every tool points at a route the app actually serves',()=>{
  assert.ok(routes.length>=13,`found ${routes.length} routes in the bridge`);
  for(const tool of tools){
    const route=`${tool.route.method} ${tool.route.path}`;
    assert.ok(routes.includes(route),`${tool.name} calls ${route}, which the bridge does not serve`);
  }
});

test('names are namespaced and unique',()=>{
  const names=tools.map(t=>t.name);
  assert.equal(new Set(names).size,names.length,'no duplicates');
  for(const name of names)assert.ok(name.startsWith(PREFIX),`${name} is not namespaced`);
});

test('a description tells an agent when to use it, when not, and shows one call',()=>{
  for(const tool of toolManifest()){
    assert.ok(tool.description.length>120,`${tool.name} is described too thinly`);
    assert.match(tool.description,/Example: \{/,`${tool.name} shows no complete call`);
    assert.ok(tool.title,`${tool.name} has no title`);
  }
});

test('annotations say honestly what each tool does',()=>{
  for(const tool of tools){
    const a=tool.annotations;
    assert.equal(a.openWorldHint,false,`${tool.name} is local only`);
    assert.equal(typeof a.readOnlyHint,'boolean');
    assert.equal(typeof a.destructiveHint,'boolean');
    if(a.readOnlyHint)assert.equal(a.destructiveHint,false,`${tool.name} cannot be both read-only and destructive`);
  }
  const reads=tools.filter(t=>t.annotations.readOnlyHint).map(t=>t.name).sort();
  assert.deepEqual(reads,['aphrodite_get_contract','aphrodite_get_render','aphrodite_get_tokens','aphrodite_guide','aphrodite_list_components','aphrodite_list_images']);
  assert.deepEqual(tools.filter(t=>t.annotations.destructiveHint).map(t=>t.name),['aphrodite_delete_image']);
});

test('a read-only tool never sends a body that changes anything',()=>{
  for(const tool of tools.filter(t=>t.annotations.readOnlyHint)){
    const body=tool.body?tool.body({}):{};
    assert.ok(!('ops' in body),`${tool.name} must not carry edits`);
    if('action' in body)assert.equal(body.action,'list',`${tool.name} may only list`);
  }
});

test('asking to connect is offered, but nothing can open the door by itself',()=>{
  const ask=tools.find(t=>t.name==='aphrodite_request_connection');
  assert.ok(ask,'an agent can ask');
  assert.equal(ask!.annotations.readOnlyHint,false,'it does change something: it puts a request on their screen');
  assert.equal(ask!.annotations.destructiveHint,false);
  assert.match(ask!.description,/one click/,'it says the person answers it');
  assert.match(ask!.description,/Nothing here can open the door on its own/);
  assert.ok(!tools.some(t=>t.body&&JSON.stringify(t.body({})).includes('connectMode')),'no tool flips the switch directly');
});

test('no tool can approve a direction',()=>{
  const surface=JSON.stringify(tools.map(t=>[t.name,t.description,t.route]));
  assert.ok(!tools.some(t=>t.name.includes('approve')));
  assert.ok(!surface.includes('/agent/approve'));
});

test('the manifest carries no plumbing a client should not see',()=>{
  for(const tool of toolManifest()){
    assert.equal((tool as Record<string,unknown>).route,undefined,'the route stays server-side');
    assert.equal((tool as Record<string,unknown>).body,undefined);
  }
});
