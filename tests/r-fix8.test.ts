/**
 * 0.3-R, the two follow-ups to fix 7 (2026-11-25).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {windowCloser, closeRequests, type CloseAnswer} from '../src/workspace/closing.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/* 1: a window that did not go in its time lets the person ask again: the next close request reaches the closer. */
test('after a window that did not go in its time, the next close request reaches the closer', async () => {
  let asked = 0, said = 0;
  const closer = windowCloser(async destroy => { await destroy(); return true; }, async (): Promise<CloseAnswer> => 'cancel', async () => false, 1_000, 20);
  const requested = closeRequests(closer, () => { asked++; return new Promise<void>(() => {}); }, () => { said++; });
  const event = () => { let held = false; return {preventDefault() { held = true; }, get held() { return held; }}; };
  const first = event();
  await requested(first);
  assert.ok(first.held);
  assert.deepEqual([asked, said], [1, 1], 'asked once, and the refusal said');
  const again = event();
  await requested(again);
  assert.ok(again.held);
  assert.equal(asked, 2, 'the next request is the closer\'s again');
  assert.match(main, /onCloseRequested\(closeRequests\(closer,/, 'the desktop gives the system\'s requests to it');
});

/* 2: a board file's library pictures that do not all come in within the turn's time keep coming in after it; none is dropped
   without a word: when they are all in, the board is drawn again, and any that failed are counted in a notice. */
import {bringIn} from '../src/workspace/bring-in.ts';
test('pictures not in within the time keep coming in after it, and every one that failed is counted', async () => {
  const put: number[] = [];
  const brought = bringIn([1, 2, 3, 4], async n => { await wait(15); if (n === 3) throw new Error('no room'); put.push(n); }, 20, 1_000);
  const now = await brought.now;
  assert.ok(now.waiting > 0, 'the turn is let go of with some still coming');
  assert.equal(now.failed, 0);
  assert.equal(await brought.rest, 1, 'the one that failed is counted');
  assert.deepEqual(put, [1, 2, 4], 'and every other one came in');
  const stuck = bringIn([1], () => new Promise(() => {}), 10, 30);
  assert.deepEqual(await stuck.now, {failed: 0, waiting: 1});
  assert.equal(await stuck.rest, 1, 'one that never ends is counted as failed, not waited for for ever');
  const place = main.slice(main.indexOf('async function placeReadBoard('), main.indexOf('\n}\n', main.indexOf('async function placeReadBoard(')));
  assert.match(place, /const brought=bringIn\(read\.pictures,/);
  assert.match(place, /void brought\.rest\.then\(/, 'what is still coming is not waited for in the turn');
  assert.doesNotMatch(place, /continue;\}/, 'no picture is skipped');
});
