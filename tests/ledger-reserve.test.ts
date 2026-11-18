/**
 * 0.3-P1-fix2: the saved ledger never takes more than LEDGER_RESERVE characters of a saved project,
 * whatever was recorded, so what a project may hold of design is the cap less that reserve — known
 * before a change is made, without recording it first.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, makeBlock, type Project} from '../src/model.ts';
import {begin, end, step, newHistory} from '../src/ledger/session.ts';
import {emptyLedger, compact, LEDGER_BUDGET, LEDGER_RESERVE, readLedger} from '../src/ledger/ledger.ts';

const PERSON = {kind: 'person' as const, name: 'you'};
const AGENT = {kind: 'agent' as const, name: 'a'.repeat(100)};
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** What the ledger adds to a saved project: its key and the ledger itself. */
const share = (p: Project) => JSON.stringify(p).length - JSON.stringify({...p, ledger: undefined}).length;

test('the reserve is the budget and the key that carries the ledger, and a ledger that fits its budget fits the reserve', () => {
  assert.equal(LEDGER_RESERVE, LEDGER_BUDGET + ',"ledger":'.length);
});

test('after any recording, on random histories of every size of change, the saved ledger is within the reserve', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const r = rng(seed);
    const p = initialProject(), history = newHistory(p);
    p.pages.push({id: 'free-1', name: 'Briefing', blocks: [], kind: 'html', html: '<p>start</p>'});
    p.ledger = emptyLedger();
    let cur: Project = p;
    for (let i = 0; i < 40; i++) {
      const roll = r();
      if (roll < 0.15 && history.undo.length) { cur = step(cur, 'undo', history, PERSON)!.project; }
      else {
        const before = begin(cur, history);
        if (roll < 0.5) cur.pages[1].html = 'x'.repeat(Math.floor(r() * 900_000)) + i;
        else if (roll < 0.8) cur.pages[0].blocks.push(makeBlock('cta'));
        else cur.name = `Name ${i} ${'"\\\u0001'.repeat(Math.floor(r() * 50))}`;
        end(cur, before, {author: r() < 0.5 ? PERSON : AGENT, source: 'agent:apply', reason: '"\u0001'.repeat(Math.floor(r() * 166))}, history);
      }
      assert.ok(share(cur) <= LEDGER_RESERVE, `seed ${seed}, step ${i}: ${share(cur)} characters`);
      assert.ok(JSON.stringify(cur.ledger).length <= LEDGER_BUDGET);
    }
  }
});

test('the newest header alone always fits: a change touching every component there could be is anchored to at most 500 of them', () => {
  const p = initialProject(), history = newHistory(p);
  p.ledger = emptyLedger();
  const id = (k: number) => `${String(k).padStart(6, '0')}${'n'.repeat(194)}`;
  p.pages = Array.from({length: 30}, (_, i) => ({id: `p${i}`.padEnd(200, 'p'), name: 'P', blocks: Array.from({length: 100}, (_, k) => ({...makeBlock('cta'), id: id(i * 100 + k)}))}));
  p.activePageId = p.pages[0].id;
  const before = begin(p, history);
  p.pages = p.pages.map((page, i) => ({...page, id: `q${i}`.padEnd(200, 'q'), blocks: page.blocks.map((b, k) => ({...b, id: id(5000 + i * 100 + k)}))}));
  p.activePageId = p.pages[0].id;
  const change = end(p, before, {author: AGENT, source: 'agent:apply', reason: 'x'}, history)!;
  assert.ok(change.anchors.nodes.length <= 500 && change.anchors.pages.length <= 60, `${change.anchors.nodes.length} nodes`);
  const alone = JSON.stringify({...change, ops: [], compacted: true}).length;
  assert.ok(alone < LEDGER_BUDGET / 4, `${alone} characters for one header`);
  compact(p.ledger!, alone + 30);
  assert.deepEqual(p.ledger!.changes.map(c => c.id), [change.id], 'with room for one header, the newest is kept');
  compact(p.ledger!, 0);
  assert.deepEqual([p.ledger!.changes.length, p.ledger!.seq], [0, change.seq], 'with no room even for one, the history empties and keeps its count');
});

test('a change anchored to fewer components than it touched says so', () => {
  const p = initialProject(), history = newHistory(p);
  p.ledger = emptyLedger();
  let before = begin(p, history);
  p.pages[0].blocks.push(...Array.from({length: 600}, () => makeBlock('cta')));
  const many = end(p, before, {author: PERSON, source: 'editor:change'}, history)!;
  assert.deepEqual([many.anchors.nodes.length, many.anchors.truncated], [500, true]);
  before = begin(p, history);
  p.pages[0].blocks[0].title = 'One';
  const one = end(p, before, {author: PERSON, source: 'editor:change'}, history)!;
  assert.equal('truncated' in one.anchors, false, 'a change anchored to everything it touched says nothing more');
});

test('compact counts what the ledger serializes to, brackets and commas included', () => {
  const p = initialProject(), history = newHistory(p);
  p.ledger = emptyLedger();
  for (let i = 0; i < 300; i++) { const before = begin(p, history); p.name = `N${i}`; end(p, before, {author: PERSON, source: 'editor:change'}, history); }
  for (const budget of [100_000, 20_000, 1_000]) {
    compact(p.ledger!, budget);
    assert.ok(JSON.stringify(p.ledger).length <= budget, `${JSON.stringify(p.ledger).length} > ${budget}`);
  }
  const read = readLedger(JSON.parse(JSON.stringify(p.ledger)))!;
  assert.ok(JSON.stringify(read).length <= LEDGER_BUDGET);
});
