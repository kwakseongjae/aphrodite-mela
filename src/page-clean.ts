/**
 * A page made safe to open in someone else's browser (0.3-P3-fix1): read by the browser's own parser, cleaned by
 * DOMPurify to a list of what may stay, narrowed by our rules (src/page-export.ts), written out, and read once more
 * to see it comes back the same. A page whose cleaned copy reads back differently is not sent at all: a difference
 * means two browsers could read it two ways. Only the app's window has a parser, so this runs there and nowhere else;
 * without one it throws rather than fall back to anything weaker.
 *
 * The page is not trusted to leave the document's own names alone (0.3-P3-fix2 O-1). In WebKit, `<form name="head">`
 * makes `doc.head` that form, and `<input name="nextSibling">` hides what follows its form from a walk. So: every
 * read of the document and its nodes goes through the prototypes' own getters and functions, taken once (dom());
 * an element the document or a form exposes by its name or id loses that name when it is one of theirs; and the
 * written page must begin with exactly the header we put on it, and read back with our three meta first in its head.
 */
import createDOMPurify, {type Config, type DOMPurify} from 'dompurify';
import {CLEAN_FORBID_TAGS, CLEAN_FORBID_ATTR, keepsAttribute, STATIC_PAGE_CSP} from './page-export';

const CONFIG: Config = {
  WHOLE_DOCUMENT: true,
  RETURN_DOM: true,
  USE_PROFILES: {html: true, svg: true, svgFilters: true},
  // An internal <use href="#…"> draws a part of the same drawing; keepsAttribute lets nothing else stay on it.
  ADD_TAGS: ['use'],
  FORBID_TAGS: CLEAN_FORBID_TAGS,
  FORBID_ATTR: CLEAN_FORBID_ATTR,
  ADD_FORBID_CONTENTS: ['object', 'embed', 'applet', 'frameset', 'frame', 'listing', 'portal', 'fencedframe'],
  // DOMPurify's own list of addresses, with a board file's media: added: keepsAttribute narrows it further.
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|media):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  // DOMPurify's SANITIZE_DOM drops every id or name the app's own document has, a heading's id="title" a link goes to
  // included. Ours is narrower (the hook below): only a name the document or a form would expose, as one of its own.
  SANITIZE_DOM: false,
  CUSTOM_ELEMENT_HANDLING: {tagNameCheck: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/, attributeNameCheck: /^(?!on)[a-z][a-z0-9-]*$/, allowCustomizedBuiltInElements: false},
};

/* captured: begin — the only place a document or a node is read or changed directly. */
const getter = (proto: object, name: string) => { const d = Object.getOwnPropertyDescriptor(proto, name); if (!d?.get) throw new Error(`no ${name} getter`); return d.get; };
const setter = (proto: object, name: string) => { const d = Object.getOwnPropertyDescriptor(proto, name); if (!d?.set) throw new Error(`no ${name} setter`); return d.set; };
const method = (proto: object, name: string) => { const f = (proto as Record<string, unknown>)[name]; if (typeof f !== 'function') throw new Error(`no ${name}`); return f as (...args: unknown[]) => unknown; };
/** Every property name an object of this kind has, all the way down its prototypes. */
const ownNames = (object: object) => { const names = new Set<string>(); for (let p: object | null = object; p; p = Object.getPrototypeOf(p)) for (const n of Object.getOwnPropertyNames(p)) names.add(n); return names; };
type Dom = ReturnType<typeof capture>;
function capture() {
  const D = Document.prototype, N = Node.prototype, E = Element.prototype, C = CharacterData.prototype, M = NamedNodeMap.prototype, A = Attr.prototype;
  const fn = {
    documentElement: getter(D, 'documentElement'), head: getter(D, 'head'), qsa: method(D, 'querySelectorAll'), createElement: method(D, 'createElement'), importNode: method(D, 'importNode'),
    firstChild: getter(N, 'firstChild'), nextSibling: getter(N, 'nextSibling'), nodeType: getter(N, 'nodeType'), parentNode: getter(N, 'parentNode'),
    replaceChild: method(N, 'replaceChild'), insertBefore: method(N, 'insertBefore'), removeChild: method(N, 'removeChild'), normalize: method(N, 'normalize'), cloneNode: method(N, 'cloneNode'),
    textGet: getter(N, 'textContent'), textSet: setter(N, 'textContent'), dataGet: getter(C, 'data'), dataSet: setter(C, 'data'),
    attributes: getter(E, 'attributes'), localName: getter(E, 'localName'), namespaceURI: getter(E, 'namespaceURI'), outerHTML: getter(E, 'outerHTML'), closest: method(E, 'closest'),
    setAttribute: method(E, 'setAttribute'), getAttribute: method(E, 'getAttribute'),
    mapLength: getter(M, 'length'), mapItem: method(M, 'item'), attrName: getter(A, 'name'), attrValue: getter(A, 'value'), attrNs: getter(A, 'namespaceURI'),
    content: getter(HTMLTemplateElement.prototype, 'content'),
    parse: method(DOMParser.prototype, 'parseFromString'), blank: method(DOMImplementation.prototype, 'createHTMLDocument'), implementation: getter(D, 'implementation'),
  };
  const fresh = fn.blank.call(fn.implementation.call(document), '') as Document;
  return {
    root: (d: Document) => fn.documentElement.call(d) as Element,
    head: (d: Document) => fn.head.call(d) as HTMLHeadElement | null,
    all: (d: Document, s: string) => Array.from(fn.qsa.call(d, s) as NodeListOf<Element>),
    create: (d: Document, tag: string) => fn.createElement.call(d, tag) as Element,
    adopt: (d: Document, n: Node) => fn.importNode.call(d, n, true) as Node,
    first: (n: Node) => fn.firstChild.call(n) as Node | null,
    next: (n: Node) => fn.nextSibling.call(n) as Node | null,
    type: (n: Node) => fn.nodeType.call(n) as number,
    parent: (n: Node) => fn.parentNode.call(n) as Node | null,
    replace: (parent: Node, next: Node, old: Node) => { fn.replaceChild.call(parent, next, old); },
    insert: (parent: Node, n: Node, before: Node | null) => { fn.insertBefore.call(parent, n, before); },
    remove: (parent: Node, n: Node) => { fn.removeChild.call(parent, n); },
    normalize: (n: Node) => { fn.normalize.call(n); },
    shallow: (n: Node) => fn.cloneNode.call(n, false) as Element,
    text: (n: Node) => fn.textGet.call(n) as string,
    setText: (n: Node, t: string) => { fn.textSet.call(n, t); },
    data: (n: Node) => fn.dataGet.call(n) as string,
    setData: (n: Node, t: string) => { fn.dataSet.call(n, t); },
    attrs: (e: Element) => { const m = fn.attributes.call(e) as NamedNodeMap, out: {name: string; value: string; ns: string}[] = []; for (let i = 0, n = fn.mapLength.call(m) as number; i < n; i++) { const a = fn.mapItem.call(m, i) as Attr; out.push({name: fn.attrName.call(a) as string, value: fn.attrValue.call(a) as string, ns: (fn.attrNs.call(a) as string | null) ?? ''}); } return out; },
    tag: (e: Element) => fn.localName.call(e) as string,
    ns: (e: Element) => fn.namespaceURI.call(e) as string | null,
    html: (e: Element) => fn.outerHTML.call(e) as string,
    inForm: (e: Element) => !!fn.closest.call(e, 'form'),
    set: (e: Element, name: string, value: string) => { fn.setAttribute.call(e, name, value); },
    get: (e: Element, name: string) => fn.getAttribute.call(e, name) as string | null,
    templateContent: (e: Element) => fn.content.call(e) as DocumentFragment,
    parse: (html: string) => fn.parse.call(new DOMParser(), html, 'text/html') as Document,
    blank: () => fn.blank.call(fn.implementation.call(document), '') as Document,
    /** Names a clean document and a clean form have of their own: what an element named the same would hide. */
    documentNames: ownNames(fresh), formNames: ownNames(fn.createElement.call(fresh, 'form') as object),
  };
}
let captured: Dom | undefined;
const dom = () => captured ??= capture();
/* captured: end */

/** Elements a document exposes by name (and, for some, by id): <form name="head"> is document.head then. */
const BY_NAME = new Set(['form', 'img', 'embed', 'object', 'iframe']);
/** Elements a form exposes by name or id: <input name="action"> is form.action then. */
const IN_FORM = new Set(['button', 'fieldset', 'input', 'object', 'output', 'select', 'textarea', 'img']);
/** Whether an element's name or id would take the place of one the document or a form has of its own. */
export function hidesAName(tag: string, attribute: string, value: string, names: {documentNames: Set<string>; formNames: Set<string>}): boolean {
  if (attribute !== 'name' && attribute !== 'id') return false;
  return (BY_NAME.has(tag) && names.documentNames.has(value)) || (IN_FORM.has(tag) && names.formNames.has(value));
}

let purifier: DOMPurify | undefined;
/** One cleaner for the app, its rules added once: an attribute stays only when keepsAttribute says so, and no element keeps a name that hides one of the document's or a form's. */
function cleaner(): DOMPurify {
  if (purifier) return purifier;
  const p = createDOMPurify(window), d = dom();
  p.addHook('uponSanitizeAttribute', (node, data) => {
    const element = node as Element, tag = d.tag(element).toLowerCase();
    const svg = d.ns(element) === 'http://www.w3.org/2000/svg';
    if (hidesAName(tag, data.attrName.toLowerCase(), data.attrValue, d) || !keepsAttribute(tag, svg ? 'svg' : 'html', data.attrName, data.attrValue)) data.keepAttr = false;
  });
  return purifier = p;
}

type Shape = string;
/** A document as a list of what a browser builds from it: each node's kind, name, namespace, attributes and text, in order. */
function shape(root: Node, d: Dom): Shape[] {
  const out: Shape[] = [];
  const walk = (n: Node) => {
    const type = d.type(n);
    if (type === 1) {
      const e = n as Element;
      out.push(`<${d.ns(e)}|${d.tag(e)}|${d.attrs(e).map(a => `${a.ns}:${a.name}=${a.value}`).sort().join('\u0000')}`);
      if (d.tag(e) === 'template' && d.ns(e) === 'http://www.w3.org/1999/xhtml') walk(d.templateContent(e));
    } else if (type === 3) out.push(`#${d.data(n)}`);
    else if (type === 8) out.push(`!${d.data(n)}`);
    for (let c = d.first(n); c; c = d.next(c)) walk(c);
    if (type === 1) out.push('>');
  };
  walk(root);
  return out;
}

/** The three meta every cleaned page begins its head with, in this order. */
const HEADER_META: [string, string][][] = [[['charset', 'utf-8']], [['http-equiv', 'Content-Security-Policy'], ['content', STATIC_PAGE_CSP]], [['http-equiv', 'x-dns-prefetch-control'], ['content', 'off']]];
/** Whether a written page begins with the doctype, its own html and head tags, and our three meta, and nothing else. */
export function startsWithHeader(written: string, htmlOpen: string, headOpen: string, metas: string): boolean {
  return written.startsWith('<!doctype html>' + htmlOpen + headOpen + metas);
}

/**
 * The page without anything that runs or reaches out, as a whole document whose first bytes say its charset and the
 * policy it runs under. `address` gives what a `media:<sha256>` the page names becomes (a placeholder the export
 * fills, a file beside it, or nothing); it is put in attribute values and style sheets only, never in the page's words.
 */
export function cleanPage(source: string, address: (sha: string) => string | undefined): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') throw new Error('a page is cleaned in the app\'s window, where a browser reads it; there is none here');
  const d = dom();
  const cleaned = cleaner().sanitize(source, CONFIG) as unknown as Element;
  const doc = d.blank();
  const root = d.adopt(doc, cleaned) as Element;
  d.replace(doc, root, d.root(doc));
  const refuse = (why: string): never => { throw new Error(`${why}, so it is not sent without its scripts; send it with them, or as a board file`); };
  // What is before the head (comments the parser keeps there) goes, so the head is the html's first child.
  let head = d.head(doc);
  if (!head || d.parent(head) !== root) { head = d.create(doc, 'head') as HTMLHeadElement; d.insert(root, head, d.first(root)); }
  for (let c = d.first(root); c && c !== head; c = d.first(root)) d.remove(root, c);
  const metas = HEADER_META.map(pairs => { const m = d.create(doc, 'meta'); for (const [k, v] of pairs) d.set(m, k, v); return m; });
  for (const m of [...metas].reverse()) d.insert(head, m, d.first(head));
  const put = (text: string) => text.replace(/media:([0-9a-f]{64})(?![0-9a-f])/g, (all, sha: string) => address(sha) ?? all);
  for (const element of d.all(doc, '*')) {
    for (const a of d.attrs(element)) if (a.value.includes('media:')) d.set(element, a.name, put(a.value));
    if (d.tag(element) === 'style' && d.text(element).includes('media:')) d.setText(element, put(d.text(element)));
  }
  // What cleaning took out between two pieces of text leaves them side by side, which a parser never makes: they are
  // joined, as a second reading would join them, so only a real difference refuses the page.
  d.normalize(root);
  const was = shape(root, d);
  // The parser drops one newline right after <pre>, <textarea> and <listing>, and writing does not put it back:
  // a text that starts with one is written with another in front, so it reads back as it was.
  for (const element of d.all(doc, 'pre,textarea,listing')) { const first = d.first(element); if (first && d.type(first) === 3 && d.data(first).startsWith('\n')) d.setData(first, '\n' + d.data(first)); }
  const close = (e: Element) => { const h = d.html(d.shallow(e)); return h.slice(0, h.lastIndexOf('</')); };
  const written = '<!doctype html>' + d.html(root);
  if (!startsWithHeader(written, close(root), close(head), metas.map(d.html).join(''))) refuse('the cleaned page does not begin with the header it is given');
  const again = d.parse(written);
  const againHead = d.head(again);
  const firsts: Element[] = [];
  for (let c = againHead && d.first(againHead); c && firsts.length < 3; c = d.next(c)) if (d.type(c) === 1) firsts.push(c as Element);
  if (!againHead || d.parent(againHead) !== d.root(again) || firsts.length < 3 || firsts.some((m, i) => d.tag(m) !== 'meta' || HEADER_META[i].some(([k, v]) => d.get(m, k) !== v))) refuse('the cleaned page does not read back with its policy first');
  const is = shape(d.root(again), d);
  const at = was.findIndex((s, i) => s !== is[i]);
  if (at >= 0 || was.length !== is.length) refuse(`the page reads differently once cleaned (at node ${at < 0 ? was.length : at})`);
  return written;
}
