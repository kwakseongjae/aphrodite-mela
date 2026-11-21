import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hopLimit} from '../src/page-hops';

test('twenty-one pages pressed through slowly all show; twenty-one in a moment stop at the twenty-first', () => {
  const slow = hopLimit();
  for (let i = 0; i < 21; i++) assert.equal(slow.allow(i * 600), true, `press ${i + 1}, ${i * 600} ms`);
  const fast = hopLimit();
  for (let i = 0; i < 20; i++) assert.equal(fast.allow(i * 10), true);
  assert.equal(fast.allow(200), false, 'the twenty-first within ten seconds stops');
  assert.equal(fast.allow(10_001), true, 'ten seconds after the first, one goes again');
  fast.reset();
  for (let i = 0; i < 20; i++) assert.equal(fast.allow(10_002 + i), true, 'and the person choosing a page starts the count again');
});
