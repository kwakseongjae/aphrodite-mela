import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, makeBlock, parseProject, catalog, type Project, type Block} from '../src/model.ts';
import {applyPatch, diffProject, isViewOnly, anchorsOf, same, PatchError, type PatchOp} from '../src/ledger/patch.ts';

/* A seeded generator, so a failing case can be replayed from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** One random edit of the kinds the editor and the agents make: copy, layout, structure, system, pages. */
function mutate(p: Project, r: () => number): void {
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const page = pick(p.pages);
  const kinds = catalog.map(c => c.kind);
  const roll = r();
  if (roll < 0.14 && page.blocks.length) { const b = pick(page.blocks); b.title = `T${Math.floor(r() * 1e6)}`; if (r() < .5) b.text = `X${Math.floor(r() * 1e6)}`; }
  else if (roll < 0.22) { if (page.blocks.length < 100) page.blocks.splice(Math.floor(r() * (page.blocks.length + 1)), 0, makeBlock(pick(kinds), r() < .5)); }
  else if (roll < 0.30 && page.blocks.length) { const victim = pick(page.blocks); page.blocks.forEach(c => { if (c.parentId === victim.id) c.parentId = victim.parentId; }); page.blocks.splice(page.blocks.indexOf(victim), 1); }
  else if (roll < 0.40 && page.blocks.length > 1) { for (let i = page.blocks.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [page.blocks[i], page.blocks[j]] = [page.blocks[j], page.blocks[i]]; } }
  else if (roll < 0.46 && page.blocks.length) { const b = pick(page.blocks); if (b.eyebrow === undefined) b.eyebrow = 'Eyebrow'; else delete b.eyebrow; }
  else if (roll < 0.52 && page.blocks.length) { const b = pick(page.blocks); b.layout = {...b.layout, width: pick([4, 6, 12]), gap: Math.floor(r() * 40)} as Block['layout']; }
  else if (roll < 0.58) { p.system.accent = `#${Math.floor(r() * 0xffffff).toString(16).padStart(6, '0')}`; if (r() < .3) p.system.radius = Math.floor(r() * 20); }
  else if (roll < 0.62) { if (p.system.headingFamily === undefined) p.system.headingFamily = 'Pretendard'; else delete p.system.headingFamily; }
  else if (roll < 0.68) { if (p.pages.length < 30) { const id = `page${Math.floor(r() * 1e9)}`; p.pages.splice(Math.floor(r() * (p.pages.length + 1)), 0, {id, name: 'New', blocks: r() < .5 ? [makeBlock('hero', true)] : []}); } }
  else if (roll < 0.72) { if (p.pages.length > 1) { const gone = pick(p.pages); p.pages.splice(p.pages.indexOf(gone), 1); if (p.activePageId === gone.id) p.activePageId = p.pages[0].id; } }
  else if (roll < 0.76 && p.pages.length > 1) { const [m] = p.pages.splice(Math.floor(r() * p.pages.length), 1); p.pages.splice(Math.floor(r() * (p.pages.length + 1)), 0, m); }
  else if (roll < 0.80) { page.name = `Page ${Math.floor(r() * 100)}`; if (r() < .3) page.proposal = {fromPageId: p.pages[0].id, label: 'Option', kind: 'agent'}; else delete page.proposal; }
  else if (roll < 0.84 && p.pages.length > 1 && page.blocks.length) {
    // A block carried to another page: it must leave one before it arrives at the other.
    const to = pick(p.pages.filter(x => x !== page)); const b = pick(page.blocks);
    page.blocks.forEach(c => { if (c.parentId === b.id) delete c.parentId; });
    page.blocks.splice(page.blocks.indexOf(b), 1); delete b.parentId; to.blocks.splice(Math.floor(r() * (to.blocks.length + 1)), 0, b);
  }
  else if (roll < 0.88) { p.activePageId = pick(p.pages).id; }
  else if (roll < 0.92) { p.name = `Project ${Math.floor(r() * 100)}`; if (r() < .5) p.brief = `Brief ${Math.floor(r() * 100)}`; }
  else if (roll < 0.95) { if (p.reference === undefined) p.reference = '/assets/chair.jpg'; else delete p.reference; }
  else { p.space = {frames: Object.fromEntries(p.pages.map((x, i) => [x.id, {x: i * 1300 + Math.floor(r() * 50), y: 0, preset: pick(['desktop', 'mobile'] as const)}]))}; }
}

test('a diff replays forward and its reverse replays back, on 600 random edit histories', () => {
  for (let seed = 1; seed <= 600; seed++) {
    const r = rng(seed);
    const before = initialProject();
    for (let i = Math.floor(r() * 3); i > 0; i--) mutate(before, r);
    const after = clone(before);
    for (let i = 1 + Math.floor(r() * 6); i > 0; i--) mutate(after, r);
    const ops = diffProject(before, after), inverse = diffProject(after, before);
    assert.deepEqual(applyPatch(before, ops), after, `forward, seed ${seed}`);
    assert.deepEqual(applyPatch(after, inverse), before, `back, seed ${seed}`);
    assert.equal(same(after, before), ops.length === 0, `empty diff means no change, seed ${seed}`);
  }
});

test('the patch survives JSON, so a stored change replays the same way', () => {
  for (let seed = 1000; seed < 1200; seed++) {
    const r = rng(seed), before = initialProject(), after = clone(before);
    for (let i = 1 + Math.floor(r() * 5); i > 0; i--) mutate(after, r);
    const stored = JSON.parse(JSON.stringify(diffProject(before, after))) as PatchOp[];
    assert.deepEqual(applyPatch(before, stored), after, `seed ${seed}`);
  }
});

test('a valid project stays valid through its own patch', () => {
  for (let seed = 2000; seed < 2150; seed++) {
    const r = rng(seed), before = initialProject(), after = clone(before);
    for (let i = 1 + Math.floor(r() * 5); i > 0; i--) mutate(after, r);
    let valid = true;
    try { parseProject(JSON.stringify(after)); } catch { valid = false; }
    if (!valid) continue;
    assert.doesNotThrow(() => parseProject(JSON.stringify(applyPatch(before, diffProject(before, after)))), `seed ${seed}`);
  }
});

test('the project passed in is never touched', () => {
  const before = initialProject(), after = clone(before);
  after.pages[0].blocks.reverse(); after.name = 'Changed';
  const frozen = JSON.stringify(before);
  applyPatch(before, diffProject(before, after));
  assert.equal(JSON.stringify(before), frozen);
});

test('nothing changed, nothing recorded — key order is not a change', () => {
  const p = initialProject();
  const reordered = JSON.parse(JSON.stringify(p), (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v) as Project;
  assert.deepEqual(diffProject(p, reordered), []);
});

test('the shelf and the ledger are not the design', () => {
  const p = initialProject(), q = clone(p) as Project & {ledger?: unknown};
  q.shelf = [{provider: 'own', kind: 'hero', variant: 'split'} as never];
  q.ledger = {seq: 3, changes: []};
  assert.deepEqual(diffProject(p, q), []);
});

test('ops name what they touch, in order: removes before inserts across pages', () => {
  const before = initialProject();
  before.pages.push({id: 'second', name: 'Second', blocks: []});
  const after = clone(before);
  const moved = after.pages[0].blocks.splice(1, 1)[0];
  after.pages[1].blocks.push(moved);
  const ops = diffProject(before, after);
  const removeAt = ops.findIndex(o => o.op === 'remove_block'), insertAt = ops.findIndex(o => o.op === 'insert_block');
  assert.ok(removeAt >= 0 && insertAt > removeAt);
  assert.deepEqual(anchorsOf(ops).nodes, [moved.id]);
});

test('a broken op names itself and nothing lands', () => {
  const p = initialProject();
  const ops: PatchOp[] = [
    {op: 'set', on: 'project', field: 'name', value: 'Fine'},
    {op: 'set', on: 'block', page_id: p.pages[0].id, block_id: 'missing', field: 'title', value: 'x'},
  ];
  assert.throws(() => applyPatch(p, ops), (e: unknown) => e instanceof PatchError && e.index === 1);
  assert.equal(p.name, 'Form & Field');
  assert.throws(() => applyPatch(p, [{op: 'set', on: 'block', page_id: p.pages[0].id, block_id: p.pages[0].blocks[0].id, field: 'id', value: 'x'}]));
  assert.throws(() => applyPatch(p, [{op: 'set', on: 'project', field: 'id' as never, value: 'x'}]));
  assert.throws(() => applyPatch(p, [{op: 'move_block', page_id: p.pages[0].id, block_id: p.pages[0].blocks[0].id, index: 99}]));
});

test('switching pages and dragging frames is view; resizing a frame is design', () => {
  const p = initialProject();
  p.pages.push({id: 'second', name: 'Second', blocks: []});
  p.space = {frames: {[p.pages[0].id]: {x: 0, y: 0, preset: 'desktop'}, second: {x: 1300, y: 0, preset: 'desktop'}}};
  const look = clone(p); look.activePageId = 'second';
  assert.equal(isViewOnly(diffProject(p, look), p, look), true);
  const drag = clone(p); drag.space!.frames.second.x = 2000;
  assert.equal(isViewOnly(diffProject(p, drag), p, drag), true);
  const resize = clone(p); resize.space!.frames.second.preset = 'mobile';
  assert.equal(isViewOnly(diffProject(p, resize), p, resize), false);
  const copyEdit = clone(p); copyEdit.activePageId = 'second'; copyEdit.pages[0].blocks[0].title = 'New';
  assert.equal(isViewOnly(diffProject(p, copyEdit), p, copyEdit), false);
});

test('a new field on Project or Page cannot slip past the ledger unnoticed', async () => {
  // Fields are read off the type in model.ts. A field added there must be either diffed (projectFields /
  // pageFields in src/ledger/patch.ts) or named here as deliberately not design, with the reason.
  const {readFileSync} = await import('node:fs');
  const {projectFields, pageFields} = await import('../src/ledger/patch.ts');
  const model = readFileSync(new URL('../src/model.ts', import.meta.url), 'utf8');
  const fieldsOf = (name: string) => {
    const body = model.match(new RegExp(`export type ${name} = \\{([^}]*)\\}`))![1];
    return [...body.matchAll(/(\w+)\??\s*:/g)].map(m => m[1]);
  };
  const notDesign: Record<string, string> = {
    version: 'fixed at 1', id: 'never changes', pages: 'diffed by its own ops', system: 'diffed field by field',
    shelf: 'kept beside the canvas; canvas undo has never touched it', ledger: 'the record itself',
  };
  for (const field of fieldsOf('Project')) assert.ok((projectFields as readonly string[]).includes(field) || field in notDesign, `Project.${field} is neither diffed nor excused`);
  const pageNotDesign: Record<string, string> = {id: 'never changes', blocks: 'diffed by its own ops'};
  for (const field of fieldsOf('Page')) assert.ok((pageFields as readonly string[]).includes(field) || field in pageNotDesign, `Page.${field} is neither diffed nor excused`);
});
