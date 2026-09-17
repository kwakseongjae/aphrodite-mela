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
import {writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {join} from 'node:path';

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
  assert.ok(manifest.length >= 10, `${manifest.length} tools`);
  for (const tool of manifest) {
    assert.match(tool.name, /^aphrodite_[a-z_]+$/, `${tool.name} is namespaced`);
    assert.ok(tool.description.length > 120, `${tool.name} has a real description`);
    assert.match(tool.description, /Example:/, `${tool.name} shows a complete call`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has an object schema`);
    assert.equal(tool.annotations.openWorldHint, false, `${tool.name} stays local`);
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', `${tool.name} says whether it writes`);
  }
  const reads = manifest.filter(t => t.annotations.readOnlyHint).map(t => t.name);
  // An exact list, not a count: the point is to catch a tool that writes but claims it only reads.
  // Adding a read-only tool is meant to be a deliberate edit here.
  assert.deepEqual(reads.sort(), ['aphrodite_get_contract', 'aphrodite_get_render', 'aphrodite_get_taste', 'aphrodite_get_tokens', 'aphrodite_guide', 'aphrodite_list_components', 'aphrodite_list_images', 'aphrodite_list_references']);
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

/**
 * Nothing deletes agent-endpoint.json when the app exits, so a file naming a dead process is the
 * normal state of a Mac where the app has been closed. The port in it does not stay unused: the OS
 * hands it out again, and the next thing to get it is some unrelated local server.
 *
 * So the stale file here names a dead pid AND a port that is genuinely listening — something that is
 * not Aphrodite. Trusting the file means talking to that stranger and reporting whatever it says.
 * Checking the owner first means saying "not running", which is the truth.
 *
 * Pointing it at a merely-closed port would not test anything: the fetch would fail and the catch
 * would say "not running" for the wrong reason, and the check would pass with the pid logic deleted.
 * It did, when this was first written.
 */
check('a leftover endpoint file is not trusted, even when its port now answers', async () => {
  const dead = spawn('sh', ['-c', 'exit 0']);
  await new Promise(resolve => dead.on('exit', resolve));

  // The stranger that inherited the port. It answers plausibly, which is the whole danger.
  const stranger = createServer((_, response) => {
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({schema: 'something.else/1', hello: 'not aphrodite'}));
  });
  await new Promise(resolve => stranger.listen(0, '127.0.0.1', resolve));
  const port = stranger.address().port;

  const stalePath = join(tmpdir(), `aphrodite-stale-${process.pid}.json`);
  writeFileSync(stalePath, JSON.stringify({
    schema: 'aphrodite.agent-endpoint/1',
    port,
    token: 'x'.repeat(48),
    pid: dead.pid,
    base: `http://127.0.0.1:${port}`,
  }));

  const alt = spawn('node', ['mcp/aphrodite-mcp/index.mjs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {...process.env, APHRODITE_ENDPOINT_FILE: stalePath},
  });
  try {
    const out = createInterface({input: alt.stdout});
    const answer = new Promise((resolve, reject) => {
      out.on('line', line => { try { const m = JSON.parse(line); if (m.id === 1) resolve(m); } catch {} });
      setTimeout(() => reject(new Error('the stale-endpoint server never answered')), 8000);
    });
    alt.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'aphrodite_get_contract', arguments: {}}})}\n`);
    const {result} = await answer;
    assert.equal(result.isError, true, 'a dead owner is an error, not an answer');
    assert.match(
      result.content[0].text,
      /not running/,
      'it must refuse on the dead pid, not report what the stranger on that port said',
    );
  } finally {
    alt.kill('SIGKILL');
    stranger.close();
    rmSync(stalePath, {force: true});
  }
});

check('the guide arrives as prose, not as an escaped string inside JSON', async () => {
  const {result} = await request('tools/call', {name: 'aphrodite_guide', arguments: {}});
  const text = result.content[0].text;
  if (result.isError) return; // the app is closed; covered by the check above
  assert.match(text, /^# Working with Aphrodite/, 'it starts as a document');
  assert.ok(text.includes('\n'), 'real newlines, not \\n');
  assert.ok(!text.startsWith('{'), 'not wrapped in a JSON envelope');
  assert.match(text, /## Right now/);
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
