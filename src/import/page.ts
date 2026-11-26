import {esc} from '../html';
import {MAX_PAGE_HTML} from '../free-page';
import {attr, elements, inDocument, type Element} from './document';
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
    const descriptors = at;
    let depth = 0;
    if (end === at) while (at < value.length) {
      const c = value[at++];
      if (c === '(') depth++;
      if (c === ')' && depth) depth--;
      if (c === ',' && !depth) break;
    }
    if (end <= start) continue;
    const url = value.slice(start, end);
    const tokens = value.slice(descriptors, at).replace(/,$/, '').trim().split(/[\t\n\f\r ]+/).filter(Boolean);
    const kinds = new Set(tokens.map(t => t.slice(-1)));
    const valid = kinds.size === tokens.length && tokens.every(t =>
      (/^\d+[wh]$/.test(t) && Number(t.slice(0, -1)) > 0) ||
      (/^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?x$/.test(t) && Number.isFinite(Number(t.slice(0, -1))))) &&
      !(kinds.has('x') && kinds.size > 1) && (!kinds.has('h') || kinds.has('w'));
    if (!valid) { refs.skip(url, 'invalid_candidate'); continue; }
    result += value.slice(from, start) + await refs.media(url, dir);
    from = end;
    if (result.length + value.length - from > MAX_PAGE_HTML) throw 'too_large';
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

function inlineRefusal(e: Element, stylesheet: boolean) {
  if (!e.namespaceURI.endsWith('/xhtml')) return 'namespace';
  if (attr(e, 'integrity') !== undefined) return 'integrity';
  if (stylesheet) {
    if (attr(e, 'disabled') !== undefined || attr(e, 'rel')?.toLowerCase().split(/\s+/).includes('alternate')) return 'inactive_style';
    if (attr(e, 'type') && attr(e, 'type')!.trim().toLowerCase() !== 'text/css') return 'inactive_style';
  } else {
    const type = (attr(e, 'type') ?? (attr(e, 'language') ? 'text/' + attr(e, 'language') : '')).trim();
    if (['async', 'defer', 'nomodule'].some(a => attr(e, a) !== undefined) ||
        (type && !/^(?:application|text)\/(?:x-)?(?:javascript|ecmascript)$/i.test(type))) return 'script_mode';
  }
}

/** The parser must recover the same raw text and consume the intended closing tag. */
function representable(opening: string, text: string, tag: string) {
  const [node] = elements(opening + text + '</' + tag + '><i></i>');
  return node?.tagName === tag && node.sourceCodeLocation?.endTag?.startOffset === opening.length + text.length &&
    node.childNodes.map(n => 'value' in n ? n.value : '').join('') === text;
}

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

  for (const e of nodes) {
    const loc = e.sourceCodeLocation!, start = loc.startTag!, tag = e.tagName;
    if (seen.has(start.startOffset)) continue;
    seen.add(start.startOffset);
    const src = attr(e, 'src'), href = attr(e, 'href');
    const stylesheet = tag === 'link' && (attr(e, 'rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet');
    const external = stylesheet ? href : tag === 'script' ? src : undefined;
    if (external !== undefined) {
      const to = refs.locate(external, dir);
      const refused = inlineRefusal(e, stylesheet);
      if (to && refused) refs.skip(external, refused);
      else if (to) {
        const undoFiles = refs.checkpoint();
        const tagName = stylesheet ? 'style' : 'script';
        const text = await refs.text(to.name, external, tagName);
        if (text !== undefined) {
          const srcAttr = loc.attrs?.src;
          const attrs = e.attrs.filter(a => ['media', 'title', 'id', 'class', 'nonce'].includes(a.name))
            .map(a => ' ' + a.name + '="' + esc(a.value) + '"').join('');
          const opening = srcAttr && !stylesheet
            ? source.slice(start.startOffset, srcAttr.startOffset) + source.slice(srcAttr.endOffset, start.endOffset)
            : '<style' + attrs + '>';
          const raw = stylesheet ? await rewriteCss(text, parent(to.name), refs, [to.name]) : text;
          if (raw !== undefined) {
            if (representable(opening, raw, tagName) && (stylesheet || loc.endTag)) {
              put(stylesheet ? start : loc, opening + raw + '</' + tagName + '>');
              continue;
            }
            refs.skip(external, 'raw_end_tag');
          }
        }
        undoFiles();
      }
    }
    if (tag === 'style') {
      const body = {startOffset: start.endOffset, endOffset: loc.endTag?.startOffset ?? loc.endOffset};
      const text = source.slice(body.startOffset, body.endOffset), css = await rewriteCss(text, dir, refs);
      if (css !== undefined && css !== text) {
        if (representable('<style>', css, 'style')) put(body, css);
        else refs.skip('', 'raw_end_tag');
      }
    }
    for (const a of e.attrs) {
      const key = a.prefix ? a.prefix + ':' + a.name : a.name;
      let value = a.value;
      if (key === 'style') value = await rewriteCss(value, dir, refs) ?? value;
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
