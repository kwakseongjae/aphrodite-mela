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
  const read = 'documentElement|head|body|querySelectorAll|querySelector|createElement|importNode|firstChild|lastChild|nextSibling|previousSibling|childNodes|children|nodeType|parentNode|parentElement|attributes|localName|namespaceURI|outerHTML|innerHTML|textContent|data|nodeValue|replaceChild|insertBefore|appendChild|removeChild|normalize|setAttribute|getAttribute|removeAttribute|hasAttribute|closest|prepend|append|cloneNode|parseFromString|content|implementation';
  // A read as .name, or in brackets as ['name'] (0.3-P3-fix3 #9): a.value, data.attrName and the like are DOMPurify's own records, not nodes.
  const direct = new RegExp(`(?<!\\b(?:d|data|a))\\.(?:${read})\\b|\\[\\s*['"\`](?:${read})['"\`]\\s*\\]`, 'g');
  assert.deepEqual([...outside.matchAll(direct)].map(m => m[0]), [], 'every read goes through dom()');
  for (const slip of ['node.data', 'el["firstChild"]', "doc['head']"]) assert.ok(new RegExp(direct.source).test(slip), `the scan sees ${slip}`);
});

test('a name the document or a form has of its own is taken off the element that would hide it, and only that', () => {
  const names = {documentNames: new Set(['head', 'documentElement', 'title', 'forms', 'querySelectorAll']), formNames: new Set(['action', 'elements', 'nextSibling', 'submit'])};
  for (const [tag, attribute, value, hides] of [
    ['form', 'name', 'head', true], ['form', 'name', 'documentElement', true], ['img', 'name', 'forms', true], ['embed', 'name', 'querySelectorAll', true], ['object', 'id', 'title', true],
    ['input', 'name', 'nextSibling', true], ['button', 'id', 'submit', true], ['select', 'name', 'action', true],
    ['h1', 'id', 'title', false], ['div', 'name', 'head', false], ['input', 'name', 'email', false], ['form', 'name', 'contact', false], ['img', 'alt', 'head', false],
    // 0.3-P3-fix3 #9: an id the document does not show by stays, so a link to it still goes there.
    ['form', 'id', 'title', false],
  ] as const) assert.equal(hidesAName(tag, attribute, value, names), hides, `<${tag} ${attribute}="${value}">`);
  assert.equal(hidesAName('img', 'id', 'title', names, {owned: false, named: false}), false, 'an img with no name keeps its id');
  assert.equal(hidesAName('img', 'id', 'title', names, {owned: false, named: true}), true, 'one with a name too does not');
  assert.equal(hidesAName('input', 'id', 'submit', names, {owned: false, named: false}), false, 'a control no form owns keeps its id');
  assert.equal(hidesAName('input', 'name', 'submit', names, {owned: true, named: true}), true, 'one a form owns does not');
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

/* 0.3-R ⑦ (P3 third review L-1): a page's own element may not be named like the stand-in an export puts where a file goes,
   or the stand-in, put in its name after the check, would make markup no check saw. */
test('a custom element named like an export\'s stand-in for a file is not kept', async () => {
  const {CLEAN_CONFIG} = await import('../src/page-clean') as unknown as {CLEAN_CONFIG?: {CUSTOM_ELEMENT_HANDLING: {tagNameCheck: RegExp}}};
  assert.ok(CLEAN_CONFIG, 'page-clean.ts exports its configuration');
  const check = CLEAN_CONFIG!.CUSTOM_ELEMENT_HANDLING.tagNameCheck;
  assert.equal(check.test(`aphrodite-media-0123456789abcdef-${'a'.repeat(64)}`), false);
  assert.equal(check.test('aphrodite-media-x'), false);
  for (const ok of ['my-card', 'x-y', 'aphrodite-card']) assert.equal(check.test(ok), true, ok);
});

/* 0.3-R ⑦ (P3 third review L-2): inside the captured block too, each helper reads a node only through a getter, setter
   or method taken off a prototype (fn.<name>.call), so a read like d => d.head, const {head} = doc or Reflect.get(doc,
   'head') put back there is seen. */
test('inside the captured block every helper reads through the prototypes\' own functions, never the node itself', () => {
  const begin = source.indexOf('/* captured: begin'), end = source.indexOf('/* captured: end */');
  const block = source.slice(begin, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const helpers = block.slice(block.indexOf('return {', block.indexOf('function capture()')));
  const bodies = [...helpers.matchAll(/^\s{4}(\w+): \(([^)]*)\) => (.*),$/gm)];
  assert.ok(bodies.length >= 25, `the helpers are read (${bodies.length})`);
  for (const [, name, , body] of bodies) {
    assert.ok(/fn\.\w+\.call\(/.test(body), `${name} reads through fn.<name>.call`);
    const outsideCalls = body.replace(/fn\.\w+\.call\([^;]*?\)/g, '').replace(/new DOMParser\(\)/g, '');
    assert.doesNotMatch(outsideCalls, /\b[a-z]\.(?:head|documentElement|body|firstChild|nextSibling|parentNode|attributes|textContent|data|querySelectorAll)\b|Reflect\.|\{\s*(?:head|body|documentElement)\s*\}\s*=/, `${name} reads nothing directly`);
  }
  for (const slip of ['    head: (d: Document) => d.head,', '    root: (d: Document) => Reflect.get(d, \'documentElement\'),']) {
    const m = /^\s{4}(\w+): \(([^)]*)\) => (.*),$/m.exec(slip)!;
    assert.ok(!/fn\.\w+\.call\(/.test(m[3]), `the check sees ${slip.trim()}`);
  }
});
