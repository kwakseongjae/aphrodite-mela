/**
 * Editing and rendering run without the app. The page pipeline imports its CSS with `?raw`, which
 * only Vite understood; tests/support/raw.mjs (loaded by `npm test`) gives Node the same, so a page
 * can be edited with runBatch and rendered with pageHtml in plain Node — the base a CLI builds on.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, currentPage, makeBlock} from '../src/model.ts';
import {runBatch} from '../src/agent/apply.ts';
import {parseBatch} from '../src/agent/ops.ts';

const {pageHtml} = await import('../src/render.ts');

test('a page renders in Node with its styles and its words', () => {
  const p = initialProject();
  const html = pageHtml(p, currentPage(p));
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<style>[^<]{2000,}/, 'the page CSS is inlined, not left as an import');
  assert.ok(html.includes('Objects for<br>a slower life.'));
  assert.ok(html.includes(`--brand:${p.system.accent}`));
});

test('an edit made without the app shows up in a render made without the app', () => {
  const p = initialProject();
  p.pages[0].blocks.push(makeBlock('stats', true), makeBlock('table', true));
  const parsed = parseBatch({reason: 'The page needs a way to get in touch.', ops: [{op: 'add', component_kind: 'cta', content: {title: 'Visit the studio', label: 'Book a visit'}}]});
  assert.ok('batch' in parsed);
  if (!('batch' in parsed)) return;
  const result = runBatch(p, parsed.batch, '');
  assert.ok(result.ok);
  if (!result.ok) return;
  const html = pageHtml(result.project, currentPage(result.project));
  assert.ok(html.includes('Visit the studio') && html.includes('Book a visit'));
  assert.ok(!pageHtml(p, currentPage(p)).includes('Visit the studio'), 'the project passed in is unchanged');
});
