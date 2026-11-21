import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/* 0.3-P3-fix2 #11: an export waits for files to be read and for the person to choose where it goes. Whatever board is
   open by then, the file is the board that was open when Save was pressed: its name, and its pictures' library. And
   the answer to "does this page have videos" goes only into the dialog that asked. Read from the source, as the
   command-effects test reads it: nothing after an export's first wait names the open board. */
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const action = (name: string) => { const at = main.indexOf(`case '${name}':`); assert.ok(at >= 0, name); return main.slice(at, main.indexOf('break;', main.indexOf('finally', at))); };

test('an export names, reads and saves the board open when Save was pressed, never the one open after a wait', () => {
  for (const name of ['download-page-html', 'download-board-file', 'download-bundle']) {
    const body = action(name), after = body.slice(body.indexOf('await '));
    assert.doesNotMatch(after, /\bproject\b|currentPage\(/, `${name}: after its first wait it names only what it held`);
    assert.doesNotMatch(after, /local:resolveLocalBytes|,resolveLocalBytes,/, `${name}: its pictures come from that board's library`);
  }
  assert.match(main, /async function resolveLocalBytes\(id:string,projectId=project\.id\)/);
  assert.match(main, /'image_library_read',\{id,project:projectId\}/);
});

test('whether a page has videos is answered only into the dialog that asked', () => {
  const at = main.indexOf("const videos = modalRoot.querySelector<HTMLElement>('[data-export-videos]');");
  assert.ok(at >= 0, 'the dialog is held before the files are looked at');
  const then = main.slice(at, main.indexOf('\n', main.indexOf('.then(', at)));
  assert.match(then, /videos\.isConnected/, 'and the answer goes in only while it is still on screen');
  assert.doesNotMatch(then.slice(then.indexOf('.then(')), /modalRoot\.querySelector/, 'never into whatever dialog is open by then');
});
