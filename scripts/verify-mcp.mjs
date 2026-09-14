/**
 * Stage 3 gate: does the MCP server speak the protocol, and does it reach the app?
 *
 * Plays the part of a client over stdio — initialize, tools/list, tools/call — and checks the two
 * things a thin adapter has to get right: every tool is described and annotated honestly, and the
 * app's own refusals arrive intact rather than being swallowed or reinterpreted.
 *
 *   node scripts/verify-mcp.mjs
 */
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';

const server = spawn('node', ['mcp/aphrodite-mcp/index.mjs'], {stdio: ['pipe', 'pipe', 'pipe']});
const lines = createInterface({input: server.stdout});
const pending = new Map();
const stray = [];
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { stray.push(line); return; }
  if (message.id !== undefined && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
let id = 0;
const request = (method, params) => new Promise((resolve, reject) => {
  const mine = ++id;
  pending.set(mine, resolve);
  server.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: mine, method, params})}\n`);
  setTimeout(() => reject(new Error(`${method} timed out`)), 10_000);
});
const notify = method => server.stdin.write(`${JSON.stringify({jsonrpc: '2.0', method})}\n`);

const checks = [];
const check = (name, fn) => checks.push([name, fn]);
let manifest = [];

check('it introduces itself and agrees on a protocol version', async () => {
  const {result} = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'harness', version: '1'}});
  assert.equal(result.protocolVersion, '2025-06-18', 'it speaks the version it was asked for');
  assert.equal(result.serverInfo.name, 'aphrodite');
  assert.ok(result.capabilities.tools, 'it offers tools');
  assert.match(result.instructions, /contract/, 'it tells the client how to work with it');
  notify('notifications/initialized');
});

check('an unknown protocol version gets a known one back, not a refusal', async () => {
  const other = spawn('node', ['mcp/aphrodite-mcp/index.mjs'], {stdio: ['pipe', 'pipe', 'ignore']});
  const answer = await new Promise(resolve => {
    createInterface({input: other.stdout}).on('line', line => resolve(JSON.parse(line)));
    other.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '1999-01-01', capabilities: {}}})}\n`);
  });
  other.kill('SIGKILL');
  assert.ok(answer.result.protocolVersion.startsWith('202'), 'it offers a version it actually speaks');
});

check('every tool is named, described and annotated honestly', async () => {
  const {result} = await request('tools/list');
  manifest = result.tools;
  assert.ok(manifest.length >= 9, `${manifest.length} tools`);
  for (const tool of manifest) {
    assert.match(tool.name, /^aphrodite_[a-z_]+$/, `${tool.name} is namespaced`);
    assert.ok(tool.description.length > 120, `${tool.name} has a real description`);
    assert.match(tool.description, /Example:/, `${tool.name} shows a complete call`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has an object schema`);
    assert.equal(tool.annotations.openWorldHint, false, `${tool.name} stays local`);
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', `${tool.name} says whether it writes`);
  }
  const reads = manifest.filter(t => t.annotations.readOnlyHint).map(t => t.name);
  assert.deepEqual(reads.sort(), ['aphrodite_get_contract', 'aphrodite_get_tokens', 'aphrodite_guide', 'aphrodite_list_components', 'aphrodite_list_images']);
  const destructive = manifest.filter(t => t.annotations.destructiveHint).map(t => t.name);
  assert.deepEqual(destructive, ['aphrodite_delete_image'], 'deleting a picture is the only destructive tool');
});

check('nothing that could approve a direction is offered', async () => {
  const text = JSON.stringify(manifest).toLowerCase();
  assert.ok(!manifest.some(t => t.name.includes('approve')), 'no approval tool exists');
  assert.match(text, /person|human/, 'the tools say whose decision that is');
});

check('an unknown tool is refused as content, not as a protocol error', async () => {
  const {result, error} = await request('tools/call', {name: 'aphrodite_take_over', arguments: {}});
  assert.equal(error, undefined, 'the call itself succeeded');
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No such tool/);
});

check('an unknown method answers with method-not-found', async () => {
  const {error} = await request('resources/list');
  assert.equal(error.code, -32601);
});

check('ping is answered', async () => {
  const {result} = await request('ping');
  assert.deepEqual(result, {});
});

check('with the app closed it says so in one sentence, not a stack trace', async () => {
  const {result} = await request('tools/call', {name: 'aphrodite_get_contract', arguments: {}});
  const text = result.content[0].text;
  if (result.isError) {
    assert.match(text, /Aphrodite is not running|refused/, text);
    assert.ok(!text.includes('at '), 'no stack trace leaked to the model');
    assert.ok(text.length < 300, 'the message stays short');
  } else {
    const contract = JSON.parse(text);
    assert.equal(contract.schema, 'aphrodite.contract/1', 'the app is running, so a real contract came back');
  }
});

check('nothing but protocol messages went to stdout', async () => {
  assert.deepEqual(stray, [], `stdout carried non-JSON lines: ${stray.join(' | ')}`);
});

let failed = 0;
for (const [name, fn] of checks) {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (error) { failed++; console.log(`  FAIL ${name}\n       ${error.message}`); }
}
console.log(failed ? `\n${failed} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
server.kill('SIGKILL');
process.exit(failed ? 1 : 0);
