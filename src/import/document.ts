// Parse without a browsing context. Inspecting an author's HTML must never run a script or load a URL.
import {parse, type DefaultTreeAdapterTypes as Tree} from 'parse5';
import {MAX_PAGE_HTML} from '../free-page';
import {clampWidth} from '../editor/space';

export const MAX_TEXT_BYTES = 3 * MAX_PAGE_HTML;
export type Element = Tree.Element;
export const attr = (node: Element, key: string) => node.attrs.find(a => a.name === key)?.value;

export function elements(html: string): Element[] {
  const tree = parse(html, {sourceCodeLocationInfo: true});
  const nodes: Tree.ChildNode[] = [...tree.childNodes].reverse(), found: Element[] = [];
  while (nodes.length) {
    const node = nodes.pop()!;
    if (!('tagName' in node)) continue;
    if (node.sourceCodeLocation?.startTag) found.push(node);
    const children = 'content' in node ? (node as Tree.Template).content.childNodes : node.childNodes;
    for (let i = children.length - 1; i >= 0; i--) nodes.push(children[i]);
  }
  return found;
}

/** Metadata inside a template or foreign namespace is not the HTML document's metadata. */
export function inDocument(e: Element): boolean {
  if (!e.namespaceURI.endsWith('/xhtml')) return false;
  let node: Tree.ParentNode | null = e;
  while (node && 'parentNode' in node) node = node.parentNode;
  return node?.nodeName === '#document';
}

export function decode(bytes: Uint8Array, html = false): string {
  if (bytes.length > MAX_TEXT_BYTES) throw 'too_large';
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  else if (html && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    const provisional = new TextDecoder().decode(bytes);
    if (!/<meta[\t\n\f\r />]/i.test(provisional) || !/charset/i.test(provisional)) return provisional;
    const meta = elements(provisional).find(e => e.tagName === 'meta' && attr(e, 'charset') && inDocument(e));
    encoding = meta && attr(meta, 'charset') || encoding;
    if (/^utf-?8$/i.test(encoding)) return provisional;
  }
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(encoding); } catch { decoder = new TextDecoder(); }
  return decoder.decode(bytes);
}

export function metadata(nodes: Element[]) {
  const title = nodes.find(e => e.tagName === 'title' && inDocument(e));
  const name = title?.childNodes.map(n => 'value' in n ? n.value : '').join('').trim();
  const viewport = nodes.find(e => e.tagName === 'meta' && attr(e, 'name')?.toLowerCase() === 'viewport' && inDocument(e));
  const width = viewport && attr(viewport, 'content')?.match(/(?:^|[,;\s])width\s*=\s*(\d+(?:\.\d+)?)\s*(?=[,;\s]|$)/i)?.[1];
  return {name, width: width && Number(width) > 0 ? clampWidth(Number(width)) : undefined};
}
