/**
 * A page made safe to open in someone else's browser (0.3-P3-fix1): read by the browser's own parser, cleaned by
 * DOMPurify to a list of what may stay, narrowed by our rules (src/page-export.ts), written out, and read once more
 * to see it comes back the same. A page whose cleaned copy reads back differently is not sent at all: a difference
 * means two browsers could read it two ways. Only the app's window has a parser, so this runs there and nowhere else;
 * without one it throws rather than fall back to anything weaker.
 */
import createDOMPurify, {type Config, type DOMPurify} from 'dompurify';
import {CLEAN_FORBID_TAGS, CLEAN_FORBID_ATTR, keepsAttribute, STATIC_PAGE_CSP} from './page-export';

const MEDIA_IN = /media:([0-9a-f]{64})(?![0-9a-f])/g;
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
  // DOMPurify drops an id or a name the app's own document has (title, body, links…) to keep a script in the page it
  // is put into from reaching the wrong element. Nothing runs in this page, and it is put into none, so a heading's
  // id 'title' that a link goes to stays.
  SANITIZE_DOM: false,
  CUSTOM_ELEMENT_HANDLING: {tagNameCheck: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/, attributeNameCheck: /^(?!on)[a-z][a-z0-9-]*$/, allowCustomizedBuiltInElements: false},
};
let purifier: DOMPurify | undefined;
/** One cleaner for the app, its rule added once: an attribute stays only when keepsAttribute says so. */
function cleaner(): DOMPurify {
  if (purifier) return purifier;
  const p = createDOMPurify(window);
  p.addHook('uponSanitizeAttribute', (node, data) => {
    const element = node as Element;
    const svg = element.namespaceURI === 'http://www.w3.org/2000/svg';
    if (!keepsAttribute(element.localName.toLowerCase(), svg ? 'svg' : 'html', data.attrName, data.attrValue)) data.keepAttr = false;
  });
  return purifier = p;
}

type Shape = string;
/** A document as a list of what a browser builds from it: each node's kind, name, namespace, attributes and text, in order. */
function shape(root: Node): Shape[] {
  const out: Shape[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as Element;
      out.push(`<${e.namespaceURI}|${e.localName}|${Array.from(e.attributes, a => `${a.namespaceURI ?? ''}:${a.name}=${a.value}`).sort().join('\u0000')}`);
      const content = (e as HTMLTemplateElement).content;
      if (content) walk(content);
    } else if (n.nodeType === Node.TEXT_NODE) out.push(`#${(n as Text).data}`);
    else if (n.nodeType === Node.COMMENT_NODE) out.push(`!${(n as Comment).data}`);
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
    if (n.nodeType === Node.ELEMENT_NODE) out.push('>');
  };
  walk(root);
  return out;
}

/**
 * The page without anything that runs or reaches out, as a whole document whose first bytes say its charset and the
 * policy it runs under. `address` gives what a `media:<sha256>` the page names becomes (a placeholder the export
 * fills, a file beside it, or nothing); it is put in attribute values and style sheets only, never in the page's words.
 */
export function cleanPage(source: string, address: (sha: string) => string | undefined): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') throw new Error('a page is cleaned in the app\'s window, where a browser reads it; there is none here');
  const cleaned = cleaner().sanitize(source, CONFIG) as unknown as HTMLElement;
  const doc = document.implementation.createHTMLDocument('');
  doc.replaceChild(doc.importNode(cleaned, true), doc.documentElement);
  const head = doc.head ?? doc.documentElement.insertBefore(doc.createElement('head'), doc.documentElement.firstChild);
  const meta = (attrs: Record<string, string>) => { const m = doc.createElement('meta'); for (const [k, v] of Object.entries(attrs)) m.setAttribute(k, v); return m; };
  head.prepend(meta({charset: 'utf-8'}), meta({'http-equiv': 'Content-Security-Policy', content: STATIC_PAGE_CSP}), meta({'http-equiv': 'x-dns-prefetch-control', content: 'off'}));
  const put = (text: string) => text.replace(MEDIA_IN, (all, sha: string) => address(sha) ?? all);
  for (const element of Array.from(doc.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) if (attribute.value.includes('media:')) element.setAttribute(attribute.name, put(attribute.value));
    if (element.localName === 'style' && element.textContent?.includes('media:')) element.textContent = put(element.textContent);
  }
  const was = shape(doc.documentElement);
  // The parser drops one newline right after <pre>, <textarea> and <listing>, and writing does not put it back:
  // a text that starts with one is written with another in front, so it reads back as it was.
  for (const element of Array.from(doc.querySelectorAll('pre,textarea,listing'))) { const first = element.firstChild; if (first?.nodeType === Node.TEXT_NODE && (first as Text).data.startsWith('\n')) (first as Text).data = '\n' + (first as Text).data; }
  const written = '<!doctype html>' + doc.documentElement.outerHTML;
  const again = new DOMParser().parseFromString(written, 'text/html');
  const is = shape(again.documentElement);
  const at = was.findIndex((s, i) => s !== is[i]);
  if (at >= 0 || was.length !== is.length) throw new Error(`the page reads differently once cleaned (at node ${at < 0 ? was.length : at}), so it is not sent without its scripts; send it with them, or as a board file`);
  return written;
}
