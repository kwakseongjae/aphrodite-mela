/**
 * 0.3-P1-fix1: what is saved is the design and its history together, and a project holds at most
 * 20,000,000 characters of both. An agent's batch that would save past that is refused before anything
 * changes. A person's edit, undo or redo never loses the design for it: the history gives way first.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, parseProject, MAX_PROJECT, type Project} from '../src/model.ts';
import {parseBatch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';
import {begin, end, step, newHistory} from '../src/ledger/session.ts';
import {emptyLedger} from '../src/ledger/ledger.ts';
import {librarySizeWith, upsertProject, type Library} from '../src/workspace/library.ts';

const PERSON = {kind: 'person' as const, name: 'you'};
/** The review's case: ten html pages of 1,980,000 characters, a hair under what a project holds. */
function nearlyFull(): Project {
  const p = initialProject();
  p.pages = Array.from({length: 10}, (_, i) => ({id: `free-${i}`, name: `Page ${i}`, blocks: [], kind: 'html' as const, html: String.fromCharCode(97 + i).repeat(1_980_000)}));
  p.activePageId = 'free-0';
  p.ledger = emptyLedger();
  return p;
}
const rewritten = (html: string) => 'z'.repeat(400_000) + html.slice(400_000);

test('an agent\'s batch whose saved project would pass 20,000,000 characters with its history is refused, and nothing changes', () => {
  const p = nearlyFull(), frozen = JSON.stringify(p);
  assert.ok(frozen.length < MAX_PROJECT);
  const parsed = parseBatch({reason: 'Rewrite the opening.', patch: [{op: 'set', on: 'page', page_id: 'free-0', field: 'html', value: rewritten(p.pages[0].html!)}]});
  assert.ok('batch' in parsed);
  if (!('batch' in parsed)) return;
  const result = runBatch(p, parsed.batch, '');
  assert.ok(!result.ok, 'refused');
  if (result.ok) return;
  assert.match(result.error, /20,000,000/);
  assert.match(result.error, /smaller|split/i, 'it says what the agent can do');
  assert.equal(JSON.stringify(p), frozen);
});

test('a person\'s edit, undo and redo near the cap keep the design whole and the project openable: the history gives way', () => {
  const p = nearlyFull(), history = newHistory(p);
  const before = begin(p, history);
  p.pages[0].html = rewritten(p.pages[0].html!);
  const edited = p.pages[0].html;
  assert.ok(end(p, before, {author: PERSON, source: 'editor:change'}, history));
  const saved = JSON.stringify(p);
  assert.ok(saved.length <= MAX_PROJECT, `${saved.length} characters saved`);
  assert.equal(parseProject(saved).pages[0].html, edited, 'the design is what was typed');
  let cur: Project = p;
  for (const direction of ['undo', 'redo'] as const) {
    cur = step(cur, direction, history, PERSON)!.project;
    const again = JSON.stringify(cur);
    assert.ok(again.length <= MAX_PROJECT, `${direction}: ${again.length} characters saved`);
    assert.doesNotThrow(() => parseProject(again), direction);
  }
  assert.equal(cur.pages[0].html, edited);
});

test('the size a library would be with a project in it is the size it is saved at', () => {
  const a = initialProject(), b = nearlyFull();
  const library: Library = upsertProject({version: 1, entries: []}, a);
  for (const [lib, project] of [[library, b], [library, a], [upsertProject(library, b), {...b, name: 'Renamed'}]] as const) {
    assert.equal(librarySizeWith(lib, project), JSON.stringify(upsertProject(lib, project, lib.entries.find(e => e.project.id === project.id)?.updatedAt)).length);
  }
});
