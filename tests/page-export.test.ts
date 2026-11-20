import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportPage, staticPage, mediaPage, STATIC_PAGE_CSP, MAX_EXPORTED_PAGE} from '../src/page-export';

/**
 * 0.3-P3: a page sent as a file opens in someone else's browser, where the app's wall is not. By default it
 * goes without anything that runs or reaches out, read tag by tag (0.3-P2 lesson: replacing words broke a
 * script's `shadowRoot`), with a policy first in the file; with its scripts, it is the page as stored.
 */
const runs = [
  ['a script', '<p>a</p><script>alert(1)</script><p>b</p>', '<p>a</p><p>b</p>'],
  ['a script in capitals, with attributes', '<SCRIPT type="module" src=x.js></SCRIPT>ok', 'ok'],
  ['a script never closed', '<p>a</p><script>alert(1)', '<p>a</p>'],
  ['a script in a drawing', '<svg><script>alert(1)</script><circle r="2"/></svg>', '<svg><circle r="2"/></svg>'],
  ['an on… attribute', '<img src="media:x" onerror="alert(1)" alt="a">', '<img src="media:x" alt="a">'],
  ['an unquoted on… attribute', '<body onload=go()>hi', '<body>hi'],
  ['a javascript: address', '<a href="javascript:alert(1)">x</a>', '<a>x</a>'],
  ['one hidden by spaces, capitals and references', '<a href=" JaVa&#x53;cript&colon;alert(1)" title=t>x</a><a href="java\tscript:1">y</a>', '<a title=t>x</a><a>y</a>'],
  ['a form that runs', '<form action="javascript:go()"><button formaction="vbscript:x">b</button></form>', '<form><button>b</button></form>'],
  ['a frame written into an attribute', '<iframe srcdoc="<script>alert(1)</script>"></iframe>', '<iframe></iframe>'],
  ['a base address', '<base href="https://elsewhere.example/"><a href="x">x</a>', '<a href="x">x</a>'],
  ['a refresh', '<meta http-equiv="Refresh" content="0;url=https://elsewhere.example"><meta charset="utf-8">', '<meta charset="utf-8">'],
  ['a preconnect and a prefetch', '<link rel="preconnect" href="https://fonts.example"><LINK REL=dns-prefetch HREF=//x.example><link rel=stylesheet href="https://x.example/a.css">', ''],
  ['a tag the page never ends', '<p>a</p><img src=x onerror=alert(1)', '<p>a</p>'],
] as const;
for (const [what, html, expected] of runs) test(`a page goes out without ${what}`, () => assert.equal(staticPage(html), expected));

test('a link that names something written into the page itself stays', () => {
  const html = '<link rel="icon" href="data:image/png;base64,AAAA">';
  assert.equal(staticPage(html), html);
});

test('words that only look like a script are left exactly as written', () => {
  for (const html of [
    '<textarea><script>alert(1)</script><link rel=preconnect href=//x></textarea>',
    '<style>/* <script> */ a::after{content:"<link rel=preconnect href=//x> onload=go()"}</style>',
    '<p title="<script>x</script>" data-note="onclick=go()">onclick=go() is how a page would say it</p>',
    '<!-- <script>alert(1)</script> --><p>after</p>',
    '<title><script>alert(1)</script></title>',
    '<noscript><img src="media:x"></noscript>',
    '<p>javascript: a word</p><pre>&lt;script&gt;</pre>',
  ]) assert.equal(staticPage(html), html);
});

test('everything after a plaintext element is text', () => {
  const html = '<plaintext><script>alert(1)</script>';
  assert.equal(staticPage(html), html);
});

const sha = (n: number) => n.toString(16).padStart(64, '0');
const host = (files: Record<string, {mime: string; bytes: number}>) => {
  const read: string[] = [];
  return {read, host: {stat: async (s: string) => files[s], read: async (s: string) => { read.push(s); return files[s] ? new Uint8Array(files[s].bytes).fill(7) : undefined; }}};
};

test('the cleaned page says first that nothing runs or is fetched, before a character the page wrote', async () => {
  const {html} = await exportPage('<!-- x --><script>alert(1)</script><p>hi</p>', {scripts: false, videos: 'out'}, host({}).host);
  assert.ok(html.startsWith(`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${STATIC_PAGE_CSP}">`));
  assert.match(STATIC_PAGE_CSP, /script-src 'none'/);
  assert.match(STATIC_PAGE_CSP, /connect-src 'none'/);
  assert.ok(html.endsWith('<!-- x --><p>hi</p>'));
});

test('with its scripts the page is the one stored, its pictures put in and nothing else changed', async () => {
  const stored = `<script>class X extends HTMLElement{connectedCallback(){const shadowRoot=this.attachShadow({mode:'open'});shadowRoot.innerHTML='<b>hi</b>';}}customElements.define('x-x',X);</script><link rel=preconnect href=//fonts.example><x-x></x-x><img src="media:${sha(1)}">`;
  const {html, beside} = await exportPage(stored, {scripts: true, videos: 'out'}, host({[sha(1)]: {mime: 'image/png', bytes: 3}}).host);
  assert.equal(html, stored.replace(`media:${sha(1)}`, 'data:image/png;base64,BwcH'));
  assert.deepEqual(beside, []);
});

test('a picture goes in as data, a video beside it or not at all', async () => {
  const files = {[sha(1)]: {mime: 'image/png', bytes: 3}, [sha(2)]: {mime: 'video/mp4', bytes: 10}};
  const page = `<img src="media:${sha(1)}"><video src="media:${sha(2)}" controls></video><img src="media:${sha(3)}">`;
  const besideIt = await exportPage(page, {scripts: false, videos: 'beside'}, host(files).host);
  assert.ok(besideIt.html.includes('<img src="data:image/png;base64,BwcH">'));
  assert.ok(besideIt.html.includes(`<video src="media/${sha(2)}.mp4" controls>`));
  assert.ok(besideIt.html.includes(`media:${sha(3)}`), 'a file the board does not have is left as named');
  assert.deepEqual(besideIt.beside, [{path: `media/${sha(2)}.mp4`, sha: sha(2), bytes: 10}]);
  const without = await exportPage(page, {scripts: false, videos: 'out'}, host(files).host);
  assert.ok(without.html.includes('<video src="" controls>'));
  assert.deepEqual(without.beside, []);
});

test('a page too big with its pictures put in is refused before any picture is read', async () => {
  const big = host({[sha(1)]: {mime: 'image/png', bytes: 40_000_000}});
  await assert.rejects(exportPage(`<img src="media:${sha(1)}"><img src="media:${sha(1)}"><img src="media:${sha(1)}">`, {scripts: false, videos: 'out'}, big.host), /at most 100,000,000/);
  assert.deepEqual(big.read, []);
  assert.equal(MAX_EXPORTED_PAGE, 100_000_000);
});

test('the preview reads no file, and shows each picture by its size', async () => {
  const files = host({[sha(1)]: {mime: 'image/png', bytes: 3000}});
  const {html} = await exportPage(`<img src="media:${sha(1)}">`, {scripts: false, videos: 'out'}, files.host, {inline: false});
  assert.deepEqual(files.read, []);
  assert.ok(html.includes('data:image/png;base64,… (3 KB)'));
});

test('a media item goes out as a page holding it, its name escaped', () => {
  const page = mediaPage('a <b> & "c"', {src: `media:${sha(1)}`, mime: 'image/png', width: 10, height: 20});
  assert.ok(page.includes('<title>a &lt;b> &amp; "c"</title>'));
  assert.ok(page.includes(`<img alt="a &lt;b> &amp; &quot;c&quot;" width="10" height="20" src="media:${sha(1)}">`));
  assert.ok(mediaPage('v', {src: `media:${sha(2)}`, mime: 'video/mp4', width: 1, height: 1}).includes(`<video controls playsinline width="1" height="1" src="media:${sha(2)}"></video>`));
});
