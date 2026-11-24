import {test} from 'node:test';
import assert from 'node:assert/strict';
import {windowCloser, type CloseAnswer} from '../src/workspace/closing';

/* 0.3-P3-fix5 #1, 0.3-R ⑤: closing the window, one request at a time. A close whose save fails, or does not finish in
   time, leaves the window and asks, in the system's own dialog: keep the board as a file and close, close without
   saving, or stay. Codex's five cases (P3 check6) are each here: nothing closes unsaved but the person's answer. */
const setup = ({limit = 1_000, answers = [] as CloseAnswer[], kept = [] as boolean[]} = {}) => {
  const seen = {closes: 0, asked: [] as unknown[], destroyed: 0, keeps: 0};
  const saving: {resolve: () => void; reject: (error: unknown) => void}[] = [];
  const closer = windowCloser(
    async destroy => { seen.closes++; await new Promise<void>((resolve, reject) => { saving.push({resolve, reject}); }); await destroy(); },
    async error => { seen.asked.push(error); return answers.shift() ?? 'cancel'; },
    async () => { seen.keeps++; return kept.shift() ?? false; },
    limit,
  );
  const destroy = async () => { seen.destroyed++; };
  return {seen, closer, destroy, fail: (error: unknown) => saving.splice(0).forEach(s => s.reject(error)), land: () => saving.splice(0).forEach(s => s.resolve())};
};
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

test('a close whose save lands closes, once, however many times it was asked', async () => {
  const {seen, closer, destroy, land} = setup();
  const a = closer.request(destroy), b = closer.request(destroy);
  await tick(); land(); await Promise.all([a, b]);
  assert.deepEqual({closes: seen.closes, asked: seen.asked.length, destroyed: seen.destroyed}, {closes: 1, asked: 0, destroyed: 1});
});

test('Codex 1: a failed save closes nothing until the person answers, however often close is asked meanwhile', async () => {
  const {seen, closer, destroy, fail} = setup({answers: ['cancel']});
  const first = closer.request(destroy);
  await tick(); fail(new Error('the last write did not land'));
  for (let i = 0; i < 5; i++) void closer.request(destroy);
  await first;
  assert.deepEqual({closes: seen.closes, asked: seen.asked.length, destroyed: seen.destroyed}, {closes: 1, asked: 1, destroyed: 0}, 'one close, one question, the window stays');
});

test('the answers: close without saving closes; keep as a file saves the file and closes; a file not saved asks again', async () => {
  const discard = setup({answers: ['discard']});
  const a = discard.closer.request(discard.destroy); await tick(); discard.fail(new Error('no')); await a;
  assert.equal(discard.seen.destroyed, 1);
  const keep = setup({answers: ['save-file', 'save-file', 'cancel'], kept: [false, true]});
  const b = keep.closer.request(keep.destroy); await tick(); keep.fail(new Error('no')); await b;
  assert.deepEqual({keeps: keep.seen.keeps, asked: keep.seen.asked.length, destroyed: keep.seen.destroyed}, {keeps: 2, asked: 2, destroyed: 1}, 'the file the person cancelled is asked about again, and the one kept closes');
});

test('Codex 2 and 3: after a failed close the person stayed for, the next close saves first, as before (no warning is left armed)', async () => {
  const {seen, closer, destroy, fail, land} = setup({answers: ['cancel']});
  const first = closer.request(destroy); await tick(); fail(new Error('no')); await first;
  const second = closer.request(destroy);
  await tick();
  assert.equal(seen.destroyed, 0, 'the next close waits for its own save');
  land(); await second;
  assert.deepEqual({closes: seen.closes, destroyed: seen.destroyed}, {closes: 2, destroyed: 1});
});

test('Codex 4: a save that never finishes is asked about in bounded time, and a save that finishes after that closes nothing on its own', async () => {
  const {seen, closer, destroy, land} = setup({limit: 50, answers: ['cancel']});
  await closer.request(destroy);
  assert.equal(seen.asked.length, 1, 'asked once the time was up');
  assert.match(String(seen.asked[0]), /did not finish/);
  land(); await tick(10);
  assert.equal(seen.destroyed, 0, 'the person said stay, and the late save does not overrule them');
  const again = setup({limit: 50, answers: ['discard']});
  await again.closer.request(again.destroy);
  assert.equal(again.seen.destroyed, 1, 'and close without saving closes');
});

test('Codex 5: a destroy that is refused leaves the closer free, and the next close asks again rather than going on its own', async () => {
  let refuse = true, destroyed = 0;
  const destroy = async () => { if (refuse) { refuse = false; throw new Error('destroy refused'); } destroyed++; };
  const answers: CloseAnswer[] = ['cancel'];
  const asked: unknown[] = [];
  const closer = windowCloser(async d => { await d(); }, async error => { asked.push(error); return answers.shift() ?? 'cancel'; }, async () => false, 1_000);
  await closer.request(destroy);
  assert.equal(closer.busy(), false);
  assert.match(String(asked[0]), /destroy refused/, 'the refused destroy is said, and the person decides');
  assert.equal(destroyed, 0);
  await closer.request(destroy);
  assert.equal(destroyed, 1, 'the next close goes the ordinary way');
});

test('the desktop handler prevents every close it does not let through, and lets go of its flag when destroy is refused', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /await closer\.request\(async\(\)=>\{closing=true;try\{await getCurrentWindow\(\)\.destroy\(\);\}catch\(error\)\{closing=false;throw error;\}\}\);/);
});

/* 0.3-R fix 2 #15: a file that could not be kept is asked about again, inside the same question. */
test('keeping a file that fails is asked about again, not an error out of the close', async () => {
  const answers: CloseAnswer[] = ['save-file', 'cancel'];
  const asked: unknown[] = [];
  let destroyed = 0;
  const closer = windowCloser(async () => { throw new Error('the last write did not land'); }, async error => { asked.push(error); return answers.shift() ?? 'cancel'; }, async () => { throw new Error('the disk said no'); }, 1_000);
  await closer.request(async () => { destroyed++; });
  assert.equal(asked.length, 2);
  assert.match(String(asked[1]), /the disk said no/);
  assert.equal(destroyed, 0);
});
test('the close waits for the save a bounded time inside its own turn, so Stay leaves an editor that takes input', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const at = main.indexOf('function closeWindow(');
  const body = main.slice(at, main.indexOf('\n', at));
  assert.match(body, /return turn\(async\(\)=>\{/, 'its own turn');
  for (const wait of ['flushDisk()', 'heldWrites']) assert.ok(body.includes(`within(${wait},SAVE_LIMIT)`), `${wait}, bounded`);
  assert.doesNotMatch(body, /await flushDisk\(\)|await heldWrites/, 'nothing waited for without a bound');
});
