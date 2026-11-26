import postcss, {type AtRule, type Declaration} from 'postcss';
import values from 'postcss-value-parser';
import {parent, portable, type References} from './references';

export const IMPORT_DEPTH = 3;
const unescapeCss = (s: string) => s.replace(/\\(?:([\da-f]{1,6})(?:\r\n|[\t\n\r\f ])?|([\s\S]))/gi, (_, hex: string, char: string) => {
  if (!hex) return /[\r\n\f]/.test(char) ? '' : char;
  const point = parseInt(hex, 16);
  return point && point <= 0x10ffff ? String.fromCodePoint(point) : '�';
});

function argument(n: values.Node): string | undefined {
  if (n.type === 'string' && !n.unclosed) return unescapeCss(n.value);
  if (n.type !== 'function' || unescapeCss(n.value).toLowerCase() !== 'url' || n.unclosed) return;
  if (n.nodes.length === 1 && n.nodes[0].type === 'string') return unescapeCss(n.nodes[0].value);
  return unescapeCss(values.stringify(n.nodes).trim());
}

async function rewriteUrls(value: string, dir: string | null, refs: References): Promise<string> {
  const urls: values.Node[] = [];
  const significant = (n: values.Node) => n.type !== 'space' && n.type !== 'comment';
  function candidate(group: values.Node[]) {
    const [first, ...descriptors] = group.filter(significant);
    let resolution = false, type = false;
    const valid = first && (first.type === 'string' || first.type === 'function') && descriptors.every(n => {
      if (n.type === 'word' && !resolution && /^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:x|dpi|dpcm|dppx)$/i.test(n.value)) {
        resolution = true; return true;
      }
      if (n.type === 'function' && !type && !n.unclosed && n.value.toLowerCase() === 'type' &&
          n.nodes.filter(significant).length === 1 && n.nodes.filter(significant)[0].type === 'string') {
        type = true; return true;
      }
      return false;
    });
    if (!valid || (first.type === 'function' && first.unclosed) || (first.type === 'string' && first.unclosed)) {
      refs.skip(first && argument(first) || values.stringify(group), 'invalid_candidate'); return;
    }
    if (argument(first) !== undefined) urls.push(first);
    else if (first.type === 'function' && /gradient$/i.test(first.value)) visit(first.nodes);
    else refs.skip(values.stringify(first), 'invalid_candidate');
  }
  function visit(nodes: values.Node[]) {
    for (const n of nodes) {
      if (n.type !== 'function') continue;
      if (/^(?:-webkit-)?image-set$/i.test(unescapeCss(n.value))) {
        let group: values.Node[] = [];
        for (const part of n.nodes) {
          if (part.type === 'div' && part.value === ',') { candidate(group); group = []; }
          else group.push(part);
        }
        candidate(group);
      } else if (argument(n) !== undefined) urls.push(n);
      else visit(n.nodes);
    }
  }
  visit(values(value).nodes);
  let result = '', at = 0;
  for (const node of urls) {
    const url = argument(node)!, placed = await refs.media(url, dir);
    if (placed === url) continue;
    result += value.slice(at, node.sourceIndex) + 'url("' + placed.replace(/["\\\r\n\f]/g, c => '%' + c.charCodeAt(0).toString(16)) + '")';
    at = node.sourceEndIndex;
  }
  return result + value.slice(at);
}

/** An imported sheet keeps the cascade conditions from its @import. */
function conditional(sheet: string, rest: string): string {
  const conditions = values(rest).nodes.filter(n => n.type !== 'space' && n.type !== 'comment');
  const wrappers: string[] = [];
  let from = 0;
  for (const token of conditions) {
    if (token.type === 'word' && token.value.toLowerCase() === 'layer') wrappers.push('@layer');
    else if (token.type === 'function' && token.value.toLowerCase() === 'layer') wrappers.push('@layer ' + values.stringify(token.nodes));
    else if (token.type === 'function' && token.value.toLowerCase() === 'supports') {
      const test = values.stringify(token.nodes).trim();
      wrappers.push('@supports ' + (/^(?:\(|not\s|selector\()/i.test(test) ? test : '(' + test + ')'));
    } else break;
    from = token.sourceEndIndex;
  }
  const media = rest.slice(from).trim();
  if (media) wrappers.push('@media ' + media);
  return wrappers.reduceRight((inner, head) => head + '{' + inner + '}', sheet);
}

export async function rewriteCss(source: string, dir: string | null, refs: References, chain: string[] = []): Promise<string | undefined> {
  let root;
  try { root = postcss.parse(source, {from: undefined, map: false}); }
  catch { refs.skip(chain.at(-1) ?? '', 'invalid_css'); return; }
  const leading = new Set<AtRule>();
  for (const n of root.nodes) {
    if (n.type === 'comment') continue;
    if (n.type !== 'atrule' || n.nodes) break;
    if (n.name.toLowerCase() === 'import') leading.add(n);
    else if (!['charset', 'layer'].includes(n.name.toLowerCase())) break;
  }
  if (chain.length > 1) {
    if (root.nodes.some(n => n.type === 'atrule' && n.name.toLowerCase() === 'namespace')) {
      refs.skip(chain.at(-1)!, 'css_namespace'); return;
    }
    if (root.first?.type === 'atrule' && root.first.name.toLowerCase() === 'charset') root.first.remove();
  }
  const expanded = new Set<AtRule>();
  const nodes: (AtRule | Declaration)[] = [];
  root.walk(n => { if (n.type === 'decl' || n.type === 'atrule') nodes.push(n); });
  for (const node of nodes) {
    if (node.type === 'decl') { node.value = await rewriteUrls(node.value, dir, refs); continue; }
    if (['charset', 'namespace'].includes(node.name.toLowerCase())) continue;
    if (node.name.toLowerCase() !== 'import') { node.params = await rewriteUrls(node.params, dir, refs); continue; }
    const first = values(node.params).nodes.find(n => n.type !== 'space' && n.type !== 'comment');
    const url = first && argument(first);
    if (url === undefined || !first) continue;
    if (!leading.has(node)) { refs.skip(url, 'css_import_position'); continue; }
    const to = refs.locate(url, dir);
    if (!to) { if (portable(url) !== url) node.params = '"#"'; continue; }
    if (chain.includes(to.name)) { refs.skip(url, 'css_cycle'); continue; }
    if (chain.length >= IMPORT_DEPTH + 1) { refs.skip(url, 'css_depth'); continue; }
    const undoFiles = refs.checkpoint();
    const text = await refs.text(to.name, url, 'style');
    if (text === undefined) continue;
    const child = await rewriteCss(text, parent(to.name), refs, [...chain, to.name]);
    if (child === undefined) { undoFiles(); continue; }
    const css = conditional(child, node.params.slice(first.sourceEndIndex));
    try { expanded.add(node); node.replaceWith(postcss.parse(css, {from: undefined, map: false}).nodes); }
    catch { refs.skip(url, 'invalid_css'); }
  }
  // A remaining import or namespace must never be moved behind an expanded rule.
  let inserted = false;
  for (const rule of leading) {
    if (expanded.has(rule)) inserted = true;
    else if (inserted || chain.length > 1) return undefined;
  }
  if (inserted && root.nodes.some(n => n.type === 'atrule' && n.name.toLowerCase() === 'namespace')) {
    refs.skip(chain.at(-1) ?? '', 'css_namespace'); return;
  }
  if (nodes.some(n => /<\/style(?=[\t\n\f\r />])/i.test(n.type === 'decl' ? n.value : n.params))) {
    refs.skip(chain.at(-1) ?? '', 'raw_end_tag'); return;
  }
  return root.toString();
}
