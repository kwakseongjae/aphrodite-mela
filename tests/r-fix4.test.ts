/**
 * 0.3-R fix 4 (independent check 4 of 0.3-R, 2026-11-24).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const sourceOf = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* 1 (high): only the person's own hand takes a file off the list of what the board came without. Every place that does is one
   of the person's three: a drop or a paste, pressing a library picture, and a picture the person adds to the library. Nothing
   an agent runs does, and an agent's picture added to the library is answered with what the board holds back. */
test('only the person\'s three ways take a file off the list; no agent command does', () => {
  const where = (at: number) => {
    const fn = main.lastIndexOf('\nasync function ', at), named = main.slice(fn + 16, main.indexOf('(', fn + 16));
    const kase = main.lastIndexOf("case '", at), label = main.slice(kase + 6, main.indexOf("'", kase + 6));
    return named === 'putMedia' && main.indexOf('\n}\n', fn) > at ? 'putMedia' : label;
  };
  const sites = [...main.matchAll(/carriedNow\(/g)].map(m => where(m.index!));
  assert.deepEqual(sites.sort(), ['apply-local', 'local-import', 'putMedia']);
  const agent = main.slice(main.indexOf('async function runAgentCommand('), main.indexOf('\n}\n', main.indexOf('async function runAgentCommand(')));
  assert.doesNotMatch(agent, /carriedNow\(/, 'nothing an agent runs');
  for (const path of ['src/agent/apply.ts', 'src/agent/ops.ts', 'src/agent/bridge.ts', 'src/agent/contract.ts', 'mcp/aphrodite-mcp/tools.mjs']) assert.doesNotMatch(sourceOf(path), /carriedNow\(/, path);
  assert.match(agent, /const kept=heldFromAgent\(project,`local:\$\{added\.id\}`\);if\(kept\)held=kept;/, 'an agent\'s library picture is answered with what the board holds back');
  assert.match(agent, /\.\.\.\(held\?\{held_back:held\}:\{\}\)/);
});
