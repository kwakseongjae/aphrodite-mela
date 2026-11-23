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
