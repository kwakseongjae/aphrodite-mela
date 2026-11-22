import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/* 0.3-P3-fix3 #7: what comes in from outside takes one place in one line. Read from the source, as the command-effects
   test reads it: the desktop's Finder opens are what the gates cannot drive. */
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const body = (start: string, end: string) => { const at = main.indexOf(start); assert.ok(at >= 0, start); return main.slice(at, main.indexOf(end, at)); };

test('a file macOS hands over again while it waits in the line is put in once, and read once', () => {
  const take = body('async function takeOpened(){', '\n}\n');
  assert.match(take, /if\(filesWaiting\.has\(file\.id\)\)continue;filesWaiting\.add\(file\.id\);/);
  assert.match(take, /finally\{filesWaiting\.delete\(file\.id\);\}/, 'and it may come again once it has been opened');
});

test('a board file from the picker takes its place in the line as it starts to be read, not once it has been', () => {
  const pick = body("case 'import-project':", "case 'new-project':");
  assert.match(pick, /await opening\(async\(\)=>openBoardFileNow\(new Uint8Array\(await file\.arrayBuffer\(\)\)\)\)/);
});

test('the workspaces on screen change only once they are stored', () => {
  assert.match(main, /function saveWorkspaces\(next:WorkspaceBook\)\{if\(!writeWorkspaces\(localStorage,next\)\)throw new Error\([^\n]*\);workspaces=next;\}/);
});
