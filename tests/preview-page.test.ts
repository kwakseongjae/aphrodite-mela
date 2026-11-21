/**
 * The internal preview download page wears the public landing's own stylesheet and brand, is a page
 * only people who know the address reach, and never offers a download address before the release says it is there.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../site/preview/index.html');
const js = read('../site/preview/preview.js');

/* The landing is changed in 0.3-6, not here. When it is changed on purpose, put the new sums here: shasum -a 256 site/index.html site/script.js site/styles.css */
const LANDING: Record<string, string> = {
  'index.html': 'a8e809b1a76a5ac963c57b382440c11495690b6c0f333daddfaf24ff864b9a57',
  'script.js': '9c230d509bf3da24bb3f1d4e3e67c01c526656902d63767d4dfb5ffc3d56a2d2',
  'styles.css': '9f82dd3885fa0bbbc3c4335b799b1974095ce7ff57adabc29baed4b13d97e771',
};

test('the public landing is byte for byte what it was, and never mentions the preview page', () => {
  for (const [f, sum] of Object.entries(LANDING)) {
    const text = readFileSync(new URL('../site/' + f, import.meta.url));
    assert.equal(createHash('sha256').update(text).digest('hex'), sum, `site/${f} changed`);
    assert.ok(!/preview\//i.test(text.toString('utf8')), `site/${f} mentions the preview page`);
  }
});

test('the preview page is kept out of search, in Korean, and wears the landing stylesheet rather than the app tokens', () => {
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/styles\.css">/);
  assert.match(html, /<link rel="stylesheet" href="preview\.css">/);
  assert.ok(!/tokens\.css|data-theme|data-i18n/.test(html));
  assert.ok(!/src="\.\.\/script\.js"/.test(html), 'the landing script would point the buttons at the public release');
  assert.ok(!existsSync(new URL('../site/preview/tokens.css', import.meta.url)));
});

test('every picture the page names is there', () => {
  const srcs = [...html.matchAll(/<img[^>]* src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.length >= 4);
  for (const s of srcs) assert.ok(existsSync(new URL('../site/preview/' + s, import.meta.url)), s);
});

test('the preview version is one constant, and the file names follow the release workflow', () => {
  const v = [...js.matchAll(/var VERSION = '([^']+)'/g)];
  assert.equal(v.length, 1);
  assert.ok(!html.includes(v[0][1]), 'the page writes the version itself; it comes from preview.js');
  assert.ok(js.includes("'Aphrodite_' + VERSION + '_aarch64.dmg'"));
  assert.ok(js.includes("'Aphrodite_' + VERSION + '_x64.dmg'"));
});

test('no download button has an address until the release answers', () => {
  const dl = [...html.matchAll(/<a [^>]*data-dl="(arm|intel)"[^>]*>/g)];
  assert.ok(dl.some(m => m[1] === 'arm') && dl.some(m => m[1] === 'intel'));
  for (const m of dl) assert.ok(!/ href=/.test(m[0]), m[0]);
});

test('every command on the page is one the README already publishes, letter for letter', () => {
  const published = read('../README.md') + read('../mcp/aphrodite-mcp/README.md');
  const cmds = [...html.matchAll(/<code data-cmd>([^<]+)<\/code>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  assert.ok(cmds.length >= 3);
  for (const c of cmds) assert.ok(published.includes(c), c);
});
