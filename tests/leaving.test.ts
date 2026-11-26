import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/* 0.3-P3-fix3 #9: the rest of leaving, read from the source: a dialog closed while the editor took no input gives the
   keys back once the leaving is over, and the welcome sample and reloading from disk take their turn in the same line. */
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('a dialog closed during a leaving gives the keys back once the leaving is over', () => {
  assert.match(main, /app\.inert = leaving>0; if\(leaving\)focusAfterLeaving=modalReturnFocus;else modalReturnFocus\?\.focus\(\);/);
  const turn = main.slice(main.indexOf('function turn<T>('), main.indexOf('function leave<T>('));
  assert.match(turn, /finally\{leaving--;if\(!leaving\)\{app\.inert=modalRoot\.children\.length>0;if\(!app\.inert&&focusAfterLeaving\?\.isConnected/);
});

test('the welcome sample and reloading from disk take their turn in the line of leavings', () => {
  assert.match(main, /case 'welcome-sample': \{markWelcomed\(\);const sample=sampleProject\(uiLanguage\);await leave\(/);
  // 0.3-G2b fix 1: the question before a reload that would throw away unsaved work comes first, then the turn.
  assert.match(main, /async function reloadFromDisk\(\)\{\n  if\(!nativeDesktop\)return;\n(?:[^\n]*\n){1,3}  return turn\(\(\)=>reloadFromDiskNow\(\)\);/);
});
