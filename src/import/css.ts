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
  if (n.type === 'string') return unescapeCss(n.value);
  if (n.type !== 'function' || unescapeCss(n.value).toLowerCase() !== 'url' || n.unclosed) return;
  if (n.nodes.length === 1 && n.nodes[0].type === 'string') return unescapeCss(n.nodes[0].value);
  return unescapeCss(values.stringify(n.nodes).trim());
}

async function rewriteUrls(value: string, dir: string | null, refs: References): Promise<string> {
  const parsed = values(value), urls: values.FunctionNode[] = [];
  parsed.walk(node => {
    if (node.type === 'function' && argument(node) !== undefined) { urls.push(node); return false; }
  });
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

export async function rewriteCss(source: string, dir: string | null, refs: References, chain: string[] = []): Promise<string> {
  let root;
  try { root = postcss.parse(source, {from: undefined}); }
  catch { refs.skip(chain.at(-1) ?? '', 'invalid_css'); return source; }
  const nodes: (AtRule | Declaration)[] = [];
  root.walk(n => { if (n.type === 'decl' || n.type === 'atrule') nodes.push(n); });
  for (const node of nodes) {
    if (node.type === 'decl') { node.value = await rewriteUrls(node.value, dir, refs); continue; }
    if (node.name.toLowerCase() !== 'import') { node.params = await rewriteUrls(node.params, dir, refs); continue; }
    const first = values(node.params).nodes.find(n => n.type !== 'space' && n.type !== 'comment');
    const url = first && argument(first);
    if (url === undefined || !first) continue;
    const to = refs.locate(url, dir);
    if (!to) { if (portable(url) !== url) node.params = '"#"'; continue; }
    if (chain.includes(to.name)) { refs.skip(url, 'css_cycle'); continue; }
    if (chain.length >= IMPORT_DEPTH + 1) { refs.skip(url, 'css_depth'); continue; }
    const text = await refs.text(to.name, url, 'style');
    if (text === undefined) continue;
    const child = await rewriteCss(text, parent(to.name), refs, [...chain, to.name]);
    const css = conditional(child, node.params.slice(first.sourceEndIndex));
    try { node.replaceWith(postcss.parse(css, {from: undefined}).nodes); }
    catch { refs.skip(url, 'invalid_css'); }
  }
  return root.toString();
}
