/**
 * The internal preview download page (site/preview): the words are copy.md’s, letter for letter, in both
 * languages; it is a page only people who know the address reach; it never offers a download address before the release
 * says it is there; and it reaches no host outside a short list.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../site/preview/index.html');
const js = read('../site/preview/preview.js');
const css = read('../site/preview/preview.css');

/* The landing describes the released 0.2.4 and changes its words in 0.3-6, not here. L6 changed only its fonts (the <head> and styles.css).
   When the body or the script is changed on purpose, put the new sums here: the body is site/index.html from </head> on. */
const LANDING_BODY = '63037adfabd5ab1bf13d71d8e511306c5afdc1c692048f9a76b9aea3178c0bbf';
const LANDING_SCRIPT = '9c230d509bf3da24bb3f1d4e3e67c01c526656902d63767d4dfb5ffc3d56a2d2';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

test('the public landing never links or names the preview page, and its words and script are what they were', () => {
  for (const f of ['index.html', 'script.js', 'styles.css']) assert.ok(!/preview\//i.test(read('../site/' + f)), `site/${f} mentions the preview page`);
  const landing = read('../site/index.html');
  assert.equal(sha(landing.slice(landing.indexOf('</head>'))), LANDING_BODY, 'the landing body changed');
  assert.equal(sha(read('../site/script.js')), LANDING_SCRIPT, 'the landing script changed');
});

test('the landing draws Hangul in web fonts and never slants it', () => {
  const landing = read('../site/index.html'), styles = read('../site/styles.css');
  assert.match(landing, /family=Noto\+Serif\+KR/);
  assert.match(landing, /pretendardvariable-dynamic-subset\.min\.css/);
  assert.match(styles, /--serif:"Fraunces","Noto Serif KR"/);
  assert.match(styles, /--sans:"Geist","Pretendard Variable"/);
  assert.match(styles, /font-synthesis-style:none/);
  assert.match(styles, /:lang\(ko\) \.hero h1 em,:lang\(ko\) \.story-body \.pull\{font-style:normal\}/);
});

test('the preview page is kept out of search, in Korean, and never slants Hangul', () => {
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<html lang="ko">/);
  assert.ok(!/src="\.\.\/script\.js"/.test(html), 'the landing script would point the buttons at the public release');
  assert.match(css, /font-synthesis-style:none/);
  // every italic rule is scoped to English
  for (const m of css.matchAll(/([^{}]+)\{[^}]*font-style:italic[^}]*\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@font-face')) continue;
    assert.ok(sel.split(',').every(s => s.trim().startsWith(':lang(en)')), `italic outside English: ${sel}`);
  }
});

test('every picture the page names is there', () => {
  const srcs = [...html.matchAll(/<img[^>]* src="([^"]+)"/g), ...html.matchAll(/ srcset="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.length >= 8);
  for (const s of srcs) assert.ok(existsSync(new URL('../site/preview/' + s, import.meta.url)), s);
});

test('the page reaches no host outside the list', () => {
  const ALLOWED = [
    /^https:\/\/fonts\.googleapis\.com(\/css2\?.*)?$/, /^https:\/\/fonts\.gstatic\.com$/,
    /^https:\/\/cdn\.jsdelivr\.net(\/gh\/orioncactus\/pretendard@v1\.3\.9\/dist\/web\/variable\/pretendardvariable-dynamic-subset\.min\.css)?$/,
    /^https:\/\/github\.com\/kwakseongjae\/aphrodite-mela(\.git|\/releases|\/issues|\/blob\/main\/THIRD_PARTY_NOTICES\.md)?\/?$/,
    /^https:\/\/github\.com\/$/, /^https:\/\/api\.github\.com\/repos\/$/,
    /^https:\/\/kwakseongjae\.github\.io\/aphrodite-mela\/assets\/og\.png$/,
  ];
  const urls = [...(html + js + css).matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => m[0].replace(/&amp;/g, '&'));
  assert.ok(urls.length > 0);
  for (const u of urls) assert.ok(ALLOWED.some(r => r.test(u)), u);
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
  assert.ok(dl.filter(m => m[1] === 'arm').length >= 3, 'the hero, the row and the closing button');
  assert.ok(dl.some(m => m[1] === 'intel'));
  for (const m of dl) assert.ok(!/ href=/.test(m[0]), m[0]);
  const notes = html.match(/<a [^>]*data-notes[^>]*>/);
  assert.ok(notes && / hidden/.test(notes[0]) && !/ href=/.test(notes[0]), 'the release notes link ships hidden, with no address');
});

test('every command on the page is one the README already publishes, letter for letter, and points at the MCP server that is there', () => {
  const published = read('../README.md') + read('../mcp/aphrodite-mcp/README.md');
  const cmds = [...html.matchAll(/<code data-cmd>([^<]+)<\/code>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  assert.equal(cmds.length, 3);
  for (const c of cmds) assert.ok(published.includes(c), c);
  for (const c of cmds.filter(c => c.includes('mcp add'))) assert.ok(existsSync(new URL('../' + c.split('/path/to/aphrodite-mela/')[1], import.meta.url)), c);
});

test('the page leads to its own parts', () => {
  for (const id of ['get', 'connect', 'not']) {
    assert.match(html, new RegExp(`<a [^>]*href="#${id}"`), `the nav leads to #${id}`);
    assert.match(html, new RegExp(` id="${id}"`), `#${id} is on the page`);
  }
});

/* The page's words: the HTML carries the Korean, preview.js carries every language by key. */
const COPY = runInNewContext('(' + (js.match(/var COPY = (\{[\s\S]*?\n  \});/) ?? ['', 'null'])[1] + ')') as Record<string, Record<string, string>> | null;
const LANGS = ['ko', 'en'];
const marked = [...html.matchAll(/data-i18n(?:-alt|-aria|-content)?="([^"]+)"/g)].map(m => m[1]);

test('every key the page or its script uses has every language, and no key goes unused', () => {
  assert.ok(COPY, 'preview.js has a COPY dictionary');
  for (const [k, v] of Object.entries(COPY)) for (const l of LANGS) assert.ok(typeof v[l] === 'string' && (v[l] !== '' || k === 'cmd.pathPre'), `${k} has no ${l}`);
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

/* The page's words as copy.md writes them: Korean under "## 한국어", English under "## English", the same sections in each. */
const copyMd = read('../site/preview/copy.md');
function field(text: string, label: string) { const m = text.match(new RegExp('\\*\\*' + label.replace(/[()]/g, '\\$&') + '\\*\\* ([^\\n]+)')); assert.ok(m, label); return m[1].trim(); }
function section(text: string, head: string) { const i = text.indexOf('### ' + head); assert.ok(i >= 0, head); const j = text.indexOf('\n### ', i + 4); const k = text.indexOf('\n## ', i + 4); return text.slice(i, Math.min(...[j, k].filter(x => x > 0), text.length)); }
const items = (text: string) => [...text.matchAll(/^\d\. \*\*(.+?)\*\* (.+)$/gm)].map(m => [m[1], m[2]]);
const bullets = (text: string) => [...text.matchAll(/^- (.+)$/gm)].map(m => m[1]);
const w = (k: string, l: 'ko' | 'en') => COPY![k][l];
const LABELS = {
  ko: {part: '## 한국어', first: '첫 화면', eyebrow: '눈썹 줄', headline: '제목', sub: '부제목', button: '단추', small: '(작게)', why: '왜', title: '제목', body: '본문', body2: '본문 둘째 문단', feats: '기능', start: '시작하는 법', not: '아직 안 되는 것', closing: '맺음 제목'},
  en: {part: '## English', first: 'First screen', eyebrow: 'Eyebrow', headline: 'Headline', sub: 'Sub', button: 'Button', small: '(small)', why: 'Why', title: 'Title', body: 'Body', body2: 'Body, second paragraph', feats: 'Features', start: 'Getting started', not: 'Not yet', closing: 'Closing'},
};

for (const l of ['ko', 'en'] as const) test(`the ${l === 'ko' ? 'Korean' : 'English'} on the page is copy.md’s, letter for letter`, () => {
  const L = LABELS[l];
  const i = copyMd.indexOf(L.part); assert.ok(i >= 0, L.part);
  const j = copyMd.indexOf('\n## ', i + 3);
  const doc = copyMd.slice(i, j > 0 ? j : copyMd.length);
  const hero = section(doc, L.first);
  assert.equal(w('hero.eyebrow', l), field(hero, L.eyebrow));
  assert.equal(w('hero.h1a', l) + ' / ' + w('hero.h1b', l) + ' ' + w('hero.gold', l), field(hero, L.headline));
  assert.equal(w('hero.sub1', l) + ' ' + w('hero.sub2', l), field(hero, L.sub));
  assert.equal(w('dl.cta', l) + ' · ' + L.small + ' ' + w('dl.small', l), field(hero, L.button));
  const why = section(doc, L.why);
  assert.equal(w('why.h2', l), field(why, L.title));
  assert.equal(w('why.p1', l), field(why, L.body));
  assert.equal(w('why.p2', l), field(why, L.body2));
  const feats = items(section(doc, L.feats));
  assert.equal(feats.length, 6);
  feats.forEach(([h, p], n) => { assert.equal(w(`f${n + 1}.h`, l), h); assert.equal(w(`f${n + 1}.p`, l), p); });
  const start = section(doc, L.start);
  assert.equal(w('start.h2', l), field(start, L.title));
  assert.equal(items(start).length, 3);
  items(start).forEach(([h, p], n) => { assert.equal(w(`s${n + 1}.h`, l), h); assert.equal(w(`s${n + 1}.p`, l), p); });
  const not = section(doc, L.not);
  assert.equal(w('not.h2', l), field(not, L.title));
  assert.deepEqual([1, 2, 3].map(n => w(`not.${n}`, l)), bullets(not));
  assert.equal(w('close.h2', l), field(not, L.closing));
});

test('the line under the first picture waits for a real screen', () => {
  assert.ok(!Object.values(COPY!).some(v => /Claude Code가 만들었어요/.test(v.ko)));
});

test('no visible words go untranslated except names, commands and the year', () => {
  const allowed = ['Mac · Apple Silicon', 'Mac · Intel', 'Claude Code', 'Codex', 'GitHub', 'Kwak Seongjae', '2026', 'EN', '01', '02', '03', '04', '05', '06', '©', '·'];
  const body = html.slice(html.indexOf('<body>'));
  const VOID = new Set(['img', 'br', 'meta', 'link', 'input', 'source']);
  const stack: boolean[] = [];
  const loose: string[] = [];
  for (const tok of body.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (tok.startsWith('</')) { stack.pop(); continue; }
    if (tok.startsWith('<')) {
      const name = tok.match(/^<(\w+)/)?.[1] ?? '';
      if (VOID.has(name) || tok.endsWith('/>')) continue;
      const skip = /data-i18n=|data-cmd|data-reason|data-year/.test(tok) || ['svg', 'script', 'noscript', 'code', 'path', 'style'].includes(name);
      stack.push(skip || stack.some(Boolean));
      continue;
    }
    if (stack.some(Boolean)) continue;
    let rest = tok.trim();
    for (const a of allowed) rest = rest.split(a).join('');
    if (rest.replace(/[\s.,0-9]/g, '')) loose.push(tok.trim());
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
