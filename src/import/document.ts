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

export function decode(bytes: Uint8Array, html = false): string {
  if (bytes.length > MAX_TEXT_BYTES) throw 'too_large';
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  else if (html && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    const prefix = new TextDecoder('windows-1252').decode(bytes.subarray(0, 1024));
    const meta = elements(prefix).find(e => e.tagName === 'meta' && attr(e, 'charset'));
    encoding = meta && attr(meta, 'charset') || encoding;
  }
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(encoding); } catch { decoder = new TextDecoder(); }
  return decoder.decode(bytes);
}

export function metadata(nodes: Element[]) {
  const title = nodes.find(e => e.tagName === 'title' && e.namespaceURI.endsWith('/xhtml'));
  const name = title?.childNodes.map(n => 'value' in n ? n.value : '').join('').trim();
  const viewport = nodes.find(e => e.tagName === 'meta' && attr(e, 'name')?.toLowerCase() === 'viewport');
  const width = viewport && attr(viewport, 'content')?.match(/(?:^|[,;\s])width\s*=\s*(\d+(?:\.\d+)?)\s*(?=[,;\s]|$)/i)?.[1];
  return {name, width: width && Number(width) > 0 ? clampWidth(Number(width)) : undefined};
}
