/**
 * 0.3-L4 ③: the export dialog on a board with a section page hands off; on a board without one its two ways out lead.
 * The same controls either way, read off the markup the way tests/surface-actions.test.ts reads every moved surface.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportBodyHtml, type ExportView} from '../src/editor/export-view.ts';
import {reachable} from './support/surfaces.ts';

const CARD = '<div class="export-page ui-card" data-export-page><input type="checkbox" data-export-scripts><button data-action="download-page-html">Download this page</button></div>';
const base: ExportView = {sections: true, ko: true, approved: false, shown: 'r2:1', view: 'prompt', code: 'Build it.', pageCard: '', pages: 2, boardExtension: 'aph', labels: {copyPrompt: 'Copy prompt', bundle: 'Download handoff .zip'}};

test('a board with a section page offers the handoff: approval, the three files to read, the board, the prompt and the zip', () => {
  assert.deepEqual(reachable(exportBodyHtml(base)), ['approve-export[shown=r2:1]', 'copy-prompt', 'download-board-file', 'download-bundle', 'export-tab[view=design]', 'export-tab[view=html]', 'export-tab[view=prompt]']);
  assert.match(exportBodyHtml(base), /data-export-carried hidden/, 'what goes out, and what the board came without, is said there');
});

test('a board without one offers the board file first and the open page as one HTML file, and none of the handoff', () => {
  const html = exportBodyHtml({...base, sections: false, pageCard: CARD});
  assert.deepEqual(reachable(html), ['download-board-file', 'download-page-html']);
  assert.match(html, /data-export-carried hidden/, 'the note on what the board came without stays');
  assert.match(html, /data-export-scripts/, 'the page keeps its scripts choice');
  assert.match(html, /class="ui-btn ui-btn-primary ui-btn-md" data-action="download-board-file"/, 'saving the board is the main answer');
  for (const gone of ['approve-export', 'export-tab', 'copy-prompt', 'download-bundle', 'export-code', 'PROMPT.md']) assert.ok(!html.includes(gone), gone);
});

test('with no page of its own in view, a board without a section page still offers its board file', () => {
  assert.deepEqual(reachable(exportBodyHtml({...base, sections: false})), ['download-board-file']);
});
