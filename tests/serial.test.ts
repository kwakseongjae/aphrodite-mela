import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serial} from '../src/serial';

test('a second job waits for the first to end, whether it ended well or not', async () => {
  const line = serial(), seen: string[] = [];
  let release!: () => void;
  const first = line(async () => { seen.push('a starts'); await new Promise<void>(r => { release = r; }); seen.push('a ends'); throw new Error('a failed'); });
  const second = line(async () => { seen.push('b starts'); return 'b'; });
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(seen, ['a starts'], 'b has not started while a runs');
  release();
  await assert.rejects(first, /a failed/);
  assert.equal(await second, 'b');
  assert.deepEqual(seen, ['a starts', 'a ends', 'b starts']);
});
