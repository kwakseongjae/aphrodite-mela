/**
 * 0.3-R fix 2 (Codex check2 of 0.3-R, 2026-11-24).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personOnlyRow, commandById} from '../src/agent/commands.mjs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const updates = readFileSync(new URL('../src/editor/updates.ts', import.meta.url), 'utf8');

/* 1 (high): every command that puts the board on disk back in place of the one in memory. Reloading and relaunching are
   the person's alone, by the table and in the handler, and relaunching goes the way closing the window goes: the board
   is saved first, and if it cannot be, the person is asked. */
test('relaunching is the person\'s alone and saves first, like closing; reloading stays theirs', () => {
  assert.equal(personOnlyRow('update-relaunch'), 'outside.relaunch');
  assert.equal(commandById['outside.relaunch'].author, 'person-only');
  assert.equal(personOnlyRow('disk-reload'), 'outside.disk-reload');
  assert.match(main, /if\(act==='update-relaunch'&&refusal\(d,'outside\.relaunch'\)\)return;/, 'the handler asks who pressed, before anything');
  assert.match(updates, /case 'update-relaunch': \{\n\s*try\{await host\.leaving\(async\(\)=>\{const \{relaunch\}=await import\('@tauri-apps\/plugin-process'\);await relaunch\(\);\}\);\}/, 'and relaunches through the close');
  assert.match(main, /leaving:go=>closer\.request\(go\)/, 'which main gives as the window\'s close');
});
