import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble, currentPage, fingerprint, importDesignMarkdown, initialProject, isApproved, makeBlock, parseProject, safeImage } from '../src/model.ts';

test('project round-trip preserves ordered composition and tokens', () => {
  const p = initialProject();
  assert.deepEqual(parseProject(JSON.stringify(p)), { ...p, reference: undefined, approvedFingerprint: undefined });
  assert.deepEqual(currentPage(p).blocks.map(b => b.kind), ['navigation', 'hero', 'features', 'products', 'footer']);
});
test('review becomes stale when any page, token, or reference changes', () => {
  for (const change of [p => { p.system.accent = '#123456'; }, p => { p.pages[0].blocks[1].title = 'New title'; }, p => { p.reference = 'data:image/png;base64,AAAA'; }, p => { p.pages[0].name = 'New page'; } ] satisfies ((p: ReturnType<typeof initialProject>) => void)[]) {
    const p = initialProject(); p.approvedFingerprint = fingerprint(p); assert.equal(isApproved(p), true);
    change(p); assert.equal(isApproved(p), false);
  }
});
test('changing active page does not invalidate a reviewed project', () => {
  const p = initialProject(); p.pages.push({ id: 'page2', name: 'About', blocks: [] }); p.approvedFingerprint = fingerprint(p); p.activePageId = 'page2'; assert.equal(isApproved(p), true);
});
test('unsafe imports reject CSS, image injection, invalid kinds and duplicate IDs', () => {
  const cases = [p => { p.system.accent = '#fff;position:fixed'; }, p => { p.pages[0].blocks[0].image = 'javascript:alert(1)'; }, p => { p.pages[0].blocks[0].kind = 'script' as never; }, p => { p.pages[0].blocks[1].id = p.pages[0].blocks[0].id; }, p => { p.pages[0].blocks[0].id = 'bad"selector'; }, p => { p.activePageId = 'missing'; }, p => { p.system.radius = -1; } ] satisfies ((p: ReturnType<typeof initialProject>) => void)[];
  for (const change of cases) { const p = initialProject(); change(p); assert.throws(() => parseProject(JSON.stringify(p))); }
});
test('safe raster uploads and local assets are allowed; remote and SVG sources are not', () => {
  assert.equal(safeImage('/assets/interior.jpg'), '/assets/interior.jpg');
  assert.equal(safeImage('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safeImage('data:image/svg+xml;base64,AAAA'), '');
  assert.equal(safeImage('https://example.com/tracker.jpg'), '');
});
test('DESIGN import reads named tokens and preserves the original source without inventing other values', () => {
  const base = initialProject().system;
  const raw = '# My brand\n  primary: "#ff6f0f"\n  canvas: "#ffffff"\n  foreground: "#212124"';
  const imported = importDesignMarkdown(raw, 'Brand.md', base);
  assert.equal(imported.accent, '#ff6f0f'); assert.equal(imported.background, '#ffffff'); assert.equal(imported.foreground, '#212124');
  assert.equal(imported.originalMarkdown, raw); assert.equal(imported.radius, base.radius);
  assert.throws(() => importDesignMarkdown('A vague mood and an unrelated #ff6f0f.', 'bad.md', base));
});
test('local brief composition is deterministic and produces distinct structures', () => {
  assert.deepEqual(assemble('가구 쇼핑몰'), ['navigation', 'hero', 'products', 'features', 'footer']);
  assert.notDeepEqual(assemble('가구 쇼핑몰'), assemble('SaaS landing page'));
  assert.equal(makeBlock('hero').filled, false); assert.equal(makeBlock('hero', true).image, '/assets/interior.jpg');
});
