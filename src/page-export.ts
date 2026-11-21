/**
 * A page as a file of its own, to send to someone (0.3-P3). It opens in their browser, where the app's wall is
 * not: so by default it goes cleaned (src/page-clean.ts: the browser's own parser, DOMPurify to a list of what may
 * stay, our rules below, and a second reading that must match), with a policy that runs nothing and fetches
 * nothing at the front. Keeping the scripts is the person's choice; then the file is the page as stored, its board
 * files put in where it names them as addresses. A board that should keep running is sent as a board file.
 */
import {strToU8, zipSync, type Zippable} from 'fflate';
import {isFreePage, mediaExtension, mediaNamed, withMedia, type FrameHost} from './free-page';
import {utf8Length} from './workspace/library';
import boardFile from '../src-tauri/board-file.json';

/** The policy the cleaned file carries: its own styles, pictures and fonts as data, its videos beside it, and nothing else. */
export const STATIC_PAGE_CSP = [`default-src 'none'`, `script-src 'none'`, `style-src 'unsafe-inline'`, 'img-src data:', `media-src 'self' file: data:`, 'font-src data:', `connect-src 'none'`, `frame-src 'none'`, `object-src 'none'`, `form-action 'none'`, `base-uri 'none'`].join('; ');
/** The most one file the app writes for the person to send may be, in bytes: a page with its videos beside it, or a board (src/board-file.ts). */
export const MAX_EXPORT_FILE = 1024 * 1024 * 1024;
/** How big one exported page may be with its pictures put in, in bytes: about what a browser still opens without trouble. */
export const MAX_EXPORTED_PAGE = 100_000_000;

/* ---- What a page sent without its scripts may keep, as rules that need no browser (src/page-clean.ts applies them). ---- */

/** Elements taken out whole, with whatever they hold: what runs, what reaches out, what loads another document, and what a browser reads in more than one way. */
export const CLEAN_FORBID_TAGS = ['script', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'link', 'meta', 'plaintext', 'xmp', 'listing', 'noembed', 'noframes', 'foreignobject', 'animate', 'set', 'animatetransform', 'animatemotion', 'discard', 'math', 'portal', 'fencedframe'];
/** Attributes taken out wherever they are: where a form goes, what is pinged, a frame's own document, and the addresses this file cannot keep. */
export const CLEAN_FORBID_ATTR = ['action', 'formaction', 'ping', 'srcdoc', 'srcset', 'imagesrcset', 'imagesizes', 'background', 'codebase', 'manifest', 'longdesc', 'usemap', 'lowsrc', 'dynsrc', 'archive', 'classid', 'attributionsrc'];
/** A board file's address as a page names it, or as the export has put it in before cleaning: its stand-in for a picture, or a video beside the page. */
const MEDIA_ADDRESS_VALUE = /^(?:media:[0-9a-f]{64}|aphrodite-media-[0-9a-f]{16}-[0-9a-f]{64}|media\/[0-9a-f]{64}\.(?:mp4|webm))$/;
const FRAGMENT = /^#[^\s]*$/;
const DATA_FILE = /^data:(?:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)|video\/(?:mp4|webm)|audio\/(?:mpeg|mp4|ogg|wav|webm)|font\/(?:woff2?|ttf|otf))[;,]/i;
const OUT = /^(?:https?:|mailto:|tel:)/i;
const URL_ATTRS = new Set(['src', 'href', 'xlink:href', 'poster', 'data', 'cite', 'action', 'formaction', 'background', 'icon', 'profile', 'itemtype']);
/**
 * Whether an attribute may keep its value in a page sent without its scripts. An address is kept only when it
 * stays in the page: a fragment, a file written into it as data (a picture, a video, a sound, a font), or a board
 * file (`media:<sha256>`) the export puts in. A link a person presses (`<a href>` to the web, to mail or to a phone)
 * is the one address that leads out. Anything else that names an address, `url(…)` in a drawing's paint included, goes.
 */
export function keepsAttribute(tag: string, namespace: 'html' | 'svg', name: string, value: string): boolean {
  const v = value.trim(), lc = name.toLowerCase();
  if (/^on/i.test(lc) || CLEAN_FORBID_ATTR.includes(lc)) return false;
  if (URL_ATTRS.has(lc)) {
    if (v === '') return true;
    if (FRAGMENT.test(v)) return true;
    if (lc === 'href' || lc === 'xlink:href') {
      if (tag === 'a' || (namespace === 'html' && tag === 'area')) return OUT.test(v);
      if (namespace === 'svg' && tag === 'image') return MEDIA_ADDRESS_VALUE.test(v) || DATA_FILE.test(v);
      return false;
    }
    if (lc === 'src' || lc === 'poster') return MEDIA_ADDRESS_VALUE.test(v) || DATA_FILE.test(v);
    return false;
  }
  // Any other value that names an address with url(…): only a fragment, a data file or a board file.
  for (const m of v.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) { const target = m[2].trim(); if (!(FRAGMENT.test(target) || DATA_FILE.test(target) || MEDIA_ADDRESS_VALUE.test(target))) return false; }
  if (/url\(/i.test(v) && !/url\(\s*(['"]?)([^'")]*)\1\s*\)/i.test(v)) return false;
  return true;
}

/** What the person chose: whether the scripts go too, and whether the page's videos go beside it as files or stay behind (their posters do not). */
export type ExportChoice = {scripts: boolean; videos: 'beside' | 'out'};
export type ExportedPage = {html: string; beside: {path: string; sha: string; bytes: number}[]};
const dataLength = (mime: string, bytes: number) => `data:${mime};base64,`.length + Math.ceil(bytes / 3) * 4;

/**
 * The doctype the board's frame puts first (framedDocument), so a page with none, or another, opens in a browser in the
 * same mode it is drawn in on the board.
 */
export function withDoctype(html: string): string {
  return /^<!doctype html>/i.test(html) ? html : '<!doctype html>' + html;
}

/**
 * The file a page goes out as. A picture is put in as a data: address; a video is a file beside it
 * (`media/<sha256>.<extension>`) or is left out. Every `media:<sha256>` the page says is put in where the board puts
 * it (withMedia), each time it is said, and each time is counted in the size. Without its scripts the page is cleaned
 * in the app's window (cleanPage, which throws anywhere else); with them it is the stored page with the doctype the
 * board draws it with, and its board files put in, and nothing else changed. The size is
 * added up from what the host says each file holds before any is read, and a page past MAX_EXPORTED_PAGE is refused.
 * The cleaning runs with short placeholders, so the check that the cleaned page reads back the same never carries a
 * picture's bytes; they go in after. With `inline: false` nothing is read and each picture is shown by its size.
 */
export async function exportPage(source: string, choice: ExportChoice, host: Pick<FrameHost, 'stat' | 'read'>, {inline = true}: {inline?: boolean} = {}): Promise<ExportedPage> {
  const files = new Map<string, {bytes: number; mime: string}>();
  for (const sha of mediaNamed(source)) { const file = await host.stat(sha); if (file && mediaExtension(file.mime) !== 'bin') files.set(sha, file); }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  const placeholder = (sha: string) => `aphrodite-media-${nonce}-${sha}`;
  // A video left behind, and a file this Mac does not have, keep their names: a `media:` address loads nothing anywhere.
  const address = (sha: string) => { const file = files.get(sha); if (!file) return undefined; return file.mime.startsWith('video/') ? choice.videos === 'beside' ? `media/${sha}.${mediaExtension(file.mime)}` : undefined : placeholder(sha); };
  // Board files are put in the stored text first, where the board's frame puts them, and only then is it cleaned (0.3-P3-fix3 #3).
  const placed = withMedia(source, address);
  let html = choice.scripts ? withDoctype(placed) : (await import('./page-clean')).cleanPage(placed);
  const beside: ExportedPage['beside'] = [];
  let length = utf8Length(html);
  const pictures: [string, {bytes: number; mime: string}, number][] = [];
  for (const [sha, file] of files) {
    if (file.mime.startsWith('video/')) { if (choice.videos === 'beside' && html.includes(`media/${sha}.`)) beside.push({path: `media/${sha}.${mediaExtension(file.mime)}`, sha, bytes: file.bytes}); continue; }
    const times = html.split(placeholder(sha)).length - 1;
    if (!times) continue;
    pictures.push([sha, file, times]);
    length += times * (dataLength(file.mime, file.bytes) - placeholder(sha).length);
  }
  if (length > MAX_EXPORTED_PAGE) throw new Error(`with its pictures put in, the page comes to ${length.toLocaleString('en')} bytes; one page holds at most ${MAX_EXPORTED_PAGE.toLocaleString('en')}. Use smaller pictures, or send the board as a .${boardFile.extension} file.`);
  for (const [sha, file] of pictures) {
    let to: string | undefined;
    if (!inline) to = `data:${file.mime};base64,… (${Math.ceil(file.bytes / 1024).toLocaleString('en')} KB)`;
    else { const bytes = await host.read(sha); if (bytes) to = `data:${file.mime};base64,${base64(bytes)}`; }
    html = html.split(placeholder(sha)).join(to ?? `media:${sha}`);
  }
  return {html, beside};
}
/** Bytes as base64, in pieces small enough for String.fromCharCode. */
export function base64(bytes: Uint8Array): string {
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
