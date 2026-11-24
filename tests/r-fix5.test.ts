/**
 * 0.3-R fix 5 (Codex's check of fix 4, 2026-11-25).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const body = (name: string) => { const start = main.indexOf(name); return main.slice(start, main.indexOf('\n}\n', start)); };

/* 1: a batch that landed keeps its files' marks until its save is on the disk; one that did not lets go of them at once. A
   process that ends between the two leaves the mark, and the next one judges it by the library as it is then. */
test('a landed batch lets go of its files\' marks only once its save is on the disk', () => {
  const apply = body('async function applyBatch(');
  assert.match(apply, /\}finally\{if\(answer\?\.ok===true\)void flushDisk\(\)\.then\(\(\)=>frameHost\.releaseMedia\(staged,true\)\)\.catch\(\(\)=>\{\}\);else await frameHost\.releaseMedia\(staged,false\)\.catch\(\(\)=>\{\}\);\}/);
});
