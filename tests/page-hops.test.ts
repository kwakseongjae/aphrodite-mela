import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hopLimit} from '../src/page-hops';

test('twenty-one pages pressed through slowly all show; twenty-one in a moment stop at the twenty-first', () => {
  const slow = hopLimit();
  for (let i = 0; i < 21; i++) assert.equal(slow.allow(i * 600), true, `press ${i + 1}, ${i * 600} ms`);
  const fast = hopLimit();
  for (let i = 0; i < 20; i++) assert.equal(fast.allow(i * 10), true);
  assert.equal(fast.allow(200), false, 'the twenty-first within ten seconds stops');
  fast.reset();
  for (let i = 0; i < 20; i++) assert.equal(fast.allow(10_002 + i), true, 'and the person choosing a page starts the count again');
});

/* 0.3-P3-fix3 #4: stopped is stopped until the person chooses; time going by does not start it again. */
test('once stopped, a page that asks again after ten seconds and more still shows nothing until a page is chosen', () => {
  const hops = hopLimit();
  for (let i = 0; i < 20; i++) assert.equal(hops.allow(i * 10), true);
  assert.equal(hops.allow(200), false, 'the twenty-first stops');
  assert.equal(hops.allow(10_500), false, 'ten seconds on, still stopped');
  assert.equal(hops.allow(60_000), false, 'a minute on, still stopped');
  hops.reset();
  assert.equal(hops.allow(60_001), true, 'chosen anew, it goes');
});
