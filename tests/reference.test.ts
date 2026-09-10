import test from 'node:test';
import assert from 'node:assert/strict';
import { initialProject, parseProject, isApproved, fingerprint } from '../src/model';
import { normalizeLines, suggestCopy, composeDirections, type ReferenceAnalysis } from '../src/reference';
import { sceneManifest, componentIdentity } from '../src/components';

const line = (text: string, y: number, height: number) => ({ text, y, height, x: .05, width: .4, confidence: .95 });
const analysis: ReferenceAnalysis = { engine: 'Apple Vision + pixels', warning: '', sourceFingerprint: 'a'.repeat(64), width: 1600, height: 866, lines: [line('Objects for', .18, .06), line('a slower life.', .26, .06), line('Furniture and everyday objects, thoughtfully made.', .39, .014)], palette: ['#ffffff'], crop: 'data:image/jpeg;base64,AA==', cropBox: { x: .5, y: .07, width: .5, height: .42 }, elapsedMs: 123 };
test('OCR evidence is bounded, normalized and rejects malformed confidence or boxes', () => {
  assert.equal(normalizeLines([...analysis.lines, { ...line('bad', 0, .1), confidence: NaN }, { ...line('bad', 0, .1), x: -1 }]).length, 3);
  assert.deepEqual(normalizeLines({ text: 'not an array' }), []);
});
test('OCR headline lines and nearby body are proposed, not executed as instructions', () => {
  const copy = suggestCopy(analysis.lines, initialProject());
  assert.equal(copy.title, 'Objects for\na slower life.');
  assert.match(copy.text, /Furniture/);
});
test('three candidates have distinct real variants, same tokens, unique identities and opt-in crop', () => {
  const p = initialProject(), before = JSON.stringify(p);
  const pages = composeDirections(p, analysis, suggestCopy(analysis.lines, p), false);
  assert.deepEqual(pages.map(page => page.blocks[1].variant), ['split', 'image-left', 'stacked']);
  assert.ok(pages.every(page => page.blocks[1].image === ''));
  assert.equal(JSON.stringify(p), before);
  assert.equal(new Set(pages.flatMap(page => [page.id, ...page.blocks.map(b => b.id)])).size, 18);
  const filled = composeDirections(p, analysis, suggestCopy(analysis.lines, p), true);
  assert.equal(filled[0].blocks[1].image, analysis.crop);
});
test('chosen direction round-trips with evidence, invalidates approval and exports the registry', () => {
  const p = initialProject(); p.approvedFingerprint = fingerprint(p);
  p.pages.push(composeDirections(p, analysis, suggestCopy(analysis.lines, p), true)[2]);
  const parsed = parseProject(JSON.stringify(p));
  assert.equal(isApproved(parsed), false);
  assert.equal(parsed.pages[1].referenceEvidence?.direction, 'stacked');
  const scene = sceneManifest(parsed);
  assert.equal(scene.pages[1].nodes[1].componentId, 'aphrodite.hero');
  assert.equal(scene.pages[1].nodes[1].variant, 'stacked');
  assert.equal(componentIdentity(p.pages[0].blocks[1]).variant, 'split');
});
test('unsupported variants and invalid provenance are rejected on import', () => {
  const p = initialProject(); p.pages[0].blocks[1].variant = 'bad" onclick="alert(1)' as never;
  assert.throws(() => parseProject(JSON.stringify(p)), /변형/);
  const q = initialProject(); q.pages.push(composeDirections(q, analysis, suggestCopy([], q), false)[0]);
  q.pages[1].referenceEvidence!.palette = ['red;position:fixed'];
  assert.throws(() => parseProject(JSON.stringify(q)), /분석 기록/);
});
