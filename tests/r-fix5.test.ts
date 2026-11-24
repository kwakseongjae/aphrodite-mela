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

/* 2: the close says a save that has not finished is still being saved, not that it failed; and the window's going is asked
   for once, however the save and the time limit fall. */
import {windowCloser, StillSaving, type CloseAnswer} from '../src/workspace/closing.ts';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
test('a save still under way when the time is up is asked about as still saving', async () => {
  assert.equal(typeof StillSaving, 'function', 'closing.ts exports StillSaving');
  const asked: unknown[] = [];
  const closer = windowCloser(() => new Promise(() => {}), async (why): Promise<CloseAnswer> => { asked.push(why); return 'cancel'; }, async () => false, 20);
  await closer.request(async () => {});
  assert.ok(asked[0] instanceof StillSaving, String(asked[0]));
  assert.match(main, /const pending=error instanceof StillSaving,said=pending\?ui\(`The board is still being saved/);
  assert.match(main, /const slow=\(\)=>new StillSaving\(/, 'the close\'s own bounded waits say the same');
});
test('a window whose going began before the time ran out goes once, and the person is not asked', async () => {
  let gone = 0, asked = 0;
  const closer = windowCloser(async destroy => { await destroy(); return true; }, async (): Promise<CloseAnswer> => { asked++; return 'discard'; }, async () => false, 20);
  await closer.request(async () => { gone++; await wait(60); });
  assert.equal(gone, 1, 'once');
  assert.equal(asked, 0, 'nobody is asked about a window already going');
});
test('a save that lands as the time runs out closes the window once', async () => {
  let gone = 0;
  const closer = windowCloser(async destroy => { await wait(20); await destroy(); return true; }, async (): Promise<CloseAnswer> => 'discard', async () => false, 20);
  await closer.request(async () => { gone++; });
  await wait(30);
  assert.equal(gone, 1);
});

/* 3: adding a picture to the image library does not let it go out with the board; only placing it does: a drop or a paste,
   or pressing the picture to put it on the board. That is what the export's notice tells the person to do. */
test('only placing a picture on the board takes it off the list, as the notice says; adding it to the library does not', () => {
  const where = (at: number) => {
    const fn = main.lastIndexOf('\nasync function ', at), named = main.slice(fn + 16, main.indexOf('(', fn + 16));
    const kase = main.lastIndexOf("case '", at), label = main.slice(kase + 6, main.indexOf("'", kase + 6));
    return named === 'putMedia' && main.indexOf('\n}\n', fn) > at ? 'putMedia' : label;
  };
  assert.deepEqual([...main.matchAll(/carriedNow\(/g)].map(m => where(m.index!)).sort(), ['apply-local', 'putMedia']);
  const added = main.slice(main.indexOf("case 'local-import':"), main.indexOf("\n    case '", main.indexOf("case 'local-import':") + 20));
  assert.doesNotMatch(added, /carriedNow|leftOut/);
  assert.match(main, /To send one, put it on the board again\./, 'the notice asks for placing, which is what frees it');
});
