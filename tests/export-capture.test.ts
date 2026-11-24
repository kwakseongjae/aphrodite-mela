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
    assert.match(body, /const board=project[,;]/, `${name}: it holds the board Save was pressed on`);
    // 0.3-R ⑦ (Codex P3 check4): its receipt goes into the run open on that board when Save was pressed (exportRun), with that
    // board's revision, and there is one: a check that counted none would pass with every receipt taken out.
    assert.match(body.slice(0, body.indexOf('await ')), /receipt=exportRun\(board\)/, `${name}: the run is held before the first wait`);
    assert.doesNotMatch(after, /recordRun\(/, `${name}: no receipt goes to whatever run is open later`);
    assert.ok((after.match(/\breceipt\(/g) ?? []).length >= 1, `${name}: and it leaves one`);
    assert.doesNotMatch(after, /local:resolveLocalBytes|,resolveLocalBytes,/, `${name}: its pictures come from that board's library`);
    if (name !== 'download-page-html') assert.match(body, /resolveLocalBytes\(id,board\.id\)/, `${name}: the library of the board held, by its id`);
  }
  // An agent's export of the files goes the same way.
  const agentExport = main.slice(main.indexOf("if(c.format==='files'){"), main.indexOf('approved:isApproved(', main.indexOf("if(c.format==='files'){")) + 40);
  assert.doesNotMatch(agentExport.slice(agentExport.indexOf('await ')), /\bproject\b|recordRun\(/, 'an agent\'s export of the files too');
  assert.match(agentExport, /receipt=exportRun\(board\)/);
  assert.match(agentExport, /resolveLocalBytes\(id,board\.id\)/);
  assert.doesNotMatch(main, /exportBundle\(project,resolveLocalBytes/, 'no export reads the library of whatever board is open later');
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

test('an export\'s receipt goes into the run that was open on its board when it began, with that board\'s revision', () => {
  const at = main.indexOf('function exportRun(board:Project)');
  assert.ok(at >= 0);
  const body = main.slice(at, main.indexOf('\n', at));
  assert.match(body, /const run=assemblyRun&&assemblyRun\.status!=='ended'&&assemblyRun\.projectId===board\.id\?assemblyRun:null;return/, 'the run is taken when the export begins');
  assert.match(body, /appendEvent\(run,board,/, 'and the event is written into it, with the board exported');
});
