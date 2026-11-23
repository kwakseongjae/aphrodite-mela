/**
 * 0.3-R fix 1 (Codex mid-review of 0.3-R, 2026-11-23).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personOnlyRow, commandById} from '../src/agent/commands.mjs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const caseOf = (name: string) => { const at = main.indexOf(`case '${name}':`); assert.ok(at >= 0, name); return main.slice(at, main.indexOf('\n', at)); };

/* 1 (high): reloading from disk puts the saved copy back, an approved one included, over a draft whose save failed. It is
   the person's alone, by the table and in the handler, before the library is replaced. */
test('reloading from disk is the person\'s alone: an agent\'s command is refused, and the handler asks who pressed before it reads the disk', () => {
  assert.equal(personOnlyRow('disk-reload'), 'outside.disk-reload');
  assert.equal(commandById['outside.disk-reload'].author, 'person-only');
  assert.match(caseOf('disk-reload'), /case 'disk-reload': if\(refusal\(d,'outside\.disk-reload'\)\)break;await reloadFromDisk\(\);/);
});

/* 4: what an approve button was drawn over names the board, and the review card follows the canvas when an edit redraws only
   the canvas, so the person's first press after it approves. */
test('an approve button holds the board it was drawn for, and the card takes the canvas\'s state when a field edit redraws only the canvas', () => {
  assert.match(main, /function shownState\(\)\{return `\$\{project\.id\}\|\$\{fingerprint\(project\)\}\|/);
  const at = main.indexOf("const review = document.querySelector('.review-card');");
  const block = main.slice(at, main.indexOf('syncStateAttributes();', at));
  assert.match(block, /approve\.dataset\.shown = shownState\(\);/);
});

/* 8: libraries frozen as v0.2.4 and main (374480b) wrote them, each with what its own reader said of every board (made by
   that code, from a checkout of it). What was approved there is approved on the first read here; a draft stays a draft. */
import {readLibrary, LIBRARY_KEY} from '../src/workspace/library.ts';
import {isApproved} from '../src/model.ts';
for (const name of ['library-v0.2.4.json', 'library-main-374480b.json']) test(`a library ${name.slice(8, -5)} wrote keeps every approval its own reader saw, and no other`, () => {
  const frozen = JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as {library: string; approved: Record<string, boolean>};
  assert.ok(Object.values(frozen.approved).filter(Boolean).length >= 4, 'it holds approved boards');
  assert.ok(frozen.library.includes('"lineHeight":1.5,"weight":400,"size":16'), 'and a type role stored in another key order');
  const read = readLibrary({getItem: k => k === LIBRARY_KEY ? frozen.library : null, setItem: () => {}});
  for (const e of read.entries) assert.equal(isApproved(e.project), frozen.approved[e.project.id], e.project.id);
});
