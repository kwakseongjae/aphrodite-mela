/**
 * The internal preview download page wears the public landing's own stylesheet and brand, is a page
 * only people who know the address reach, and never offers a download address before the release says it is there.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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
  assert.ok(!/tokens\.css|data-theme/.test(html));
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

test('the page leads to its own parts, hides the release notes until a release answers, and says 확인 중 rather than claiming a check', () => {
  for (const id of ['get', 'connect', 'know']) {
    assert.match(html, new RegExp(`<a [^>]*href="#${id}"`), `the nav leads to #${id}`);
    assert.match(html, new RegExp(` id="${id}"`), `#${id} is on the page`);
  }
  const notes = html.match(/<a [^>]*data-notes[^>]*>/);
  assert.ok(notes && / hidden/.test(notes[0]) && !/ href=/.test(notes[0]), 'the release notes link ships hidden, with no address');
  assert.ok(!html.includes('확인함'));
  assert.ok([...html.matchAll(/data-dl="arm"/g)].length >= 3, 'the hero, the row and the closing button');
});

test('every tool the page names is one the MCP server has', () => {
  const tools = read('../mcp/aphrodite-mcp/README.md');
  const named = [...new Set([...html.matchAll(/aphrodite_[a-z_]+/g)].map(m => m[0]))];
  assert.ok(named.length >= 1);
  for (const n of named) assert.ok(tools.includes('`' + n + '`'), n);
});

/* The page's words: the HTML carries the Korean, preview.js carries every language by key. */
const COPY = runInNewContext('(' + (js.match(/var COPY = (\{[\s\S]*?\n  \});/) ?? ['', 'null'])[1] + ')') as Record<string, Record<string, string>> | null;
const LANGS = ['ko', 'en'];
const marked = [...html.matchAll(/data-i18n(?:-alt|-aria|-content)?="([^"]+)"/g)].map(m => m[1]);

test('every key the page or its script uses has every language, and no key goes unused', () => {
  assert.ok(COPY, 'preview.js has a COPY dictionary');
  for (const [k, v] of Object.entries(COPY)) for (const l of LANGS) assert.ok(typeof v[l] === 'string' && (v[l] !== '' || k === 'c2.pathPre'), `${k} has no ${l}`);
  for (const [k, v] of Object.entries(COPY)) assert.deepEqual(Object.keys(v).sort(), [...LANGS].sort(), k);
  const scripted = [...js.matchAll(/\bt\('([^']+)'\)/g)].map(m => m[1]);
  for (const k of [...marked, ...scripted]) assert.ok(k in COPY, `${k} is not in COPY`);
  for (const k of Object.keys(COPY)) assert.ok(marked.includes(k) || scripted.includes(k), `${k} is never used`);
});

test('the Korean in the HTML is the Korean in the dictionary, so the page reads the same with or without its script', () => {
  const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const m of html.matchAll(/<(\w+)[^>]* data-i18n="([^"]+)"[^>]*>([^<]*)</g)) assert.equal(unesc(m[3]), COPY![m[2]].ko, m[2]);
  for (const m of html.matchAll(/(alt|aria-label|content)="([^"]*)" data-i18n-(?:alt|aria|content)="([^"]+)"/g)) assert.equal(unesc(m[2]), COPY![m[3]].ko, m[3]);
});

test('no visible words go untranslated except names, commands and the version', () => {
  const allowed = ['Mac · Apple Silicon', 'Mac · Intel', 'Claude Code', 'Codex', 'Aphrodite', 'GitHub', 'Kwak Seongjae', '2026', 'EN', '01', '02', '03', '©', '·'];
  const body = html.slice(html.indexOf('<body>'));
  const VOID = new Set(['img', 'br', 'meta', 'link', 'input', 'source']);
  const stack: boolean[] = [];
  const loose: string[] = [];
  for (const tok of body.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (tok.startsWith('</')) { stack.pop(); continue; }
    if (tok.startsWith('<')) {
      const name = tok.match(/^<(\w+)/)?.[1] ?? '';
      if (VOID.has(name) || tok.endsWith('/>')) continue;
      const skip = /data-i18n=|data-cmd|data-reason|data-year/.test(tok) || ['svg', 'script', 'noscript', 'code', 'path'].includes(name);
      stack.push(skip || stack.some(Boolean));
      continue;
    }
    if (stack.some(Boolean)) continue;
    let rest = tok.trim();
    for (const a of allowed) rest = rest.split(a).join('');
    if (rest.replace(/[\s.,]/g, '')) loose.push(tok.trim());
  }
  assert.deepEqual(loose, []);
});

test('commands are never translated, and the language a person picks is the landing’s own key, saved only when they press the toggle', () => {
  for (const m of html.matchAll(/<code data-cmd[^>]*>/g)) assert.ok(!/data-i18n/.test(m[0]));
  for (const v of Object.values(COPY!)) for (const l of LANGS) assert.ok(!/mcp add|git clone/.test(v[l]));
  assert.ok(read('../site/script.js').includes("'aphrodite.lang'"));
  assert.ok(js.includes("'aphrodite.lang'"));
  assert.equal([...js.matchAll(/localStorage\.setItem/g)].length, 1);
  assert.match(js, /toggle\.addEventListener\('click'[\s\S]{0,200}localStorage\.setItem/);
  assert.match(html, /<button class="lang" type="button" data-lang-toggle/);
});
