/**
 * A page as a file of its own, to send to someone (0.3-P3). It opens in their browser, where the app's wall
 * is not: so by default its scripts are taken out and the browser is told to run none and fetch nothing (the
 * policy comes first in the file, the same way a framed page's does, and is what holds when the cleaning
 * misses something), and every `<link>` that would reach out is taken out, since no policy stops a
 * preconnect (scripts/verify-wall.mjs measured it). Keeping the scripts is the person's choice; then the file
 * is the page as stored, its media put in. A board that should keep running is sent as a .aphrodite file.
 *
 * The page is read one tag at a time, never searched for words: text that looks like a script inside a
 * `<textarea>`, a `<style>`, an attribute or a comment is left exactly as it was written.
 */
import {strToU8, zipSync, type Zippable} from 'fflate';
import {isFreePage, mediaExtension, type FrameHost} from './free-page';
import {utf8Length} from './workspace/library';

/** The policy the cleaned file carries: its own styles, pictures and fonts as data, its videos beside it, and nothing else. */
export const STATIC_PAGE_CSP = [`default-src 'none'`, `script-src 'none'`, `style-src 'unsafe-inline'`, 'img-src data:', `media-src 'self' file: data:`, 'font-src data:', `connect-src 'none'`, `frame-src 'none'`, `object-src 'none'`, `form-action 'none'`, `base-uri 'none'`].join('; ');
/** The most one file the app writes for the person to send may be, in bytes: a page with its videos beside it, or a board (src/board-file.ts). */
export const MAX_EXPORT_FILE = 1024 * 1024 * 1024;
/** How big one exported page may be with its pictures put in, in bytes: about what a browser still opens without trouble. */
export const MAX_EXPORTED_PAGE = 100_000_000;

/**
 * Elements whose content is text up to their own end tag: their content is copied, never read for tags. Not
 * `<noscript>`, which is markup wherever scripts are off (a preview, a mail reader), and none of them inside
 * `<svg>` or `<math>`, where they hold markup too; there everything is read as markup, which at worst takes
 * out text that only looked like a tag.
 */
const RAW_TEXT = new Set(['style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);
const FOREIGN = new Set(['svg', 'math']);
const SPACE = /[\t\n\f\r ]/;
type Attribute = {name: string; value: string; text: string};
/** The attributes of a start tag from just after its name, and where the tag ends (its `>`), or -1 when it never does. */
function attributes(html: string, at: number): {list: Attribute[]; end: number} {
  const list: Attribute[] = [];
  for (let i = at; i < html.length;) {
    const c = html[i];
    if (c === '>') return {list, end: i};
    if (SPACE.test(c) || c === '/') { i++; continue; }
    const start = i;
    i++;
    while (i < html.length && !SPACE.test(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++;
    const name = html.slice(start, i).toLowerCase();
    let j = i;
    while (j < html.length && SPACE.test(html[j])) j++;
    if (html[j] !== '=') { list.push({name, value: '', text: html.slice(start, i)}); continue; }
    j++;
    while (j < html.length && SPACE.test(html[j])) j++;
    let value: string;
    if (html[j] === '"' || html[j] === "'") { const close = html.indexOf(html[j], j + 1); if (close < 0) return {list, end: -1}; value = html.slice(j + 1, close); j = close + 1; }
    else { const from = j; while (j < html.length && !SPACE.test(html[j]) && html[j] !== '>') j++; value = html.slice(from, j); }
    list.push({name, value, text: html.slice(start, j)});
    i = j;
  }
  return {list, end: -1};
}
/** Where the end tag of a raw-text element begins, or the end of the page when it has none. */
function rawEnd(html: string, from: number, name: string): number {
  const end = new RegExp(`</${name}[\\t\\n\\f\\r />]`, 'gi');
  end.lastIndex = from;
  return end.exec(html)?.index ?? html.length;
}
const NAMED: Record<string, string> = {colon: ':', tab: '\t', newline: '\n', amp: '&', lpar: '(', rpar: ')', sol: '/', nbsp: ' '};
/** An attribute's value as the browser reads it: character references decoded, so `jav&#97;script:` is seen for what it is. */
const decoded = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (all, e: string) => {
  if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? all;
  const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
});
/**
 * Whether an attribute's value would run something when used: `javascript:` and its kind, however it is written,
 * and anywhere in what a drawing's animation sets (`to`, `from`, `by`, `values`), which can set an address.
 */
const SCHEME = /(?:javascript|vbscript|livescript):/i;
const ANIMATED = new Set(['to', 'from', 'by', 'values']);
const RUNS = (name: string, value: string) => { const plain = decoded(value).replace(/[\u0000-\u0020\u007f-\u009f]/g, ''); return ANIMATED.has(name) ? SCHEME.test(plain) : new RegExp(`^${SCHEME.source}`, 'i').test(plain); };
/** What a `<link>` may keep: one that names something written into the page itself. */
const STAYS_IN = (value: string) => /^data:/i.test(value.trim());

/**
 * The page without anything that runs or reaches out: `<script>` elements, `on…` attributes, `javascript:`
 * addresses, `srcdoc`, `<base>`, a `<meta>` refresh, and every `<link>` but one to a data: address. Everything
 * else is copied as written.
 */
export function staticPage(html: string): string {
  let out = '', foreign = 0;
  for (let i = 0; i < html.length;) {
    const open = html.indexOf('<', i);
    if (open < 0) { out += html.slice(i); break; }
    out += html.slice(i, open);
    if (html.startsWith('<!--', open)) { const close = html.indexOf('-->', open + 4); const to = close < 0 ? html.length : close + 3; out += html.slice(open, to); i = to; continue; }
    if (html[open + 1] === '!' || html[open + 1] === '?') { const close = html.indexOf('>', open); const to = close < 0 ? html.length : close + 1; out += html.slice(open, to); i = to; continue; }
    const closing = html[open + 1] === '/';
    const tag = /^[a-zA-Z][^\t\n\f\r />]*/.exec(html.slice(open + (closing ? 2 : 1), open + 200));
    if (!tag) { out += '<'; i = open + 1; continue; }
    const name = tag[0].toLowerCase(), after = open + (closing ? 2 : 1) + tag[0].length;
    const {list, end} = attributes(html, after);
    // A tag the page never ends is dropped by the browser too.
    if (end < 0) break;
    i = end + 1;
    if (closing) { if (FOREIGN.has(name) && foreign) foreign--; if (name !== 'script') out += html.slice(open, i); continue; }
    if (name === 'script') { const close = rawEnd(html, i, 'script'); const gt = html.indexOf('>', close); i = close >= html.length ? html.length : gt < 0 ? html.length : gt + 1; continue; }
    if (name === 'base' || (name === 'link' && !STAYS_IN(list.find(a => a.name === 'href')?.value ?? '')) || (name === 'meta' && list.some(a => a.name === 'http-equiv' && /^\s*refresh\s*$/i.test(decoded(a.value))))) continue;
    const kept = list.filter(a => !a.name.startsWith('on') && a.name !== 'srcdoc' && a.name !== 'ping' && !RUNS(a.name, a.value));
    out += kept.length === list.length ? html.slice(open, i) : `<${tag[0]}${kept.map(a => ' ' + a.text).join('')}${html[end - 1] === '/' ? ' /' : ''}>`;
    if (FOREIGN.has(name) && html[end - 1] !== '/') { foreign++; continue; }
    if (foreign) continue;
    if (name === 'plaintext') { out += html.slice(i); break; }
    if (RAW_TEXT.has(name)) { const close = rawEnd(html, i, name); out += html.slice(i, close); i = close; }
  }
  return out;
}

/** What the person chose: whether the scripts go too, and whether the page's videos go beside it as files or stay behind (their posters do not). */
export type ExportChoice = {scripts: boolean; videos: 'beside' | 'out'};
export type ExportedPage = {html: string; beside: {path: string; sha: string; bytes: number}[]};
const MEDIA_REFS = /media:([0-9a-f]{64})(?![0-9a-f])/g;
const dataLength = (mime: string, bytes: number) => `data:${mime};base64,`.length + Math.ceil(bytes / 3) * 4;

/**
 * The file a page goes out as. A picture is put in as a data: address; a video is a file beside it
 * (`media/<sha256>.<extension>`) or is left out. Its size is added up from what the host says each file holds
 * before any is read, and a page past MAX_EXPORTED_PAGE is refused. With `inline: false` nothing is read at
 * all and each picture is shown by its size, for the dialog's preview.
 */
export async function exportPage(source: string, choice: ExportChoice, host: Pick<FrameHost, 'stat' | 'read'>, {inline = true}: {inline?: boolean} = {}): Promise<ExportedPage> {
  const head = choice.scripts ? '' : `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${STATIC_PAGE_CSP}"><meta http-equiv="x-dns-prefetch-control" content="off">`;
  const body = choice.scripts ? source : staticPage(source);
  const counts = new Map<string, number>();
  for (const m of body.matchAll(MEDIA_REFS)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const use = new Map<string, string>(), beside: ExportedPage['beside'] = [];
  let length = utf8Length(head) + utf8Length(body);
  const files = new Map<string, {bytes: number; mime: string}>();
  for (const [sha, times] of counts) {
    const file = await host.stat(sha);
    if (!file || mediaExtension(file.mime) === 'bin') continue;
    files.set(sha, file);
    const address = file.mime.startsWith('video/') ? choice.videos === 'beside' ? `media/${sha}.${mediaExtension(file.mime)}` : '' : '';
    length += times * ((file.mime.startsWith('image/') ? dataLength(file.mime, file.bytes) : address.length) - 'media:'.length - 64);
  }
  if (length > MAX_EXPORTED_PAGE) throw new Error(`with its pictures put in, the page comes to ${length.toLocaleString('en')} bytes; one page holds at most ${MAX_EXPORTED_PAGE.toLocaleString('en')}. Use smaller pictures, or send the board as a .aphrodite file.`);
  for (const [sha, file] of files) {
    if (file.mime.startsWith('video/')) {
      if (choice.videos === 'out') { use.set(sha, ''); continue; }
      const path = `media/${sha}.${mediaExtension(file.mime)}`;
      use.set(sha, path);
      beside.push({path, sha, bytes: file.bytes});
      continue;
    }
    if (!inline) { use.set(sha, `data:${file.mime};base64,… (${Math.ceil(file.bytes / 1024).toLocaleString('en')} KB)`); continue; }
    const bytes = await host.read(sha);
    if (bytes) use.set(sha, `data:${file.mime};base64,${base64(bytes)}`);
  }
  return {html: head + body.replace(MEDIA_REFS, (all, sha: string) => use.get(sha) ?? all), beside};
}
function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
/** A media item as a page of its own: the picture, or the video with its controls. */
export function mediaPage(name: string, media: {src: string; mime: string; width: number; height: number}): string {
  const title = name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const alt = title.replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>html,body{margin:0;background:#fff}img,video{display:block;max-width:100%;height:auto;margin:0 auto}</style></head><body>${media.mime.startsWith('video/') ? `<video controls playsinline width="${media.width}" height="${media.height}" src="${media.src}"></video>` : `<img alt="${alt}" width="${media.width}" height="${media.height}" src="${media.src}">`}</body></html>`;
}

/** The document a page goes out from: an html page's own, or a media item as a page holding it. */
export function pageSource(page: {name: string; kind?: string; html?: string; media?: {src: string; mime: string; width: number; height: number}}): string {
  if (isFreePage(page)) return page.html;
  return page.media ? mediaPage(page.name, page.media) : '';
}

/**
 * What is written for an exported page: the html file alone, or a zip holding it and its videos. The zip's
 * size is added up from the videos' sizes before any is read. The text is marked UTF-8 by its first bytes,
 * so a page that does not say its charset still reads right; the text itself is as exported.
 */
export async function pageDownload(out: ExportedPage, name: string, host: Pick<FrameHost, 'read'>): Promise<{name: string; bytes: Uint8Array; mime: string}> {
  const html = strToU8('\ufeff' + out.html);
  if (!out.beside.length) return {name: `${name}.html`, bytes: html, mime: 'text/html'};
  const total = html.length + out.beside.reduce((sum, file) => sum + file.bytes, 0);
  if (total > MAX_EXPORT_FILE) throw new Error(`with its videos the page comes to ${total.toLocaleString('en')} bytes; one file holds at most ${MAX_EXPORT_FILE.toLocaleString('en')}. Leave the videos out, or send them apart.`);
  const files: Zippable = {[`${name}.html`]: html};
  for (const file of out.beside) { const bytes = await host.read(file.sha); if (bytes) files[file.path] = [bytes, {level: 0}]; }
  return {name: `${name}.zip`, bytes: zipSync(files, {level: 6}), mime: 'application/zip'};
}
