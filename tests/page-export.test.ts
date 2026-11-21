import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync, strFromU8} from 'fflate';
import {framedDocument} from '../src/free-page';
import {exportPage, keepsAttribute, withDoctype, mediaPage, pageSource, pageDownload, STATIC_PAGE_CSP, MAX_EXPORTED_PAGE, MAX_EXPORT_FILE} from '../src/page-export';

/**
 * 0.3-P3: a page sent as a file opens in someone else's browser, where the app's wall is not. By default it
 * goes without anything that runs or reaches out, read tag by tag (0.3-P2 lesson: replacing words broke a
 * script's `shadowRoot`), with a policy first in the file; with its scripts, it is the page as stored.
 */
/* 0.3-P3-fix1 #1: the hand-written scanner is gone. Cleaning is the browser's parser and DOMPurify, run in the
   app's window (src/page-clean.ts) and measured end to end by verify:pages; what needs no browser is held here. */
test('an address stays only where it stays in the page, or is a link a person presses', () => {
  const sha = 'c'.repeat(64);
  for (const [tag, ns, name, value, keeps] of [
    ['a', 'html', 'href', 'https://example.com/', true], ['a', 'html', 'href', 'mailto:a@b.co', true], ['a', 'html', 'href', 'tel:+82-2-123-4567', true], ['a', 'html', 'href', 'page:p2', false], ['a', 'html', 'href', 'other.html', false], ['a', 'html', 'href', '#top', true],
    ['a', 'html', 'href', 'javascript:alert(1)', false], ['a', 'html', 'href', 'data:text/html,x', false], ['a', 'svg', 'xlink:href', 'https://x.example', true],
    ['img', 'html', 'src', 'https://x.example/a.png', false], ['img', 'html', 'src', 'media:' + sha, true], ['img', 'html', 'src', 'data:image/png;base64,AA', true],
    ['img', 'html', 'src', 'data:text/html,x', false], ['video', 'html', 'poster', 'data:image/png;base64,AA', true], ['use', 'svg', 'href', '#part', true],
    ['use', 'svg', 'href', 'https://x.example/a.svg#i', false], ['image', 'svg', 'href', 'https://x.example/a.png', false], ['blockquote', 'html', 'cite', 'https://x.example', false],
    ['div', 'html', 'style', 'color:red;background:url(https://x.example/a)', false], ['div', 'html', 'style', 'background:url(#g)', true], ['div', 'html', 'style', 'background:url("data:image/png;base64,AA")', true],
    ['rect', 'svg', 'fill', 'url(https://x.example/a#g)', false], ['rect', 'svg', 'fill', 'url(#g)', true], ['rect', 'svg', 'filter', 'url(//x.example/f)', false],
    ['p', 'html', 'onclick', 'go()', false], ['a', 'html', 'ping', 'https://x.example', false], ['iframe', 'html', 'srcdoc', '<p>x</p>', false], ['p', 'html', 'title', 'javascript: a word', true],
  ] as const) assert.equal(keepsAttribute(tag, ns, name, value), keeps, `<${tag} ${name}="${value}">`);
});

test('without a browser a page is not cleaned at all, and nothing weaker stands in', async () => {
  await assert.rejects(exportPage('<p>hi</p><script>x</script>', {scripts: false, videos: 'out'}, host({}).host), /cleaned in the app's window/);
});

test('a page with no doctype, or another, is sent with the one the board draws it with', () => {
  assert.equal(withDoctype('<p>x</p>'), '<!doctype html><p>x</p>');
  assert.equal(withDoctype('<!DOCTYPE html><p>x</p>'), '<!DOCTYPE html><p>x</p>');
  assert.equal(withDoctype('<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p>x</p>'), '<!doctype html><!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p>x</p>');
});

const sha = (n: number) => n.toString(16).padStart(64, '0');
const host = (files: Record<string, {mime: string; bytes: number}>) => {
  const read: string[] = [];
  return {read, host: {stat: async (s: string) => files[s], read: async (s: string) => { read.push(s); return files[s] ? new Uint8Array(files[s].bytes).fill(7) : undefined; }}};
};

test('with its scripts the page is the one stored, its pictures put in and nothing else changed', async () => {
  const stored = `<script>class X extends HTMLElement{connectedCallback(){const shadowRoot=this.attachShadow({mode:'open'});shadowRoot.innerHTML='<b>hi</b>';}}customElements.define('x-x',X);</script><link rel=preconnect href=//fonts.example><x-x></x-x><img src="media:${sha(1)}">`;
  const {html, beside} = await exportPage(stored, {scripts: true, videos: 'out'}, host({[sha(1)]: {mime: 'image/png', bytes: 3}}).host);
  assert.equal(html, '<!doctype html>' + stored.replace(`media:${sha(1)}`, 'data:image/png;base64,BwcH'), 'the doctype the board draws it with, its picture, and nothing else');
  assert.deepEqual(beside, []);
});

/* 0.3-P3-fix2 #10: the file shows what the board shows. The board's frame puts an address wherever the page says
   media:<sha256> (in a picture, in words, in a script), and so does the file, each time counted in its size. */
test('with its scripts a board file is put in at every place the board puts it, a picture, words and a script alike', async () => {
  const page = `<p>The file media:${sha(1)} in words.</p><img src="media:${sha(1)}"><script>const s = 'media:${sha(1)}';</script><img src="media:${sha(9)}">`;
  const {html} = await exportPage(page, {scripts: true, videos: 'out'}, host({[sha(1)]: {mime: 'image/png', bytes: 3}}).host);
  // The board given the same address for the file: its frame ends with what the file holds after the doctype.
  const board = framedDocument(page, {media: s => s === sha(1) ? 'data:image/png;base64,BwcH' : undefined, origins: []});
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(board.endsWith(html.slice('<!doctype html>'.length)), 'the same places as the board');
  assert.equal(html.split('data:image/png;base64,BwcH').length - 1, 3);
  assert.ok(html.includes(`media:${sha(9)}`), 'a file this Mac does not have keeps its name');
  const many = host({[sha(1)]: {mime: 'image/png', bytes: 30_000_000}});
  await assert.rejects(exportPage(`<p>media:${sha(1)} media:${sha(1)}</p><img src="media:${sha(1)}">`, {scripts: true, videos: 'out'}, many.host), /at most 100,000,000/, 'each time it is said is counted');
});

test('a picture goes in as data, a video beside it or not at all', async () => {
  const files = {[sha(1)]: {mime: 'image/png', bytes: 3}, [sha(2)]: {mime: 'video/mp4', bytes: 10}};
  const page = `<img src="media:${sha(1)}"><video src="media:${sha(2)}" controls></video><img src="media:${sha(3)}">`;
  const besideIt = await exportPage(page, {scripts: true, videos: 'beside'}, host(files).host);
  assert.ok(besideIt.html.includes('<img src="data:image/png;base64,BwcH">'));
  assert.ok(besideIt.html.includes(`<video src="media/${sha(2)}.mp4" controls>`));
  assert.ok(besideIt.html.includes(`media:${sha(3)}`), 'a file the board does not have is left as named');
  assert.deepEqual(besideIt.beside, [{path: `media/${sha(2)}.mp4`, sha: sha(2), bytes: 10}]);
  const without = await exportPage(page, {scripts: true, videos: 'out'}, host(files).host);
  assert.ok(without.html.includes(`<video src="media:${sha(2)}" controls>`), 'a video left behind keeps its name, which loads nothing');
  assert.deepEqual(without.beside, []);
});

test('a page too big with its pictures put in is refused before any picture is read', async () => {
  const big = host({[sha(1)]: {mime: 'image/png', bytes: 40_000_000}});
  await assert.rejects(exportPage(`<img src="media:${sha(1)}"><img src="media:${sha(1)}"><img src="media:${sha(1)}">`, {scripts: true, videos: 'out'}, big.host), /at most 100,000,000/);
  assert.deepEqual(big.read, []);
  assert.equal(MAX_EXPORTED_PAGE, 100_000_000);
});

test('the preview reads no file, and shows each picture by its size', async () => {
  const files = host({[sha(1)]: {mime: 'image/png', bytes: 3000}});
  const {html} = await exportPage(`<img src="media:${sha(1)}">`, {scripts: true, videos: 'out'}, files.host, {inline: false});
  assert.deepEqual(files.read, []);
  assert.ok(html.includes('data:image/png;base64,… (3 KB)'));
});

test('a media item goes out as a page holding it, its name escaped', () => {
  const page = mediaPage('a <b> & "c"', {src: `media:${sha(1)}`, mime: 'image/png', width: 10, height: 20});
  assert.ok(page.includes('<title>a &lt;b> &amp; "c"</title>'));
  assert.ok(page.includes(`<img alt="a &lt;b> &amp; &quot;c&quot;" width="10" height="20" src="media:${sha(1)}">`));
  assert.ok(mediaPage('v', {src: `media:${sha(2)}`, mime: 'video/mp4', width: 1, height: 1}).includes(`<video controls playsinline width="1" height="1" src="media:${sha(2)}"></video>`));
});

test('an html page goes out from its own document, a media item from a page holding it, a section page from neither', () => {
  assert.equal(pageSource({name: 'p', kind: 'html', html: '<p>mine</p>'}), '<p>mine</p>');
  assert.ok(pageSource({name: 'm', kind: 'media', media: {src: `media:${sha(1)}`, mime: 'image/png', width: 1, height: 1}}).includes(`src="media:${sha(1)}"`));
  assert.equal(pageSource({name: 's'}), '');
});

test('a page with videos beside it goes out as a zip of the page and its videos, measured before a video is read', async () => {
  const files = host({[sha(2)]: {mime: 'video/mp4', bytes: 10}});
  const out = await exportPage(`<video src="media:${sha(2)}"></video>`, {scripts: true, videos: 'beside'}, files.host);
  const zip = await pageDownload(out, 'launch', files.host);
  assert.equal(zip.name, 'launch.zip');
  const inside = unzipSync(zip.bytes);
  assert.deepEqual(Object.keys(inside).sort(), ['launch.html', `media/${sha(2)}.mp4`]);
  assert.deepEqual([...inside['launch.html'].subarray(0, 3)], [0xef, 0xbb, 0xbf], 'the text is marked UTF-8');
  const alone = await pageDownload({html: '<p>é</p>', beside: []}, 'p', files.host);
  assert.deepEqual([alone.name, alone.mime], ['p.html', 'text/html']);
  const reads = files.read.length;
  await assert.rejects(pageDownload({html: '', beside: [{path: 'media/a.mp4', sha: sha(2), bytes: MAX_EXPORT_FILE}]}, 'p', files.host), /at most 1,073,741,824/);
  assert.equal(files.read.length, reads, 'nothing is read for a zip too big to write');
});
