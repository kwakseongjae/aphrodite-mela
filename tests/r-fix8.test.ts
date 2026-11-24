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
