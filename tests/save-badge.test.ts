/**
 * 0.3-L4-3 fix 1 #10: the left panel's line on where the board is saved says what is true now. The desktop's write
 * queue answers after the panel is drawn (saving, then saved or not), and its answer redraws the line, found by its
 * data- attribute, not a class name a restyle can change.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveBadgeHtml} from '../src/editor/save-badge.ts';

test('each state reads as itself, and only the unsaved one is a warning', () => {
  const saved = saveBadgeHtml('saved', {native: true, ko: false, title: 'Saved to disk'});
  assert.match(saved, /data-save-badge="saved"/);
  assert.match(saved, /Saved on this Mac/);
  assert.doesNotMatch(saved, /warning/);
  assert.match(saveBadgeHtml('saved', {native: false, ko: true, title: ''}), /이 브라우저에 저장됨/);
  assert.match(saveBadgeHtml('saving', {native: true, ko: false, title: ''}), /Saving to this Mac/);
  const unsaved = saveBadgeHtml('unsaved', {native: true, ko: true, title: 'Unsaved'});
  assert.match(unsaved, /class="panel-save ui-side-sub warning"/);
  assert.match(unsaved, /아직 저장되지 않음/);
});

test('the write queue\'s answer redraws the line it finds by its data- attribute', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const answer = main.slice(main.indexOf('function attachDiskQueue'), main.indexOf('async function reloadFromDisk'));
  assert.match(answer, /\[data-save-badge\]/);
  assert.match(answer, /saveBadge\(saves\.badge/);
  assert.doesNotMatch(main, /\.save-indicator/, 'no lookup by a class nothing draws');
});
