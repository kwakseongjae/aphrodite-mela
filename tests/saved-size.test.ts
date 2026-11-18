/**
 * What is saved is the design and its history together, and a project holds at most MAX_PROJECT
 * characters of both. The history never takes more than LEDGER_RESERVE (src/ledger/types.ts), so an
 * agent's batch is held to MAX_PROJECT − LEDGER_RESERVE of design, measured before anything changes —
 * whoever the agent is and however long its reason. A person's edit, undo or redo near that line still
 * saves and opens, and undo and redo still put back what they should.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, parseProject, MAX_PROJECT, type Project} from '../src/model.ts';
import {parseBatch, type Batch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';
import {begin, end, step, stepForScreen, newHistory} from '../src/ledger/session.ts';
import {emptyLedger, designOf, LEDGER_RESERVE, LEDGER_BUDGET} from '../src/ledger/ledger.ts';

const PERSON = {kind: 'person' as const, name: 'you'};
const AGENT = {kind: 'agent' as const, name: 'a'.repeat(100)};
const DESIGN_ROOM = MAX_PROJECT - LEDGER_RESERVE;
const batch = (payload: Record<string, unknown>): Batch => { const parsed = parseBatch(payload); if ('error' in parsed) throw new Error(parsed.error); return parsed.batch; };
const designLength = (p: Project) => JSON.stringify(designOf(p)).length;

/** Nine full html pages and one small one, with a history already at its budget. */
function heavy(): Project {
  const p = initialProject();
  p.pages = [{id: 'free-0', name: 'Page 0', blocks: [], kind: 'html', html: 'a'}, ...Array.from({length: 9}, (_, i) => ({id: `free-${i + 1}`, name: `Page ${i + 1}`, blocks: [], kind: 'html' as const, html: String.fromCharCode(98 + i).repeat(1_980_000)}))];
  p.activePageId = 'free-0';
  p.ledger = emptyLedger();
  const history = newHistory(p);
  for (let i = 0; i < 4; i++) { const before = begin(p, history); p.name = `Heavy ${i} ${'n'.repeat(90)}`; p.pages[0].html = String.fromCharCode(104 + i).repeat(290_000); end(p, before, {author: AGENT, source: 'agent:apply', reason: 'r'.repeat(500)}, history); }
  assert.ok(JSON.stringify(p.ledger).length > LEDGER_BUDGET * 0.9, 'the history is close to its budget');
  return p;
}
/** html for page 0 that makes the design exactly `length` characters. */
const filling = (p: Project, length: number) => 'f'.repeat(p.pages[0].html!.length + length - designLength(p));

test('an agent\'s batch that leaves the design at MAX_PROJECT − LEDGER_RESERVE lands, and saves within the cap whoever records it', () => {
  const p = heavy();
  const result = runBatch(p, batch({reason: 'r', ops: [{op: 'html_set', page_id: 'free-0', html: filling(p, DESIGN_ROOM)}]}), '');
  assert.ok(result.ok, result.ok ? '' : result.error);
  if (!result.ok) return;
  assert.equal(designLength(result.project), DESIGN_ROOM);
  const history = newHistory(p), before = begin(p, history);
  const landed = {...result.project, ledger: p.ledger};
  end(landed, before, {author: AGENT, source: 'agent:apply', reason: '"\u0001'.repeat(166)}, history);
  const saved = JSON.stringify(landed);
  assert.ok(saved.length <= MAX_PROJECT, `${saved.length} characters saved`);
  assert.doesNotThrow(() => parseProject(saved));
});

test('one character more of design is refused, nothing changes, and the refusal says what the agent can do', () => {
  const p = heavy(), frozen = JSON.stringify(p);
  for (const reason of ['r', 'r'.repeat(500)]) {
    const result = runBatch(p, batch({reason, ops: [{op: 'html_set', page_id: 'free-0', html: filling(p, DESIGN_ROOM + 1)}]}), '');
    assert.ok(!result.ok, 'refused');
    if (result.ok) continue;
    assert.match(result.error, /smaller|split/i);
    assert.equal(JSON.stringify(p), frozen);
  }
});

test('a person\'s rename, undo, redo and an edit made outside commit at the line all save within the cap, and undo and redo put back what they should', () => {
  const p = heavy();
  p.pages[0].html = filling(p, DESIGN_ROOM - 40);
  const history = newHistory(p);
  const original = p.pages[0].html, saves = (label: string, q: Project) => {
    const saved = JSON.stringify(q);
    assert.ok(saved.length <= MAX_PROJECT, `${label}: ${saved.length} characters saved`);
    assert.doesNotThrow(() => parseProject(saved), label);
  };
  let before = begin(p, history);
  p.pages[0].name = 'Page zero, renamed';
  p.pages[0].html = 'g'.repeat(original.length);
  end(p, before, {author: PERSON, source: 'editor:change'}, history);
  saves('rename', p);
  const edited = p.pages[0].html;
  let cur = step(p, 'undo', history, PERSON)!.project;
  assert.equal(cur.pages[0].html, original, 'undo puts back the html it took');
  saves('undo', cur);
  cur = step(cur, 'redo', history, PERSON)!.project;
  assert.equal(cur.pages[0].html, edited, 'redo puts the edit back');
  saves('redo', cur);
  cur.name = 'Changed outside commit';
  before = begin(cur, history);
  saves('reconcile', cur);
  assert.equal(cur.ledger!.changes.at(-1)!.source, 'untracked');
});

/* Codex 3rd review: with the design between MAX_PROJECT − LEDGER_RESERVE and the cap, even one header did
   not fit beside it. Then the history gives way entirely — the design comes before the record of it. */
test('a design just under the cap still saves after a person\'s edit, undo, redo and an edit outside commit: the history empties if it must', async () => {
  const {upsertProject} = await import('../src/workspace/library.ts');
  const p = initialProject();
  p.pages = Array.from({length: 10}, (_, i) => ({id: `free-${i}`, name: `Page ${i}`, blocks: [], kind: 'html' as const, html: 'a'}));
  p.activePageId = 'free-0';
  const frame = ',"ledger":{"seq":99,"changes":[]}'.length;
  let room = MAX_PROJECT - frame - designLength(p);
  for (const page of p.pages) { const add = Math.min(room, 1_999_999); page.html += String.fromCharCode(98 + Number(page.id.slice(5))).repeat(add); room -= add; }
  assert.equal(designLength(p), MAX_PROJECT - frame);
  p.ledger = emptyLedger();
  const history = newHistory(p), empty = {version: 1 as const, entries: []};
  const saves = (label: string, q: Project) => {
    const stored = upsertProject(empty, q).entries[0].project;
    const raw = JSON.stringify(stored);
    assert.ok(raw.length <= MAX_PROJECT, `${label}: ${raw.length} characters saved`);
    assert.doesNotThrow(() => parseProject(raw), label);
    assert.deepEqual(stored.ledger, q.ledger, `${label}: what is in memory is what was saved`);
  };
  const before = begin(p, history);
  p.pages[3].name = 'Page X';
  end(p, before, {author: PERSON, source: 'editor:change'}, history);
  saves('rename', p);
  assert.equal(p.pages[3].name, 'Page X', 'the design is kept');
  let cur = step(p, 'undo', history, PERSON)!.project;
  assert.equal(cur.pages[3].name, 'Page 3');
  saves('undo', cur);
  cur = step(cur, 'redo', history, PERSON)!.project;
  assert.equal(cur.pages[3].name, 'Page X');
  saves('redo', cur);
  cur.pages[4].name = 'Page Y';
  begin(cur, history);
  saves('reconcile', cur);
  const next = begin(cur, history);
  cur.pages[5].name = 'Page Z';
  const change = end(cur, next, {author: PERSON, source: 'editor:change'}, history)!;
  assert.equal(change.parent, undefined, 'after the history emptied, the next change starts on nothing recorded');
  assert.ok(change.seq > 3, 'the sequence carries on');
  saves('after', cur);
});

/* Codex 4th review: the screen parsed the whole project — design and history — right after the step and
   before the save, so the header an undo appends pushed a design just under the cap over it there, and
   the step was left half done: stacks and ledger moved, the screen did not. The screen's order is
   stepForScreen, then the save. */
test('undo and redo the way the screen takes them, at a design just under the cap: they land, save and open', async () => {
  const {upsertProject} = await import('../src/workspace/library.ts');
  const p = initialProject();
  p.pages = Array.from({length: 10}, (_, i) => ({id: `free-${i}`, name: `Page ${i}`, blocks: [], kind: 'html' as const, html: 'a'}));
  p.activePageId = 'free-0';
  let room = 19_999_900 - designLength(p);
  for (const page of p.pages) { const add = Math.min(room, 1_999_999); page.html += String.fromCharCode(98 + Number(page.id.slice(5))).repeat(add); room -= add; }
  assert.equal(designLength(p), 19_999_900);
  p.ledger = emptyLedger();
  const history = newHistory(p), empty = {version: 1 as const, entries: []};
  const before = begin(p, history);
  p.pages[3].name = 'Page X';
  end(p, before, {author: PERSON, source: 'editor:change'}, history);
  upsertProject(empty, p);
  let shown: Project = p;
  for (const [direction, name] of [['undo', 'Page 3'], ['redo', 'Page X'], ['undo', 'Page 3']] as const) {
    const done = stepForScreen(shown, direction, history, PERSON)!;
    assert.ok(done, direction);
    shown = done.project;
    assert.equal(shown.pages[3].name, name, direction);
    const stored = upsertProject(empty, shown).entries[0].project;
    assert.ok(JSON.stringify(stored).length <= MAX_PROJECT, direction);
    assert.deepEqual(stored.ledger, shown.ledger, `${direction}: what is shown is what was saved`);
  }
});

test('a step whose design could not be saved moves nothing: not the stacks, the history, the ledger or the screen', () => {
  const p = initialProject();
  p.pages = Array.from({length: 11}, (_, i) => ({id: `free-${i}`, name: `Page ${i}`, blocks: [], kind: 'html' as const, html: String.fromCharCode(97 + i).repeat(1_900_000)}));
  p.activePageId = 'free-0';
  assert.ok(designLength(p) > MAX_PROJECT, 'a design past the cap, as one made before html pages could be');
  p.ledger = emptyLedger();
  const history = newHistory(p);
  const before = begin(p, history);
  p.pages.pop();
  end(p, before, {author: PERSON, source: 'editor:change'}, history);
  const frozen = {undo: history.undo.length, redo: history.redo.length, ledger: JSON.stringify(p.ledger), last: JSON.stringify(history.last), shown: JSON.stringify(p)};
  assert.throws(() => stepForScreen(p, 'undo', history, PERSON), /20MB|too big|cap/i);
  assert.deepEqual({undo: history.undo.length, redo: history.redo.length, ledger: JSON.stringify(p.ledger), last: JSON.stringify(history.last), shown: JSON.stringify(p)}, frozen);
});

test('nothing on the screen parses the whole project, history included, before the save has fitted it', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /parseProject\(JSON\.stringify\(done\.project\)\)/, 'undo and redo');
  assert.doesNotMatch(main, /parseProject\(JSON\.stringify\(\{\.\.\.project,/, 'a design system an agent sends');
});
