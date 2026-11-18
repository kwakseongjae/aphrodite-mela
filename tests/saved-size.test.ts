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
import {begin, end, step, newHistory} from '../src/ledger/session.ts';
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
