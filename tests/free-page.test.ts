/**
 * 0.3-P1: a free page holds an HTML document instead of sections, and a media item points at a file on
 * the board. The checks for both live in one module (src/free-page.ts), apart from the 20,000-character
 * cap every other string in a project is held to.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, parseProject, makeBlock, type Project} from '../src/model.ts';
import {MAX_PAGE_HTML, htmlProblem, pageText, htmlWindow, isFreePage} from '../src/free-page.ts';

const SHA = 'a'.repeat(64);
const withPage = (page: Record<string, unknown>): string => {
  const p = initialProject() as Project & {pages: unknown[]};
  p.pages.push({id: 'free-1', name: 'Briefing', blocks: [], ...page});
  return JSON.stringify(p);
};

test('an html page up to 2MB opens, past the cap every other string is held to', () => {
  const html = '<!doctype html><p>' + 'x'.repeat(MAX_PAGE_HTML - 30) + '</p>';
  assert.ok(html.length <= MAX_PAGE_HTML && html.length > 20_000);
  const p = parseProject(withPage({kind: 'html', html}));
  const page = p.pages.find(x => x.id === 'free-1')!;
  assert.equal(page.html, html);
  assert.ok(isFreePage(page));
  assert.ok(!isFreePage(p.pages[0]), 'a section page is not a free page');
});

test('a page that breaks the free-page rules is refused', () => {
  for (const [why, page] of [
    ['html past 2MB', {kind: 'html', html: 'x'.repeat(MAX_PAGE_HTML + 1)}],
    ['an html page without html', {kind: 'html'}],
    ['html on a section page', {html: '<p>hi</p>'}],
    ['an unknown kind', {kind: 'canvas', html: '<p>hi</p>'}],
    ['sections on an html page', {kind: 'html', html: '<p>hi</p>', blocks: [makeBlock('hero')]}],
    ['media on an html page', {kind: 'html', html: '<p>hi</p>', media: {src: `media:${SHA}`, mime: 'image/png', width: 10, height: 10}}],
    ['a media item that names a path', {kind: 'media', media: {src: '/Users/someone/clip.mp4', mime: 'video/mp4', width: 10, height: 10}}],
    ['a media item with a short hash', {kind: 'media', media: {src: 'media:abc', mime: 'video/mp4', width: 10, height: 10}}],
    ['a media item of an unknown type', {kind: 'media', media: {src: `media:${SHA}`, mime: 'text/html', width: 10, height: 10}}],
    ['a media item without a size', {kind: 'media', media: {src: `media:${SHA}`, mime: 'image/png'}}],
    ['a media item with a negative duration', {kind: 'media', media: {src: `media:${SHA}`, mime: 'video/mp4', width: 640, height: 360, duration: -1}}],
  ] as const) assert.throws(() => parseProject(withPage(page as Record<string, unknown>)), Error, why);
});

test('a copied project keeps its html pages and their text-diff history, and opens', async () => {
  const {cloneProject} = await import('../src/workspace/library.ts');
  const {begin, end, newHistory} = await import('../src/ledger/session.ts');
  const p = parseProject(withPage({kind: 'html', html: '<p>one</p>\n<p>two</p>\n'.repeat(200)}));
  const history = newHistory(p);
  const before = begin(p, history);
  p.pages[1].html = p.pages[1].html!.replace('<p>two</p>', '<p>three</p>');
  end(p, before, {author: {kind: 'person', name: 'you'}, source: 'editor:change'}, history);
  const copy = cloneProject(p);
  assert.equal(copy.pages[1].html, p.pages[1].html);
  assert.deepEqual(copy.ledger?.changes.map(c => c.ops[0].op), ['text']);
  assert.doesNotThrow(() => parseProject(JSON.stringify(copy)));
});

test('a media item is a hash, a type and a size', () => {
  const p = parseProject(withPage({kind: 'media', media: {src: `media:${SHA}`, mime: 'video/mp4', width: 640, height: 360, duration: 5.2}}));
  const page = p.pages.find(x => x.id === 'free-1')!;
  assert.deepEqual(page.media, {src: `media:${SHA}`, mime: 'video/mp4', width: 640, height: 360, duration: 5.2});
});

test('stored html names no path on this machine: pictures are media:<hash>, pages page:<id>', () => {
  assert.equal(htmlProblem(`<img src="media:${SHA}"><a href="page:free-2">next</a><a href="#top">top</a>`), undefined);
  assert.equal(htmlProblem('<p>The file is at file:///Users/someone/notes.txt, as text.</p>'), undefined, 'words about a path are words');
  for (const bad of [
    '<img src="file:///Users/someone/shot.png">',
    "<video poster='asset://localhost/x.png'></video>",
    '<img src="http://asset.localhost/Users/someone/a.png">',
    '<div style="background:url(file:///tmp/a.png)"></div>',
    '<style>body{background:url( "asset://localhost/b.png" )}</style>',
    '<img srcset="small.png 1x, file:///Users/a/big.png 2x">',
  ]) assert.match(htmlProblem(bad) ?? '', /media:/, bad);
  assert.match(htmlProblem('x'.repeat(MAX_PAGE_HTML + 1)) ?? '', /2,000,000/);
});

test('the words of a page, without its scripts and styles', () => {
  const text = pageText('<html><head><style>p{color:red}</style><script>alert(1)</script></head><body><h1>Q3 &amp; next</h1><p>One <b>bold</b> line.</p><ul><li>First</li><li>Second</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>');
  assert.equal(text, '# Q3 & next\n\nOne bold line.\n\n- First\n\n- Second\n\n| A | B |\n\n| 1 | 2 |\n');
  assert.doesNotMatch(text, /alert|color/);
  assert.equal(pageText(`<div style="${'color:red;'.repeat(400)}">Long style</div><p>a < b</p>`), 'Long style\n\na < b\n', 'a long tag is a tag, and a lone < is a character');
  assert.equal(pageText('<p title="1 > 0">Hello</p>'), 'Hello\n', 'a > inside quotes does not end the tag');
  assert.equal(pageText("<p data-x='a>b' title=\"c>'d\">Hi</p><p>Next</p>"), 'Hi\n\nNext\n');
});

test('reading the words of a 2MB page takes one pass, however its tags are left open', () => {
  for (const [what, html] of [
    ['rows never closed', '<table>' + '<tr><td>cell'.repeat(150_000)],
    ['a comment never closed', '<p>start</p><!--' + 'x'.repeat(1_900_000)],
    ['scripts never closed', '<script>'.repeat(200_000)],
    ['headings never closed', '<h2>title'.repeat(180_000)],
    ['tags that never end', '<p>text</p>' + '<a'.repeat(900_000)],
    ['quotes that never close', '<p>text</p>' + '<a title="x>'.repeat(150_000)],
  ] as const) {
    const t0 = performance.now();
    pageText(html);
    assert.ok(performance.now() - t0 < 1_500, `${what}: ${Math.round(performance.now() - t0)}ms`);
  }
});

test('a window onto a long page says where it is and whether there is more', () => {
  const html = 'abcdefghij'.repeat(10);
  assert.deepEqual(htmlWindow(html), {start: 0, end: 100, length: 100, more: false, html});
  assert.deepEqual(htmlWindow(html, {start: 10, end: 20}), {start: 10, end: 20, length: 100, more: true, html: 'abcdefghij'});
  assert.deepEqual(htmlWindow(html, {start: 95}), {start: 95, end: 100, length: 100, more: false, html: 'fghij'});
  assert.equal(htmlWindow(html, {start: 0}, 30).end, 30, 'a window is bounded');
  assert.equal(htmlWindow(html, {start: 0}, 30).more, true);
});
