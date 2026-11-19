/**
 * The board layer (0.3-P2): a free page and a media item are held on the board by their id, so drawing
 * the editor again does not load them again. A frame that leaves the document starts over (its script
 * runs again, whatever the person did inside is gone), and render() used to replace the whole canvas on
 * every selection, page switch and move (RESULTS 0.3-P0 §1: ten frames, 0.4–0.5 s, state lost).
 *
 * render() still writes the whole editor as one string. `morph` puts it in place around what is already
 * there: an element marked `data-keep` that the new string marks the same way stays the same object, its
 * attributes brought up to date; inside it the same rule applies again, unless it is marked
 * `data-keep-whole`, whose children are never touched. Everything else is the new string, as before.
 */

/** Brings `live`'s children to `fresh`'s, keeping each `data-keep` element both have. `fresh` is emptied. */
export function morph(live: ParentNode & Node, fresh: ParentNode & Node): void {
  const kept = new Map<string, Element>();
  for (const child of Array.from(live.children)) { const key = child.getAttribute('data-keep'); if (key) kept.set(key, child); }
  const incoming = Array.from(fresh.childNodes);
  const pairs = new Map<Node, Element>();
  for (const node of incoming) {
    const key = node instanceof Element ? node.getAttribute('data-keep') : null;
    const match = key ? kept.get(key) : undefined;
    if (match) { pairs.set(node, match); kept.delete(key!); }
  }
  const staying = new Set(pairs.values());
  for (const node of Array.from(live.childNodes)) if (!(node instanceof Element && staying.has(node))) node.remove();
  // Kept elements are never moved: moving a frame is taking it out of the document. A new element goes
  // after the one before it in the new string.
  let cursor: ChildNode | null = null;
  for (const node of incoming) {
    const match = pairs.get(node);
    if (match) {
      syncAttributes(match, node as Element);
      if (!match.hasAttribute('data-keep-whole')) morph(match, node as Element);
      cursor = match;
    } else {
      if (cursor) cursor.after(node); else live.insertBefore(node, live.firstChild);
      cursor = node as ChildNode;
    }
  }
}

function syncAttributes(live: Element, fresh: Element) {
  for (const {name} of Array.from(live.attributes)) if (!fresh.hasAttribute(name)) live.removeAttribute(name);
  for (const {name, value} of Array.from(fresh.attributes)) if (live.getAttribute(name) !== value) live.setAttribute(name, value);
}

/** A short name for a text, to tell two versions of a page apart (not a check of anything: cyrb53 and the length). */
export function contentKey(text: string): string {
  let h1 = 0xdeadbeef ^ text.length, h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}

const keys = new Map<string, {html: string; key: string}>();
/** The key of a free page's frame: the same while its html is the same, remembered so an unchanged page costs nothing to ask about. */
export function frameKey(pageId: string, html: string): string {
  const known = keys.get(pageId);
  if (known && known.html === html) return known.key;
  const key = contentKey(html);
  keys.set(pageId, {html, key});
  return key;
}
