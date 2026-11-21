/**
 * The internal preview download page keeps its own copy of the app's tokens (a static site cannot import src/),
 * and is a page only people who know the address reach.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('site/preview/tokens.css is exactly src/ui/tokens.css', () => {
  assert.equal(read('../site/preview/tokens.css'), read('../src/ui/tokens.css'), 'the copy is old: cp src/ui/tokens.css site/preview/tokens.css');
});

test('the preview page is kept out of search and is not linked from the public landing', () => {
  assert.match(read('../site/preview/index.html'), /<meta name="robots" content="noindex">/);
  for (const f of ['index.html', 'script.js', 'styles.css']) assert.ok(!/preview\//i.test(read('../site/' + f)), `site/${f} mentions the preview page`);
});

test('the preview page is light, and its buttons are real links', () => {
  const html = read('../site/preview/index.html');
  assert.match(html, /<html lang="ko" data-theme="light">/);
  assert.equal([...html.matchAll(/<a class="btn[^"]*" data-dl=/g)].length, 2);
});

test('the preview version is one constant, and the file names follow the release workflow', () => {
  const js = read('../site/preview/preview.js');
  assert.equal([...js.matchAll(/var VERSION = '([^']+)'/g)].length, 1);
  assert.ok(js.includes("'Aphrodite_' + VERSION + '_aarch64.dmg'"));
  assert.ok(js.includes("'Aphrodite_' + VERSION + '_x64.dmg'"));
});
