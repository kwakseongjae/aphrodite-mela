import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hidesAName, startsWithHeader} from '../src/page-clean';

/* 0.3-P3-fix2 O-1: in WebKit a page can put an element where the document's own names are (<form name="head"> is
   document.head). The cleaner is closed three ways, each held here on its own; scripts/lib/cleaner-matrix.mjs measures
   all three together in WebKit. */
const source = readFileSync(new URL('../src/page-clean.ts', import.meta.url), 'utf8');

test('outside the one block that takes the prototypes\' own getters, the cleaner reads no document or node directly', () => {
  const begin = source.indexOf('/* captured: begin'), end = source.indexOf('/* captured: end */');
  assert.ok(begin > 0 && end > begin, 'the block is marked');
  // Comments say what the page could do; what is checked is the code. The captured helpers are called as d.<name>.
  const outside = (source.slice(0, begin) + source.slice(end)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const direct = /(?<!\bd)\.(?:documentElement|head|body|querySelectorAll|querySelector|createElement|importNode|firstChild|lastChild|nextSibling|previousSibling|childNodes|children|nodeType|parentNode|parentElement|attributes|localName|namespaceURI|outerHTML|innerHTML|textContent|replaceChild|insertBefore|appendChild|removeChild|normalize|setAttribute|getAttribute|removeAttribute|hasAttribute|closest|prepend|append|cloneNode|parseFromString|content|implementation)\b/g;
  assert.deepEqual([...outside.matchAll(direct)].map(m => m[0]), [], 'every read goes through dom()');
});

test('a name the document or a form has of its own is taken off the element that would hide it, and only that', () => {
  const names = {documentNames: new Set(['head', 'documentElement', 'title', 'forms', 'querySelectorAll']), formNames: new Set(['action', 'elements', 'nextSibling', 'submit'])};
  for (const [tag, attribute, value, hides] of [
    ['form', 'name', 'head', true], ['form', 'name', 'documentElement', true], ['img', 'name', 'forms', true], ['form', 'id', 'title', true], ['embed', 'name', 'querySelectorAll', true],
    ['input', 'name', 'nextSibling', true], ['button', 'id', 'submit', true], ['select', 'name', 'action', true],
    ['h1', 'id', 'title', false], ['div', 'name', 'head', false], ['input', 'name', 'email', false], ['form', 'name', 'contact', false], ['img', 'alt', 'head', false],
  ] as const) assert.equal(hidesAName(tag, attribute, value, names), hides, `<${tag} ${attribute}="${value}">`);
});

test('a cleaned page must begin with exactly the header it was given', () => {
  const metas = '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="x"><meta http-equiv="x-dns-prefetch-control" content="off">';
  const html = '<html lang="ko">', head = '<head>';
  assert.equal(startsWithHeader('<!doctype html>' + html + head + metas + '<title>t</title></head><body></body></html>', html, head, metas), true);
  for (const bad of [
    '<!doctype html>' + html + head + '<title>t</title>' + metas,
    '<!doctype html>' + html + '<head><form name="head">' + metas,
    '<!doctype html><form name="documentElement"><p>words</p></form>',
    html + head + metas,
  ]) assert.equal(startsWithHeader(bad, html, head, metas), false, bad.slice(0, 80));
});
