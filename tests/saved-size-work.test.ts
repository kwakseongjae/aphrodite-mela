/**
 * Keeping a project within its cap is measured where the project is serialized anyway: the save. A save
 * under the cap serializes the project once, as it always has; one over it lets the history give way in
 * place — in memory, so the next save does not meet the same history — and serializes again. Nothing
 * is assumed about how much one edit can add.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, parseProject, makeBlock, MAX_PROJECT, type Project} from '../src/model.ts';
import {emptyLedger, designOf, LEDGER_RESERVE} from '../src/ledger/ledger.ts';
import {begin, end, step, newHistory} from '../src/ledger/session.ts';
import {upsertProject} from '../src/workspace/library.ts';

const PERSON = {kind: 'person' as const, name: 'you'};
const AGENT = {kind: 'agent' as const, name: 'claude-code'};
const empty = {version: 1 as const, entries: []};

/** How many times JSON.stringify serializes `target` while `fn` runs. */
function serializationsOf(target: unknown, fn: () => void): number {
  const original = JSON.stringify;
  let calls = 0;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => { if (args[0] === target) calls++; return original(...args); }) as typeof JSON.stringify;
  try { fn(); } finally { JSON.stringify = original; }
  return calls;
}

test('a save under the cap serializes the project once', () => {
  const p = initialProject();
  p.ledger = emptyLedger();
  assert.equal(serializationsOf(p, () => upsertProject(empty, p)), 1);
});

/* Codex 3rd review: a picture uploaded near the cap adds about 2.67 million characters, more than the
   shortcut assumed one edit could, and the project stopped saving although its history could give way. */
test('a big picture uploaded near the cap saves: the history gives way in memory and in the save alike, and the picture stays', () => {
  const p = initialProject();
  p.pages = [p.pages[0], {id: 'notes', name: 'Notes', blocks: [], kind: 'html', html: 'n'}, ...Array.from({length: 9}, (_, i) => ({id: `free-${i}`, name: `Page ${i}`, blocks: [], kind: 'html' as const, html: String.fromCharCode(98 + i).repeat(1_846_000)}))];
  p.ledger = emptyLedger();
  const history = newHistory(p);
  for (let i = 0; i < 4; i++) { const before = begin(p, history); p.pages[1].html = String.fromCharCode(104 + i).repeat(290_000); end(p, before, {author: AGENT, source: 'agent:apply', reason: 'r'}, history); }
  const saved = JSON.stringify(p).length;
  assert.ok(saved > 17_000_000 && saved < MAX_PROJECT, `${saved} characters before the upload`);
  const hero = p.pages[0].blocks.find(b => b.kind === 'hero')!;
  const picture = 'data:image/png;base64,' + 'A'.repeat(2_666_664 - 22);
  const before = begin(p, history);
  hero.image = picture;
  end(p, before, {author: PERSON, source: 'editor:change'}, history);
  const design = JSON.stringify(designOf(p)).length;
  assert.ok(design > MAX_PROJECT - LEDGER_RESERVE && design + JSON.stringify(p.ledger).length > MAX_PROJECT, `a ${design}-character design whose history no longer fits beside it`);
  const library = upsertProject(empty, p);
  const stored = library.entries[0].project;
  assert.ok(JSON.stringify(stored).length <= MAX_PROJECT);
  assert.equal(stored.pages[0].blocks.find(b => b.kind === 'hero')!.image, picture, 'the design is what was uploaded');
  assert.deepEqual(stored.ledger, p.ledger, 'what is in memory is what was saved');
  assert.doesNotThrow(() => parseProject(JSON.stringify(stored)));
  let cur = step(p, 'undo', history, PERSON)!.project;
  assert.notEqual(cur.pages[0].blocks.find(b => b.kind === 'hero')!.image, picture, 'undo takes the picture back');
  assert.doesNotThrow(() => upsertProject(empty, cur));
  cur = step(cur, 'redo', history, PERSON)!.project;
  assert.doesNotThrow(() => upsertProject(empty, cur));
  cur.pages[0].blocks.push(makeBlock('cta'));
  begin(cur, history);
  assert.doesNotThrow(() => upsertProject(empty, cur), 'an edit made outside commit saves too');
});
