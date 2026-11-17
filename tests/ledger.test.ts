import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject, parseProject, fingerprint, makeBlock, type Project} from '../src/model.ts';
import {applyPatch} from '../src/ledger/patch.ts';
import {changesSince, compact, designOf, emptyLedger, hasOmitted, LEDGER_BUDGET, readLedger, record, slim, UNDO_LIMIT, type Author, type Ledger} from '../src/ledger/ledger.ts';
import {begin, end, newHistory, step} from '../src/ledger/session.ts';
import {cloneProject} from '../src/workspace/library.ts';
import {ensureSpace} from '../src/editor/space.ts';

const me: Author = {kind: 'person', name: 'Designer'};
const bot: Author = {kind: 'agent', name: 'Claude Code'};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The way main.ts commits: begin, mutate, end. */
function edit(p: Project, h: ReturnType<typeof newHistory>, change: (p: Project) => void, meta: {author?: Author; source?: string; reason?: string} = {}) {
  const author = meta.author ?? me;
  const before = begin(p, h);
  change(p);
  return end(p, before, {author, source: meta.source ?? 'editor:change', reason: meta.reason}, h);
}

test('an edit becomes one change with who, where, why and both revisions', () => {
  const p = initialProject(), h = newHistory();
  const hero = p.pages[0].blocks[1];
  const before = fingerprint(p);
  const c = edit(p, h, x => { x.pages[0].blocks[1].title = 'Light, made meaningful'; }, {author: bot, source: 'agent:apply', reason: 'The first line says what the shop sells.'})!;
  assert.equal(c.seq, 1);
  assert.deepEqual(c.author, bot);
  assert.equal(c.source, 'agent:apply');
  assert.equal(c.reason, 'The first line says what the shop sells.');
  assert.deepEqual(c.anchors, {pages: [p.pages[0].id], nodes: [hero.id]});
  assert.equal(c.baseRevision, before);
  assert.equal(c.revision, fingerprint(p));
  assert.equal(c.view, false);
  assert.equal(p.ledger!.changes.length, 1);
});

test('nothing changed, nothing recorded', () => {
  const p = initialProject(), h = newHistory();
  assert.equal(edit(p, h, () => {}), null);
  assert.equal(edit(p, h, x => { x.shelf = []; }), null);
  assert.equal(p.ledger?.changes.length ?? 0, 0);
  assert.equal(h.undo.length, 0);
});

test('undo goes 200 steps deep and lands exactly where it started', () => {
  const p0 = initialProject(), h = newHistory();
  let p = p0;
  const states: string[] = [JSON.stringify(designOf(p))];
  for (let i = 0; i < 250; i++) {
    edit(p, h, x => {
      const blocks = x.pages[0].blocks;
      if (i % 5 === 0 && blocks.length < 100) blocks.push(makeBlock('cta', true));
      else if (i % 7 === 0 && blocks.length > 2) blocks.splice(1, 1);
      else blocks[i % blocks.length].title = `Edit ${i}`;
    });
    states.push(JSON.stringify(designOf(p)));
  }
  assert.equal(h.undo.length, UNDO_LIMIT);
  for (let i = 0; i < UNDO_LIMIT; i++) p = step(p, 'undo', h, me)!.project;
  assert.equal(step(p, 'undo', h, me), null, 'the 201st undo has nothing to take back');
  assert.deepEqual(designOf(p), JSON.parse(states[250 - UNDO_LIMIT]));
  for (let i = 0; i < UNDO_LIMIT; i++) p = step(p, 'redo', h, me)!.project;
  assert.deepEqual(designOf(p), JSON.parse(states[250]));
});

test('undo appends rather than erases, so the first state plus every change is the state on screen', () => {
  const start = initialProject(), h = newHistory();
  let p = clone(start);
  edit(p, h, x => { x.name = 'One'; });
  edit(p, h, x => { x.pages[0].blocks.reverse(); });
  edit(p, h, x => { x.system.accent = '#224466'; });
  p = step(p, 'undo', h, me)!.project;
  p = step(p, 'undo', h, me)!.project;
  p = step(p, 'redo', h, me)!.project;
  edit(p, h, x => { x.pages[0].blocks[0].label = 'Shop'; });
  const changes = p.ledger!.changes;
  assert.deepEqual(changes.map(c => c.source), ['editor:change', 'editor:change', 'editor:change', 'undo', 'undo', 'redo', 'editor:change']);
  assert.deepEqual(changes.map(c => c.undoes ?? c.redoes ?? null), [null, null, null, 3, 2, 2, null]);
  const replayed = changes.reduce((s, c) => applyPatch(s, c.ops), designOf(start));
  assert.deepEqual(replayed, designOf(p));
  assert.equal(h.redo.length, 0, 'a new edit clears redo');
});

test('a step that no longer fits throws and leaves the stacks alone', () => {
  const p = initialProject(), h = newHistory();
  const id = p.pages[0].blocks[1].id;
  edit(p, h, x => { x.pages[0].blocks[1].title = 'Changed'; });
  const broken = clone(p); broken.pages[0].blocks = broken.pages[0].blocks.filter(b => b.id !== id);
  assert.throws(() => step(broken, 'undo', h, me));
  assert.equal(h.undo.length, 1);
  assert.equal(h.redo.length, 0);
});

test('an agent\'s undo or redo cannot give or take back the approval; the person\'s can', () => {
  const p = initialProject(), h = newHistory();
  edit(p, h, x => { x.approvedFingerprint = fingerprint(x); });
  const draft = step(p, 'undo', h, me)!.project;
  assert.equal(draft.approvedFingerprint, undefined, 'the person took it back with ⌘Z');
  const seq = draft.ledger!.seq;
  assert.throws(() => step(draft, 'redo', h, bot), /person's decision/);
  assert.deepEqual([h.undo.length, h.redo.length, draft.ledger!.seq], [0, 1, seq], 'the stacks and the ledger are as they were');
  const approved = step(draft, 'redo', h, me)!.project;
  assert.equal(approved.approvedFingerprint, fingerprint(approved), 'the person\'s own ⌘⇧Z puts it back');
  assert.throws(() => step(approved, 'undo', h, bot), /person's decision/);
  assert.deepEqual([h.undo.length, h.redo.length], [1, 0]);
  edit(approved, h, x => { x.name = 'After approval'; }, {author: bot});
  assert.equal(step(approved, 'undo', h, bot)!.project.name, p.name, 'an agent still undoes an ordinary edit');
});

test('an edit made outside commit is still recorded, as untracked, before the next one', () => {
  const p = initialProject(), h = newHistory();
  edit(p, h, x => { x.name = 'Tracked'; });
  p.brief = 'Changed behind the ledger';
  edit(p, h, x => { x.pages[0].name = 'Next'; });
  assert.deepEqual(p.ledger!.changes.map(c => c.source), ['editor:change', 'untracked', 'editor:change']);
  assert.equal(h.undo.length, 2, 'untracked changes are not something undo takes back');
});

test('undo and redo record what changed behind the ledger first, even with nothing to step', () => {
  const start = initialProject(), h = newHistory();
  let p = clone(start);
  edit(p, h, x => { x.name = 'Tracked'; });
  p.brief = 'Changed behind the ledger';
  p = step(p, 'undo', h, me)!.project;
  assert.equal(p.brief, 'Changed behind the ledger', 'undo takes back the edit, not the outside change');
  assert.deepEqual(p.ledger!.changes.map(c => c.source), ['editor:change', 'untracked', 'undo']);
  p.pages[0].name = 'Renamed behind the ledger';
  assert.equal(step(p, 'undo', h, me), null, 'nothing left to undo');
  assert.deepEqual(p.ledger!.changes.map(c => c.source), ['editor:change', 'untracked', 'undo', 'untracked']);
  const replayed = p.ledger!.changes.reduce((s, c) => applyPatch(s, c.ops), designOf(start));
  assert.deepEqual(replayed, designOf(p), 'the first state plus every change is still the state on screen');
});

test('a project is the baseline from the moment it opens, so a change before the first edit is recorded', () => {
  const p = initialProject(), h = newHistory(p);
  p.brief = 'Changed before the first commit';
  edit(p, h, x => { x.name = 'First'; });
  assert.deepEqual(p.ledger!.changes.map(c => c.source), ['untracked', 'editor:change']);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /function openProject\(next:Project\)\{project=parseProject\(JSON\.stringify\(next\)\);selected='';ensureSpace\(project\);edits=newHistory\(project\);/, 'main.ts opens every project that way, its frames laid out first');
});

test('an untracked change is nobody\'s, not the next editor\'s, and redo does not survive it', () => {
  const p = initialProject(), h = newHistory(p);
  edit(p, h, x => { x.name = 'Tracked'; });
  const back = step(p, 'undo', h, me)!.project;
  assert.equal(h.redo.length, 1);
  back.brief = 'Changed behind the ledger';
  assert.equal(step(back, 'redo', h, bot), null, 'what redo would put back was taken from a state that is gone');
  assert.equal(h.redo.length, 0);
  back.pages[0].name = 'Renamed behind the ledger';
  edit(back, h, x => { x.name = 'Next'; }, {author: bot});
  const changes = back.ledger!.changes;
  assert.deepEqual(changes.map(c => `${c.source}/${c.author.kind}`), ['editor:change/person', 'undo/person', 'untracked/unknown', 'untracked/unknown', 'editor:change/agent']);
  assert.deepEqual(changes[2].author, {kind: 'unknown', name: 'unknown'});
  assert.deepEqual(parseProject(JSON.stringify(back)).ledger, back.ledger, 'a saved ledger with an unknown author reads back');
});

test('a page and its frame come and go together, so ⌘Z and ⌘⇧Z after adding a page still work', () => {
  // As main.ts does it: openProject() and commit() lay out the frames, so render() finds nothing to change.
  const add = (p: Project, h: ReturnType<typeof newHistory>, layout: boolean) => {
    const before = begin(p, h);
    p.pages.push({id: 'second', name: 'Second', blocks: []});
    if (layout) ensureSpace(p);
    end(p, before, {author: me, source: 'page-form'}, h);
  };
  let p = parseProject(JSON.stringify(initialProject()));
  ensureSpace(p);
  let h = newHistory(p);
  add(p, h, true);
  assert.equal(ensureSpace(p), false, 'render has nothing to lay out');
  p = step(p, 'undo', h, me)!.project;
  assert.equal(ensureSpace(p), false);
  p = step(p, 'redo', h, me)!.project;
  assert.deepEqual(p.pages.map(x => x.id).at(-1), 'second');
  assert.ok(!p.ledger!.changes.some(c => c.source === 'untracked'));
  // Left to render(), the frame is an edit outside the ledger, and the redo it clears is lost.
  p = parseProject(JSON.stringify(initialProject()));
  ensureSpace(p);
  h = newHistory(p);
  add(p, h, false);
  ensureSpace(p);
  p = step(p, 'undo', h, me)!.project;
  ensureSpace(p);
  assert.equal(step(p, 'redo', h, me), null);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /\n {2}change\(\);ensureSpace\(project\);\n {2}const recorded=end\(project,before,/, 'commit() lays out frames before it records');
});

test('switching pages is recorded as view, and undo still takes it back as it always has', () => {
  const p = initialProject(), h = newHistory();
  p.pages.push({id: 'second', name: 'Second', blocks: []});
  const c = edit(p, h, x => { x.activePageId = 'second'; })!;
  assert.equal(c.view, true);
  assert.equal(c.revision, c.baseRevision);
  assert.equal(step(p, 'undo', h, me)!.project.activePageId, p.pages[0].id);
});

test('pictures are kept for undo and left out of what is saved', () => {
  const p = initialProject(), h = newHistory();
  const big = 'data:image/png;base64,' + 'A'.repeat(50_000);
  const c = edit(p, h, x => { x.pages[0].blocks[1].image = big; })!;
  assert.ok(hasOmitted(c.ops));
  assert.ok(JSON.stringify(c).length < 2_000);
  const back = step(p, 'undo', h, me)!.project;
  const again = step(back, 'redo', h, me)!.project;
  assert.equal(again.pages[0].blocks[1].image, big);
  assert.deepEqual(slim({a: 'short', b: 'data:x'}), {a: 'short', b: 'data:x'});
});

test('an uploaded picture is left out however small it is; other data is kept unless it is long', () => {
  const tiny = 'data:image/png;base64,' + 'A'.repeat(500);
  assert.deepEqual(slim({image: tiny}), {image: {$omitted: 'data-url', bytes: tiny.length}});
  assert.deepEqual(slim('data:image/svg+xml,<svg/>'), {$omitted: 'data-url', bytes: 25});
  const text = 'data:text/plain,' + 'x'.repeat(500);
  assert.equal(slim(text), text);
  assert.deepEqual(slim('data:text/plain,' + 'x'.repeat(3_000)), {$omitted: 'data-url', bytes: 3_016});
  const p = initialProject(), h = newHistory(p);
  const c = edit(p, h, x => { x.pages[0].blocks[1].image = tiny; })!;
  assert.ok(hasOmitted(c.ops));
  assert.ok(!JSON.stringify(p.ledger).includes('data:image'), 'not in what is saved, exported or sent to an agent');
  const back = step(p, 'undo', h, me)!.project;
  assert.equal(step(back, 'redo', h, me)!.project.pages[0].blocks[1].image, tiny, 'undo keeps it exactly');
});

test('the saved ledger keeps to its budget: oldest ops first, then oldest headers', () => {
  const ledger = emptyLedger();
  let p = initialProject();
  for (let i = 0; i < 60; i++) {
    const next = clone(p); next.brief = 'x'.repeat(200) + i;
    record(ledger, p, next, {author: me, source: 'editor:change'});
    p = next;
  }
  // 60 headers are about 18,000 characters; the budget leaves room for the newest few to keep their ops.
  compact(ledger, 22_000);
  const total = ledger.changes.reduce((s, c) => s + c.size, 0);
  assert.ok(total <= 22_000);
  assert.equal(ledger.changes.length, 60, 'no header was dropped while ops could go first');
  assert.ok(ledger.changes[0].compacted);
  assert.ok(!ledger.changes[ledger.changes.length - 1].compacted, 'the newest keeps its ops');
  compact(ledger, 600);
  assert.ok(ledger.changes.length >= 1 && ledger.changes[ledger.changes.length - 1].seq === 60);
});

test('a ledger read from a file is held to what is saved: pictures out, sizes counted, the budget kept', () => {
  const p = initialProject(), h = newHistory(p);
  edit(p, h, x => { x.brief = 'One'; });
  edit(p, h, x => { x.brief = 'Two'; });
  const raw = clone(p.ledger!) as Ledger;
  const block = {op: 'set', on: 'block', page_id: p.pages[0].id, block_id: p.pages[0].blocks[1].id, field: 'image', value: 'data:image/png;base64,AAAA'} as const;
  raw.changes[0].ops = [{op: 'set', on: 'project', field: 'brief', value: 'a'.repeat(700_000)}];
  raw.changes[1].ops = [block, {op: 'set', on: 'project', field: 'brief', value: 'b'.repeat(700_000)}];
  raw.changes.forEach(c => { c.size = 1; });
  const read = readLedger(JSON.parse(JSON.stringify(raw)))!;
  assert.ok(read.changes.every(c => c.size === JSON.stringify({...c, size: 0}).length), 'every size is counted, not taken on trust');
  assert.ok(read.changes.reduce((s, c) => s + c.size, 0) <= LEDGER_BUDGET);
  assert.deepEqual([read.changes[0].compacted, read.changes[0].ops], [true, []], 'the oldest gave up its ops');
  assert.deepEqual(read.changes[1].ops[0], {...block, value: {$omitted: 'data-url', bytes: 26}});
  assert.ok(!JSON.stringify(read).includes('data:image'));
  assert.deepEqual(readLedger(JSON.parse(JSON.stringify(p.ledger))), p.ledger, 'a ledger the app saved reads back as it was');
});

test('changes since a sequence number or a revision, view left out unless asked', () => {
  const p = initialProject(), h = newHistory();
  p.pages.push({id: 'second', name: 'Second', blocks: []});
  edit(p, h, x => { x.name = 'A'; });
  const mark = fingerprint(p);
  edit(p, h, x => { x.activePageId = 'second'; });
  edit(p, h, x => { x.name = 'B'; });
  edit(p, h, x => { x.name = 'C'; });
  assert.deepEqual(changesSince(p.ledger, 1).changes.map(c => c.seq), [3, 4]);
  assert.deepEqual(changesSince(p.ledger, 1, {includeView: true}).changes.map(c => c.seq), [2, 3, 4]);
  assert.deepEqual(changesSince(p.ledger, mark).changes.map(c => c.seq), [3, 4]);
  const page = changesSince(p.ledger, 0, {limit: 2});
  assert.deepEqual([page.changes.length, page.more], [2, true]);
});

test('the ledger travels with the project and a broken one never blocks opening it', () => {
  const p = initialProject(), h = newHistory();
  edit(p, h, x => { x.name = 'Saved'; });
  const read = parseProject(JSON.stringify(p));
  assert.deepEqual(read.ledger, p.ledger);
  assert.equal(fingerprint(read), fingerprint(designOf(p)), 'the ledger is not part of the fingerprint');
  const bad = clone(p) as Project & {ledger: unknown};
  (bad.ledger as {changes: unknown[]}).changes.push({seq: 'nope'});
  const opened = parseProject(JSON.stringify(bad));
  assert.equal(opened.ledger, undefined);
  assert.equal(opened.name, 'Saved');
});

test('a copied project keeps its history: the ids it names are the copy\'s ids too', () => {
  const p = initialProject(), h = newHistory();
  edit(p, h, x => { x.pages[0].blocks[1].title = 'Before the copy'; });
  const copy = cloneProject(p);
  assert.notEqual(copy.id, p.id);
  assert.deepEqual(copy.ledger, p.ledger);
  const named = new Set(copy.ledger!.changes.flatMap(c => c.anchors.nodes));
  const present = new Set(copy.pages.flatMap(page => page.blocks.map(b => b.id)));
  assert.ok([...named].every(id => present.has(id)), 'every node the history names exists in the copy');
});
