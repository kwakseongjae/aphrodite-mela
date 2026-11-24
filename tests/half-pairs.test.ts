/**
 * 0.3-R ③: half of a surrogate pair on its own never reaches the library.
 *
 * The desktop's save reads the library as serde_json::Value, which refuses the escape such a half becomes, and a failed
 * write holds up every write after it (src-tauri/src/workspace.rs, its test). P3 closed the html page, the board file and
 * the project file. What is left: an agent's other text is refused on its value where its command comes in; whatever
 * else makes one (the person's typing, a name or a reason cut to length) is mended where a change is recorded, before it
 * is saved, so the screen, the ledger and the disk hold the same text; and the save refuses a library that still holds one.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as text from '../src/text.ts';
import {initialProject, type Project} from '../src/model.ts';
import {begin, end, newHistory, step, changeAside} from '../src/ledger/session.ts';
import {record, emptyLedger, type Author} from '../src/ledger/ledger.ts';
import * as library from '../src/workspace/library.ts';
import {halfPair} from '../src/free-page.ts';

const me: Author = {kind: 'person', name: 'you'};
const t = text as unknown as Record<string, unknown>;
const fn = <T>(name: string): T => { assert.equal(typeof t[name], 'function', `text.ts exports ${name}`); return t[name] as T; };
const whole = (v: unknown) => !JSON.stringify(v).match(/(^|[^\\])(\\\\)*\\ud[89a-f][0-9a-f]{2}/i);
const emoji = '\u{1F600}';

test('a cut to length never ends on half a pair', () => {
  const clip = fn<(s: string, n: number) => string>('clip');
  assert.equal(clip(`a${emoji}`, 2), 'a');
  assert.equal(clip(`a${emoji}`, 3), `a${emoji}`);
  assert.equal(clip('abc', 2), 'ab');
});

test('mending puts U+FFFD where a half stood alone, and leaves whole characters', () => {
  const mend = fn<(v: unknown) => number>('mendHalfPairs');
  const value = {a: 'x\ud800y', b: [`${emoji}\udc00`], c: {d: 'fine'}};
  assert.equal(mend(value), 2);
  assert.deepEqual(value, {a: 'x\uFFFDy', b: [`${emoji}\uFFFD`], c: {d: 'fine'}});
});

test('the person\'s typing that holds a half is mended where the change is recorded, screen and ledger alike', () => {
  const p = initialProject(), h = newHistory(p);
  const before = begin(p, h);
  p.pages[0].blocks[1].title = 'Typed \ud83d';
  const c = end(p, before, {author: me, source: 'editor:change'}, h)!;
  assert.equal(halfPair(p.pages[0].blocks[1].title), -1, 'the board holds no half');
  assert.ok(whole(c), 'nor does the change recorded');
  assert.ok(whole(p), 'and the board as it will be saved');
});

test('a step and a change aside from the editor are mended the same way', () => {
  const p = initialProject(), h = newHistory(p);
  p.brief = 'Drift \udc00';
  const undone = step(p, 'undo', h, me);
  assert.equal(undone, null, 'nothing to step');
  assert.ok(whole(p), 'the drift recorded before a step is mended');
  const q = initialProject();
  changeAside(q, x => { x.name = `${'n'.repeat(99)}${emoji}`.slice(0, 100); }, {author: me, source: 'home:rename'});
  assert.ok(whole(q));
  assert.equal(q.name, `${'n'.repeat(99)}\uFFFD`, 'the half the cut left is mended, in the board');
  const renamed = q.ledger!.changes.at(-1)!;
  assert.equal(renamed.source, 'home:rename');
  assert.deepEqual(renamed.ops.find(op => op.op === 'set' && op.field === 'name'), {op: 'set', on: 'project', field: 'name', value: q.name}, 'and in the change recorded');
});

test('a reason, a name and a source cut to length in the ledger never split a pair', () => {
  const ledger = emptyLedger();
  const a = initialProject(), b = {...initialProject(), id: a.id, brief: 'Changed'} as Project;
  const c = record(ledger, a, b, {author: {kind: 'agent', name: `${'n'.repeat(99)}${emoji}`}, source: `agent:${'s'.repeat(73)}${emoji}`, reason: `${'r'.repeat(499)}${emoji}`})!.change;
  assert.ok(whole(c), JSON.stringify([c.author.name.slice(-3), c.source.slice(-3), c.reason?.slice(-3)]));
});

test('a copy of a board whose name is long ends its name on a whole character', () => {
  const p = initialProject(); p.name = `${'n'.repeat(99)}${emoji}`;
  assert.ok(whole(library.cloneProject(p).name));
});

test('the save refuses a library that still holds a half, before anything is written', () => {
  const save = (library as unknown as Record<string, unknown>).libraryText as ((l: unknown) => string) | undefined;
  assert.equal(typeof save, 'function', 'library.ts exports libraryText');
  const p = initialProject(); p.brief = 'x\ud800';
  assert.throws(() => save!({version: 1, entries: [{project: p}]}), /half of a surrogate pair/);
  const fine = initialProject(); fine.brief = `${emoji} and a literal \\ud800 typed as text`;
  assert.doesNotThrow(() => save!({version: 1, entries: [{project: fine}]}));
});
