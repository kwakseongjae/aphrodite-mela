/**
 * 0.3-P1: a free page's html is recorded as a text diff — the passages that changed, found line by line
 * and trimmed to the character — rather than the whole document each time. The saved copy keeps the
 * length and a short hash of what was taken out instead of the text itself; undo keeps the text.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, type Project} from '../src/model.ts';
import {applyPatch, diffProject, textHunks, applyText, PatchError, type PatchOp} from '../src/ledger/patch.ts';
import {forSaving, shortHash, readLedger, LEDGER_BUDGET} from '../src/ledger/types.ts';
import {begin, end, step, newHistory} from '../src/ledger/session.ts';
import {emptyLedger, UNDO_LIMIT} from '../src/ledger/ledger.ts';
import {parseBatch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';

const PERSON = {kind: 'person' as const, name: 'you'};
const AGENT = {kind: 'agent' as const, name: 'claude-code'};
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** About 47,000 characters: thirty paragraphs and a script, the size the spike measured. */
function bigPage(seed = 0): string {
  const para = (k: number) => `<p id="p${k}">${Array.from({length: 290}, (_, i) => ['quiet', 'ledger', 'frame', 'board', 'light', 'paper', 'stone'][(i * 7 + k + seed) % 7]).join(' ')}</p>`;
  return `<!doctype html>\n<html><head><style>body{font:16px/1.5 serif}</style></head>\n<body>\n<h1>Report ${seed}</h1>\n${Array.from({length: 30}, (_, k) => para(k)).join('\n')}\n<script>document.title='r';</script>\n</body></html>`;
}
function editParagraph(html: string, k: number, stamp: string): string {
  return html.replace(new RegExp(`(<p id="p${k}">)([^<]*)(</p>)`), (_m, a: string, body: string, c: string) => `${a}${body.slice(0, 120)} (edited ${stamp}) ${body.slice(120, 300).split(' ').reverse().join(' ')}${body.slice(300)}${c}`);
}
function freeProject(html: string): Project {
  const p = initialProject();
  p.pages.push({id: 'free-1', name: 'Briefing', blocks: [], kind: 'html', html});
  p.ledger = emptyLedger();
  return p;
}

const SEEDS = ['', 'one line', '<div>\n<p>a</p>\n<p>a</p>\n<p>a</p>\n</div>\n', '<main><section><h1>Min</h1><p>fied</p><p>fied</p></section></main>', 'line one\r\nline two\r\nline two\r\n', 'emoji 😀 and 한글 and 😁😂\n'];
const PIECES = ['x', '\n', '>', '<p>', '</p>\n', '😀', '😁', '한', '\r\n', '<li>item</li>', 'same\n', ''];
/** One random edit of a string: a replace, an insert, a delete, two far apart, a swapped emoji, a repeated line. */
function mutate(s: string, r: () => number): string {
  const at = () => { let i = Math.floor(r() * (s.length + 1)); if (i > 0 && i < s.length && /[\uDC00-\uDFFF]/.test(s[i])) i--; return i; };
  const piece = () => Array.from({length: 1 + Math.floor(r() * 4)}, () => PIECES[Math.floor(r() * PIECES.length)]).join('');
  const roll = r();
  if (roll < 0.25) { const a = at(), b = Math.max(a, at()); return s.slice(0, a) + piece() + s.slice(b); }
  if (roll < 0.45) { const a = at(); return s.slice(0, a) + piece() + s.slice(a); }
  if (roll < 0.6) { const a = at(), b = Math.max(a, at()); return s.slice(0, a) + s.slice(b); }
  if (roll < 0.75) { const a = Math.min(at(), at()), b = Math.max(at(), a); return s.slice(0, a) + piece() + s.slice(a, b) + piece() + s.slice(b); }
  if (roll < 0.85) return s.replace('😀', '😁');
  const lines = s.split('\n'); const k = Math.floor(r() * lines.length); lines.splice(k, 0, lines[k]); return lines.join('\n');
}

test('a text diff replays forward and back, character for character, on 800 random histories', () => {
  for (let seed = 1; seed <= 800; seed++) {
    const r = rng(seed);
    let before = SEEDS[seed % SEEDS.length];
    for (let i = Math.floor(r() * 3); i > 0; i--) before = mutate(before, r);
    let after = before;
    for (let i = 1 + Math.floor(r() * 5); i > 0; i--) after = mutate(after, r);
    const hunks = textHunks(before, after), back = textHunks(after, before);
    assert.equal(applyText(before, hunks), after, `forward, seed ${seed}`);
    assert.equal(applyText(after, back), before, `back, seed ${seed}`);
    assert.equal(applyText(before, json(hunks)), after, `through JSON, seed ${seed}`);
    const saved = (forSaving([{op: 'text', on: 'page', page_id: 'p', field: 'html', hunks}]) as Extract<PatchOp, {op: 'text'}>[])[0].hunks;
    assert.equal(applyText(before, saved), after, `the saved form replays forward, seed ${seed}`);
    for (const h of [...hunks, ...back]) assert.ok(!LONE.test(h.insert) && !LONE.test('remove' in h ? h.remove : ''), `no character is cut in two, seed ${seed}`);
    for (let i = 1; i < hunks.length; i++) assert.ok(hunks[i].at >= hunks[i - 1].at + ('remove' in hunks[i - 1] ? (hunks[i - 1] as {remove: string}).remove.length : 0), `hunks are in order and apart, seed ${seed}`);
  }
});

test('two edits far apart are two hunks, not everything between them', () => {
  const page = bigPage();
  const twice = editParagraph(editParagraph(page, 2, 'a'), 27, 'b');
  const hunks = textHunks(page, twice);
  assert.ok(hunks.length >= 2, `${hunks.length} hunks`);
  const carried = hunks.reduce((n, h) => n + h.insert.length + ('remove' in h ? h.remove.length : 0), 0);
  assert.ok(carried < 3_000, `${carried} characters carried for two paragraph edits`);
  const minified = '<main>' + Array.from({length: 400}, (_, i) => `<p>row ${i}</p>`).join('') + '</main>';
  const edited = minified.replace('<p>row 3</p>', '<p>row three</p>').replace('<p>row 390</p>', '<p>row 390!</p>');
  assert.equal(textHunks(minified, edited).length, 2, 'a page on one line still splits at its tags');
});

test('a hunk that no longer fits is refused, and nothing is applied', () => {
  const p = freeProject('<p>alpha</p>\n<p>beta</p>\n'), frozen = JSON.stringify(p);
  for (const hunks of [
    [{at: 3, remove: 'beta', insert: 'gamma'}],
    [{at: 3, remove_length: 5, remove_hash: shortHash('alpha'), insert: 'A'}, {at: 15, remove: 'zzzz', insert: 'B'}],
    [{at: 3, remove_length: 5, remove_hash: '00000000', insert: 'A'}],
    [{at: 900, remove: '', insert: 'past the end'}],
    [{at: 15, remove: 'beta', insert: 'B'}, {at: 3, remove: 'alpha', insert: 'A'}],
  ]) {
    assert.throws(() => applyPatch(p, [{op: 'text', on: 'page', page_id: 'free-1', field: 'html', hunks} as PatchOp]), PatchError, JSON.stringify(hunks));
    assert.equal(JSON.stringify(p), frozen);
  }
  const sections = initialProject();
  assert.throws(() => applyPatch(sections, [{op: 'text', on: 'page', page_id: sections.pages[0].id, field: 'html', hunks: [{at: 0, remove: '', insert: 'x'}]}]), /has no html/, 'a section page has no html to splice');
});

test('one paragraph edited on a 47,000-character page is recorded in under 2,000 characters, and the saved copy keeps no removed text', () => {
  const page = bigPage();
  const p = freeProject(page), history = newHistory(p);
  const before = begin(p, history);
  p.pages[1].html = editParagraph(page, 7, 'once');
  const change = end(p, before, {author: PERSON, source: 'editor:change'}, history)!;
  assert.ok(page.length > 45_000);
  assert.ok(change.size < 2_000, `${change.size} characters`);
  const op = change.ops[0] as Extract<PatchOp, {op: 'text'}>;
  assert.equal(op.op, 'text');
  for (const h of op.hunks) assert.ok(!('remove' in h) && 'remove_length' in h && /^[0-9a-f]{8}$/.test(h.remove_hash), JSON.stringify(h));
  const replayed = applyPatch(json(before), json(change.ops));
  assert.equal(replayed.pages[1].html, p.pages[1].html, 'the saved change replays onto a copy of the state it was made on');
  const read = readLedger(json(p.ledger))!;
  assert.deepEqual(read.changes[0].ops, change.ops, 'a ledger read from a file keeps the same form');
});

test('a change to more than half of the page is recorded whole', () => {
  const p = freeProject(bigPage(0));
  const ops = diffProject(p, {...json(p), pages: [p.pages[0], {...p.pages[1], html: bigPage(3).replace(/quiet|ledger/g, 'other')}]});
  assert.deepEqual(ops.map(o => o.op), ['set']);
  const small = freeProject('<p>hello</p>');
  assert.deepEqual(diffProject(small, {...json(small), pages: [small.pages[0], {...small.pages[1], html: '<p>hello, world</p>'}]}).map(o => o.op), ['text']);
});

test('300 edits in a row keep every change\'s ops in the saved ledger, and undo walks back exactly', () => {
  const p = freeProject(bigPage()), history = newHistory(p);
  const states = [p.pages[1].html!];
  for (let n = 0; n < 300; n++) {
    const before = begin(p, history);
    p.pages[1].html = editParagraph(p.pages[1].html!, n % 30, `n${n}`);
    assert.ok(end(p, before, {author: PERSON, source: 'editor:change'}, history));
    states.push(p.pages[1].html!);
  }
  const ledger = p.ledger!;
  assert.equal(ledger.changes.length, 300);
  assert.equal(ledger.changes.filter(c => c.compacted).length, 0, 'nothing compacted');
  assert.ok(ledger.changes.reduce((n, c) => n + c.size, 0) < LEDGER_BUDGET / 2);
  let cur: Project = p;
  for (let k = 1; k <= UNDO_LIMIT; k++) {
    const done = step(cur, 'undo', history, PERSON)!;
    cur = done.project;
    assert.equal(cur.pages[1].html, states[300 - k], `undo ${k}`);
  }
});

test('one change bigger than a quarter of the budget gives up its own ops, not every older change\'s', () => {
  const p = freeProject(bigPage()), history = newHistory(p);
  for (let n = 0; n < 50; n++) {
    const before = begin(p, history);
    p.pages[1].html = editParagraph(p.pages[1].html!, n % 30, `n${n}`);
    end(p, before, {author: PERSON, source: 'editor:change'}, history);
  }
  const before = begin(p, history);
  p.pages[1].html = '<main>' + Array.from({length: 40_000}, (_, i) => `<p>line ${i} of a whole new page</p>`).join('\n') + '</main>';
  assert.ok(p.pages[1].html.length > LEDGER_BUDGET);
  const big = end(p, before, {author: AGENT, source: 'agent:apply', reason: 'A whole new page.'}, history)!;
  const changes = p.ledger!.changes;
  assert.equal(changes.at(-1)!.id, big.id);
  assert.equal(changes.at(-1)!.compacted, true, 'the big change keeps who, what and why, but not its ops');
  assert.equal(changes.slice(0, -1).filter(c => c.compacted).length, 0, 'every older change keeps its ops');
  const undone = step(p, 'undo', history, PERSON)!;
  assert.equal(undone.project.pages[1].html, before.pages[1].html, 'undo is exact all the same');
});

test('the line diff gives up on edits scattered everywhere and records one passage, which still replays exactly', () => {
  const page = Array.from({length: 4000}, (_, i) => `<p id="r${i}">row ${i}</p>`).join('\n');
  const edited = page.split('\n').map((line, i) => i % 3 ? line : line.replace('row', 'ROW')).join('\n');
  const hunks = textHunks(page, edited);
  assert.equal(hunks.length, 1, 'more edits than the diff will chase become one passage from the first to the last');
  assert.equal(applyText(page, hunks), edited);
  assert.equal(applyText(edited, textHunks(edited, page)), page);
});

test('random edit histories undo and redo through the session without a character out of place', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed * 31);
    const p = freeProject(SEEDS[seed % SEEDS.length] + bigPage(seed).slice(0, 4000 + Math.floor(r() * 4000))), history = newHistory(p);
    const states = [p.pages[1].html!];
    let cur: Project = p;
    for (let i = 0; i < 12; i++) {
      const before = begin(cur, history);
      cur.pages[1].html = mutate(cur.pages[1].html!, r);
      end(cur, before, {author: i % 2 ? AGENT : PERSON, source: i % 2 ? 'agent:apply' : 'editor:change'}, history);
      if (cur.pages[1].html !== states.at(-1)) states.push(cur.pages[1].html!);
    }
    for (let k = states.length - 2; k >= 0; k--) { cur = step(cur, 'undo', history, PERSON)!.project; assert.equal(cur.pages[1].html, states[k], `undo to ${k}, seed ${seed}`); }
    for (let k = 1; k < states.length; k++) { cur = step(cur, 'redo', history, PERSON)!.project; assert.equal(cur.pages[1].html, states[k], `redo to ${k}, seed ${seed}`); }
  }
});

test('an agent can send a recorded text change back as a patch, in either form', () => {
  const p = freeProject(bigPage()), history = newHistory(p);
  const before = begin(p, history);
  p.pages[1].html = editParagraph(p.pages[1].html!, 4, 'x');
  const change = end(p, before, {author: PERSON, source: 'editor:change'}, history)!;
  const parsed = parseBatch({reason: 'Replay the person\'s edit on the copy.', patch: json(change.ops)});
  assert.ok('batch' in parsed, 'error' in parsed ? parsed.error : '');
  if (!('batch' in parsed)) return;
  const replayed = runBatch(json(before), parsed.batch, '');
  assert.ok(replayed.ok, replayed.ok ? '' : replayed.error);
  if (replayed.ok) assert.equal(replayed.project.pages[1].html, p.pages[1].html, 'the saved form replays onto a copy through the same path an agent uses');
  const moved = runBatch(p, parsed.batch, '');
  assert.ok(!moved.ok && /no longer what passage 0 took out/.test(moved.error), 'replayed onto a page that has moved on, it is refused');
  for (const bad of [
    {op: 'text', on: 'project', page_id: 'free-1', field: 'html', hunks: [{at: 0, remove: '', insert: 'x'}]},
    {op: 'text', on: 'page', page_id: 'free-1', field: 'name', hunks: [{at: 0, remove: '', insert: 'x'}]},
    {op: 'text', on: 'page', page_id: 'free-1', field: 'html', hunks: []},
    {op: 'text', on: 'page', page_id: 'free-1', field: 'html', hunks: [{at: -1, remove: '', insert: 'x'}]},
    {op: 'text', on: 'page', page_id: 'free-1', field: 'html', hunks: [{at: 0, insert: 'x'}]},
    {op: 'text', on: 'page', page_id: 'free-1', field: 'html', hunks: [{at: 0, remove_length: 2, remove_hash: 'nothex!!', insert: 'x'}]},
  ]) assert.ok('error' in parseBatch({reason: 'r', patch: [bad]}), JSON.stringify(bad));
});
