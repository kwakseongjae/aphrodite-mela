/**
 * 0.3-R fix 4 (independent check 4 of 0.3-R, 2026-11-24).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const sourceOf = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* 1 (high): only the person's own hand takes a file off the list of what the board came without. Every place that does is one
   of the person's own placing: a drop or a paste, or pressing a library picture (adding one to the library is not, fix 5 #3).
   Nothing an agent runs does, and an agent's picture added to the library is answered with what the board holds back. */
test('only the person\'s three ways take a file off the list; no agent command does', () => {
  const where = (at: number) => {
    const fn = main.lastIndexOf('\nasync function ', at), named = main.slice(fn + 16, main.indexOf('(', fn + 16));
    const kase = main.lastIndexOf("case '", at), label = main.slice(kase + 6, main.indexOf("'", kase + 6));
    return named === 'putMedia' && main.indexOf('\n}\n', fn) > at ? 'putMedia' : label;
  };
  const sites = [...main.matchAll(/carriedNow\(/g)].map(m => where(m.index!));
  // Adding a picture to the library frees nothing either (0.3-R fix 5 #3): only placing it does.
  assert.deepEqual(sites.sort(), ['apply-local', 'putMedia']);
  const agent = main.slice(main.indexOf('async function runAgentCommand('), main.indexOf('\n}\n', main.indexOf('async function runAgentCommand(')));
  assert.doesNotMatch(agent, /carriedNow\(/, 'nothing an agent runs');
  for (const path of ['src/agent/apply.ts', 'src/agent/ops.ts', 'src/agent/bridge.ts', 'src/agent/contract.ts', 'mcp/aphrodite-mcp/tools.mjs']) assert.doesNotMatch(sourceOf(path), /carriedNow\(/, path);
  assert.match(agent, /const kept=heldFromAgent\(project,`local:\$\{added\.id\}`\);if\(kept\)held=kept;/, 'an agent\'s library picture is answered with what the board holds back');
  assert.match(agent, /\.\.\.\(held\?\{held_back:held\}:\{\}\)/);
});

/* 2 (medium): a close is "under way" from its request until it is answered, and no longer: a close whose save lands after its
   time is up, then answered with Cancel, leaves the closer free, so agents' writes go in again. Agents' writes are turned away while the closer is busy, by the closer's own word. */
import {windowCloser, type CloseAnswer} from '../src/workspace/closing.ts';
test('a close that saved late and was cancelled leaves nothing turned away; and agents\' writes go in again', async () => {
  let land!: () => void;
  const late = new Promise<void>(r => { land = r; });
  let destroyed = 0;
  const closer = windowCloser(async destroy => { await late; await destroy(); return true; }, async (): Promise<CloseAnswer> => { land(); await new Promise(r => setTimeout(r, 20)); return 'cancel'; }, async () => false, 30);
  const asked = closer.request(async () => { destroyed++; });
  assert.equal(closer.busy(), true, 'under way while the close runs');
  await asked;
  assert.equal(closer.busy(), false, 'free once the person answered, though the save landed after its time');
  assert.equal(destroyed, 0, 'and the window stays');
  assert.match(main, /if\(closer\.busy\(\)&&isWrite\(gateFor\(c,reachedAction\(c,agentLook\)\)\)\)return \{error:'Aphrodite is saving to close or restart/);
  assert.doesNotMatch(main, /shuttingDown|goingNow/, 'one word on it, the closer\'s');
});

/* 3 (low): a restart that fails after the board was saved is said in a notice, not asked about as a close that could not save. */
test('a failed restart after the save is a notice, not the close\'s question', () => {
  const updates = sourceOf('src/editor/updates.ts');
  assert.match(updates, /await host\.leaving\(async\(\)=>\{try\{await relaunch\(\);\}catch\(error\)\{host\.toast\(host\.ui\(`The new version could not start: \$\{String\(error\)\}`/);
});

/* 4 (low): the tool and the guide say what the two newer answers mean: a 423 while Aphrodite closes or restarts is to be tried
   again shortly, and a 403 for a file the board came without is the person's to place. */
import {mcpTools} from '../src/agent/commands.mjs';
import {guideFor} from '../src/agent/guide.ts';
test('the tool and the guide each say what the closing 423 and the held-back 403 mean', () => {
  const apply = JSON.stringify(mcpTools().find(t => t.name === 'aphrodite_apply_edits'));
  const guide = sourceOf('src/agent/guide.ts');
  for (const said of [apply, guide]) {
    assert.match(said, /423[^.]*clos(?:es|ing) or restart[^.]*try again/i);
    assert.match(said, /403[^.]*came without[^.]*person/i);
  }
  assert.equal(typeof guideFor, 'function');
});

/* 5 (low): a refusal that names the board open now says it through MCP too, where only the error's words reach the agent. */
import {refusalText} from '../mcp/aphrodite-mcp/tools.mjs';
test('MCP passes on a refusal with the board that is open now, in its words', () => {
  assert.equal(typeof refusalText, 'function', 'tools.mjs exports refusalText');
  const said = refusalText({error: 'another board was opened while this open waited its turn, so it was not opened.', status: 409, open: {project_id: 'p-1', name: 'Shop "A"'}}, 409);
  assert.match(said, /^another board was opened/);
  assert.match(said, /Shop "A"/);
  assert.match(said, /p-1/);
  assert.equal(refusalText({error: 'plain'}, 409), 'plain');
  assert.equal(refusalText({}, 500), 'Aphrodite refused that (HTTP 500).');
  assert.match(sourceOf('mcp/aphrodite-mcp/index.mjs'), /return \{isError: true, text: refusalText\(payload, response\.status\)\};/);
});
