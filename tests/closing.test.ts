import {test} from 'node:test';
import assert from 'node:assert/strict';
import {windowCloser} from '../src/workspace/closing';

/* 0.3-P3-fix5 #1: closing the window, one request at a time. A close whose save fails leaves the window and says so;
   only a request the person makes once that notice is on the screen closes without saving. */
const setup = () => {
  const seen = {closes: 0, warned: [] as unknown[], destroyed: 0};
  const failing: ((error: unknown) => void)[] = [], showing: (() => void)[] = [];
  const closer = windowCloser(
    async destroy => { seen.closes++; await new Promise<void>((_, reject) => { failing.push(reject); }); await destroy(); },
    error => { seen.warned.push(error); },
    () => new Promise<void>(resolve => { showing.push(resolve); }),
  );
  const destroy = async () => { seen.destroyed++; };
  return {seen, closer, destroy, fail: (error: unknown) => failing.splice(0).forEach(f => f(error)), show: () => showing.splice(0).forEach(s => s())};
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('two closes asked while the save is held are one: its failure warns once and the window stays', async () => {
  const {seen, closer, destroy, fail, show} = setup();
  const first = closer.request(destroy), second = closer.request(destroy);
  await tick();
  fail(new Error('the last write did not land'));
  await tick();
  // Asked between the warning and its being on the screen: part of the close under way, not a new decision.
  const between = closer.request(destroy);
  fail(new Error('the last write did not land'));
  await tick();
  show();
  await Promise.all([first, second, between]);
  assert.deepEqual({closes: seen.closes, warned: seen.warned.length, destroyed: seen.destroyed}, {closes: 1, warned: 1, destroyed: 0});
});

test('a close asked once the warning is on the screen closes without saving', async () => {
  const {seen, closer, destroy, fail, show} = setup();
  const first = closer.request(destroy);
  await tick(); fail(new Error('no')); await tick(); show(); await first;
  await closer.request(destroy);
  assert.deepEqual({closes: seen.closes, destroyed: seen.destroyed}, {closes: 1, destroyed: 1});
});

test('once saves land again, the next close saves first, as before the failure', async () => {
  const {seen, closer, destroy, fail, show} = setup();
  const first = closer.request(destroy);
  await tick(); fail(new Error('no')); await tick(); show(); await first;
  closer.saved();
  void closer.request(destroy);
  await tick();
  assert.deepEqual({closes: seen.closes, destroyed: seen.destroyed}, {closes: 2, destroyed: 0}, 'it asks the save again and does not go unsaved');
});
