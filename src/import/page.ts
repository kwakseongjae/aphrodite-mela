import {esc} from '../html';
import {MAX_PAGE_HTML} from '../free-page';
import {attr, inDocument, type Element} from './document';
import {rewriteCss} from './css';
import {address, parent, portable, type References} from './references';

async function srcset(value: string, dir: string | null, refs: References) {
  // Candidate URLs may contain commas (especially data URLs). Descriptors end at the next comma
  // outside parentheses. Keep the original whitespace and descriptors around each replacement.
  let at = 0, from = 0, result = '';
  while (at < value.length) {
    while (at < value.length && /[\t\n\f\r ,]/.test(value[at])) at++;
    const start = at;
    while (at < value.length && !/[\t\n\f\r ]/.test(value[at])) at++;
    let end = at;
    while (end > start && value[end - 1] === ',') end--;
    if (end > start) {
      result += value.slice(from, start) + await refs.media(value.slice(start, end), dir);
      from = end;
    }
    if (at !== end) continue;
    let depth = 0;
    while (at < value.length) {
      const c = value[at++];
      if (c === '(') depth++;
      if (c === ')' && depth) depth--;
      if (c === ',' && !depth) break;
    }
  }
  return result + value.slice(from);
}

function baseDirectory(nodes: Element[], refs: References): string | null {
  const base = nodes.find(e => e.tagName === 'base' && attr(e, 'href') !== undefined && inDocument(e));
  if (!base) return '';
  const url = attr(base, 'href')!, to = address(url, '');
  if (to.kind === 'local') {
    const path = url.split(/[?#]/, 1)[0];
    return path.endsWith('/') || /(?:^|\/)\.{1,2}$/.test(path) ? to.name : parent(to.name);
  }
  if (to.kind === 'keep' && (!url || /^[#?]/.test(url))) return '';
  if (to.kind === 'remote') refs.remote++;
  else refs.skip(url, 'outside');
  return null;
}

type Span = {startOffset: number; endOffset: number};
type Edit = Span & {value: string};

export async function resolvePage(source: string, nodes: Element[], refs: References): Promise<string> {
  const edits: Edit[] = [];
  let size = source.length;
  const put = (span: Span | undefined, value: string) => {
    if (!span) return;
    size += value.length - (span.endOffset - span.startOffset);
    if (size > MAX_PAGE_HTML) throw 'too_large';
    edits.push({...span, value});
  };
  const dir = baseDirectory(nodes, refs);
  const seen = new Set<number>();
  const deferred: string[] = [];
  for (const e of nodes) {
    const loc = e.sourceCodeLocation!, start = loc.startTag!, tag = e.tagName;
    if (seen.has(start.startOffset)) continue;
    seen.add(start.startOffset);
    const src = attr(e, 'src'), href = attr(e, 'href');
    const stylesheet = tag === 'link' && (attr(e, 'rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet');
    const external = stylesheet ? href : tag === 'script' ? src : undefined;
    if (external !== undefined) {
      const to = refs.locate(external, dir);
      if (to && attr(e, 'integrity')?.trim()) {
        refs.skip(external, 'integrity');
      } else if (to) {
        const text = await refs.text(to.name, external, stylesheet ? 'style' : 'script');
        if (text !== undefined) {
          if (stylesheet) {
            const css = await rewriteCss(text, parent(to.name), refs, [to.name]);
            const attrs = e.attrs.filter(a => ['media', 'title', 'id', 'class', 'nonce'].includes(a.name)).map(a => ' ' + a.name + '="' + esc(a.value) + '"').join('');
            put(start, '<style' + attrs + '>' + css + '</style>');
          } else {
            const attribute = loc.attrs!.src;
            const opening = source.slice(start.startOffset, attribute.startOffset) + source.slice(attribute.endOffset, start.endOffset);
            const script = opening + text + '</script>';
            if (attr(e, 'defer') !== undefined && attr(e, 'async') === undefined && attr(e, 'type')?.toLowerCase() !== 'module' && inDocument(e)) {
              deferred.push(script);
              put(loc, '');
            } else put(loc, script);
          }
          continue;
        }
      }
    }
    if (tag === 'style') {
      const body = {startOffset: start.endOffset, endOffset: loc.endTag?.startOffset ?? loc.endOffset};
      const text = source.slice(body.startOffset, body.endOffset), css = await rewriteCss(text, dir, refs);
      if (css !== text) put(body, css);
    }
    for (const a of e.attrs) {
      const key = a.prefix ? a.prefix + ':' + a.name : a.name;
      let value = a.value;
      if (key === 'style') value = await rewriteCss(value, dir, refs);
      else if (key === 'srcset' || key === 'imagesrcset') value = await srcset(value, dir, refs);
      else if ((key === 'src' && ['img', 'video', 'audio', 'source', 'input'].includes(tag)) ||
          (key === 'poster' && tag === 'video') || (a.name === 'href' && tag === 'image') ||
          (key === 'href' && tag === 'link' && /(?:^|\s)icon(?:\s|$)/i.test(attr(e, 'rel') ?? ''))) value = await refs.media(value, dir);
      else if (['src', 'href', 'xlink:href', 'data', 'action', 'formaction', 'background'].includes(key)) {
        // Ordinary navigation never opens a sibling. The base and external sheets/scripts were counted above.
        if (tag !== 'base' && !(external !== undefined && key === (stylesheet ? 'href' : 'src'))) {
          const to = address(value, dir ?? '');
          if (to.kind === 'remote') refs.remote++;
          if (to.kind === 'outside') refs.skip(value, 'outside');
        }
        value = portable(value);
      }
      if (value !== a.value) put(loc.attrs?.[key], key + '="' + esc(value) + '"');
    }
  }
  if (deferred.length) {
    const body = nodes.find(e => e.tagName === 'body' && inDocument(e));
    const end = body?.sourceCodeLocation?.endTag?.startOffset ?? source.length;
    put({startOffset: end, endOffset: end}, deferred.join(''));
  }
  let at = 0;
  const output: string[] = [];
  for (const edit of edits.sort((a, b) => a.startOffset - b.startOffset)) {
    if (edit.startOffset < at) continue;
    output.push(source.slice(at, edit.startOffset), edit.value);
    at = edit.endOffset;
  }
  output.push(source.slice(at));
  return output.join('');
}
