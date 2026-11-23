import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localLookups} from '../src/local-lookups';

/* 0.3-P3-fix3 #5: a received board's picture shows on its first screen, even while the board left behind is still
   looking up the same picture, and that lookup failing does not mark it missing on the new board. */
test('a lookup still out on the board left behind neither holds back nor answers for the same picture on the board now open', async () => {
  let board = 'A';
  const answers: [string, string, string | undefined][] = [];
  let failA!: () => void;
  const read = (id: string, scope: string) => scope === 'A' ? new Promise<string>((_, no) => { failA = () => no(new Error('not in A')); }) : Promise.resolve(`${scope}:${id}`);
  const look = localLookups(read, () => board, (id, got) => answers.push([board, id, got]));
  const onA = look('x');
  board = 'B';
  await look('x');
  assert.deepEqual(answers, [['B', 'x', 'B:x']], 'the new board looks it up itself, and it shows');
  failA();
  await onA;
  assert.deepEqual(answers, [['B', 'x', 'B:x']], 'and the old board\'s failure marks nothing on it');
});

test('the app looks up image-library pictures only this way, each in the library of the board that asked', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /localLookups\(\(id,scope\)=>invoke<[^>]*>\('image_library_read',\{id,project:scope\}\),\(\)=>project\.id,/);
  assert.doesNotMatch(main, /localPending/, 'no lookup kept by the picture alone');
});
