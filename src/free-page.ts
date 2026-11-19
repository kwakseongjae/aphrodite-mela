/**
 * Free pages and the media on a board: the one place that says what an HTML page and a media item may
 * hold, and that reads them back out. A free page (`kind: 'html'`) keeps its whole document in `html`;
 * a media item (`kind: 'media'`) points at a file on the board by the hash of its bytes. Both keep
 * `blocks: []`. 0.5 moves projects into folders of files; keeping every read and write of HTML and
 * media here is what makes that a change to one module.
 *
 * What is stored never names a place on this machine. A picture or a video on a page is
 * `media:<sha256>` and another page is `page:<id>`; the host turns them into real addresses only
 * when it puts the page in its frame.
 */

/** An html page's own cap, apart from the 20,000 characters every other string in a project is held to. */
export const MAX_PAGE_HTML = 2_000_000;
/** How much of a page one read returns when it does not ask for a range. */
export const HTML_WINDOW = 200_000;

export type PageKind = 'html' | 'media';
export const pageKinds: readonly PageKind[] = ['html', 'media'];
export type PageMedia = {src: string; mime: string; width: number; height: number; duration?: number};
export const mediaMimes: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
const MEDIA_REF = /^media:[0-9a-f]{64}$/;
const MAX_SIDE = 20_000;

export function isFreePage(page: {kind?: unknown; html?: unknown}): page is {kind: 'html'; html: string} {
  return page.kind === 'html' && typeof page.html === 'string';
}

export function validMedia(value: unknown): value is PageMedia {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m = value as PageMedia;
  const side = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= MAX_SIDE;
  if (typeof m.src !== 'string' || !MEDIA_REF.test(m.src) || !mediaMimes.includes(m.mime) || !side(m.width) || !side(m.height)) return false;
  return m.duration === undefined || (Number.isFinite(m.duration) && m.duration >= 0 && m.duration <= 86_400);
}

/**
 * Whether a page's kind, html and media hold together, as a sentence when they do not. An html page has
 * its document and no sections; a media item has its file and nothing else; a section page has neither.
 */
export function pageShapeProblem(page: {kind?: unknown; html?: unknown; media?: unknown; blocks: unknown[]}): string | undefined {
  if (page.kind !== undefined && !(pageKinds as readonly unknown[]).includes(page.kind)) return `a page is a section page, ${pageKinds.join(' or ')}`;
  if ((page.kind === 'html') !== (page.html !== undefined)) return 'an html page, and only an html page, has html';
  if ((page.kind === 'media') !== (page.media !== undefined)) return 'a media item, and only a media item, has media';
  if (page.html !== undefined && (typeof page.html !== 'string' || page.html.length > MAX_PAGE_HTML)) return `a page's html is text of at most ${MAX_PAGE_HTML.toLocaleString('en')} characters`;
  if (page.media !== undefined && !validMedia(page.media)) return `a media item is {src: "media:<sha256>", mime: ${mediaMimes.join('|')}, width, height, duration?}`;
  if (page.kind !== undefined && page.blocks.length) return 'an html page or a media item has no sections';
  return undefined;
}

const MACHINE = /(?:^|[\s,])(file:|asset:|https?:\/\/asset\.localhost)/i;
const URL_ATTRIBUTE = /\b(?:src|href|poster|srcset|data|action|formaction|background|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const CSS_URL = /(?:url\(|@import)\s*["']?\s*(file:|asset:|https?:\/\/asset\.localhost)/i;

/**
 * Why this html may not be stored, or undefined when it may: too long, or pointing at a place on this
 * machine where a page means `media:<hash>` or `page:<id>`. Words about a path are words; only where a
 * page loads or links something is read. It keeps what is stored portable; keeping a page from reaching
 * anything is the frame's job (P2), not this.
 */
export function htmlProblem(html: string): string | undefined {
  if (html.length > MAX_PAGE_HTML) return `the html is ${html.length.toLocaleString('en')} characters; a page holds at most ${MAX_PAGE_HTML.toLocaleString('en')}.`;
  let found: string | undefined;
  for (const m of html.matchAll(URL_ATTRIBUTE)) {
    const hit = (m[1] ?? m[2] ?? m[3] ?? '').match(MACHINE);
    if (hit) { found = hit[1]; break; }
  }
  found ??= html.match(CSS_URL)?.[1];
  if (!found) return undefined;
  return `the html points at a "${found}" address, a place on this machine. A picture or a video on a page is "media:<sha256>" and another page is "page:<id>"; a page names nothing on disk.`;
}

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
function decoded(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? all;
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}
/** Where the tag opened at `open` ends: the first `>` outside its quoted attribute values, or -1 when it never does. */
function tagEnd(html: string, open: number): number {
  for (let at = open + 1; at < html.length; at++) {
    const c = html[at];
    if (c === '>') return at;
    if (c === '"' || c === "'") { at = html.indexOf(c, at + 1); if (at < 0) return -1; }
  }
  return -1;
}
const SKIPPED = new Set(['script', 'style', 'template', 'noscript', 'svg', 'head']);
const BLOCKS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'tfoot', 'thead', 'ul']);

/**
 * The words of a page, for an agent that wants what it says rather than how it is built: headings as
 * `#`, list items as `-`, table rows as `| a | b |`, one paragraph per block. Scripts, styles and
 * drawings are left out. One pass over the tags, so a page that leaves them open costs no more to read.
 */
export function pageText(html: string): string {
  const paragraphs: string[] = [];
  let words = '', lead = '', cells = 0;
  const flush = () => {
    const text = decoded(words).replace(/\s+/g, ' ').trim();
    if (text && /[^|\s]/.test(text)) paragraphs.push(lead + text);
    words = ''; lead = '';
  };
  for (let i = 0; i < html.length;) {
    const open = html.indexOf('<', i);
    if (open < 0) { words += html.slice(i); break; }
    words += html.slice(i, open);
    if (html.startsWith('<!--', open)) { const close = html.indexOf('-->', open + 4); i = close < 0 ? html.length : close + 3; words += ' '; continue; }
    if (html[open + 1] === '!' || html[open + 1] === '?') { const close = html.indexOf('>', open); i = close < 0 ? html.length : close + 1; continue; }
    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(open, open + 40));
    if (!tag) { words += '<'; i = open + 1; continue; }
    const close = tagEnd(html, open);
    if (close < 0) break;
    i = close + 1;
    const closing = tag[1] === '/', name = tag[2].toLowerCase();
    if (!closing && SKIPPED.has(name)) {
      const end = new RegExp(`</${name}\\s*>`, 'gi');
      end.lastIndex = i;
      const hit = end.exec(html);
      i = hit ? hit.index + hit[0].length : html.length;
      words += ' ';
      continue;
    }
    if (/^h[1-6]$/.test(name)) { flush(); if (!closing) lead = '#'.repeat(Number(name[1])) + ' '; }
    else if (name === 'li') { flush(); if (!closing) lead = '- '; }
    else if (name === 'tr') { if (closing) { words += ' |'; flush(); } else { flush(); lead = '| '; cells = 0; } }
    else if ((name === 'td' || name === 'th') && !closing) { if (cells++ > 0) words += ' | '; }
    else if (BLOCKS.has(name)) flush();
    else words += ' ';
  }
  flush();
  return paragraphs.length ? paragraphs.join('\n\n') + '\n' : '';
}

/** Where a frame may load board media from, beside data: URLs: the desktop's asset protocol, or the loopback that serves the browser build. */
const MEDIA_ORIGIN = /^(?:asset:|http:\/\/asset\.localhost|http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5})$/;
/** An address a host may put where a page says `media:<sha256>`: nothing in it can end the attribute or the url() it sits in. */
const MEDIA_ADDRESS = /^(?:data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+|(?:asset|https?):\/\/[^\s"'()<>\\]+)$/;

/**
 * The policy a free page runs under, whatever it holds: its own scripts and styles, pictures and video
 * from data: URLs and from `origins` (where the host keeps board media), and nothing else. No fetch, no
 * socket, no frame, no worker, no form. It cannot stop the frame from being sent somewhere else; the
 * app's own `frame-src` does that (src/csp.mjs).
 */
export function frameCsp(origins: readonly string[]): string {
  for (const origin of origins) if (!MEDIA_ORIGIN.test(origin)) throw new Error(`not a media origin a frame may load from: ${origin}`);
  const media = ['data:', ...origins].join(' ');
  return [`default-src 'none'`, `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'`, `img-src ${media}`, `media-src ${media}`, 'font-src data:', `connect-src 'none'`, `frame-src 'none'`, `worker-src 'none'`, `object-src 'none'`, `form-action 'none'`, `base-uri 'none'`].join('; ');
}

/**
 * What the host runs in the frame before the page: a link to `#x` scrolls inside the page instead of
 * loading the app's address into the frame, a link to `page:<id>` or out of the app is handed to the
 * host to decide, and Esc reaches the host, which cannot hear keys typed inside the frame. It is a
 * convenience, not a wall: a page can undo it, and the frame's sandbox and policy hold without it.
 */
const HOST_SCRIPT = `(()=>{const post=m=>parent.postMessage(Object.assign({aphrodite:'frame'},m),'*');addEventListener('click',e=>{const a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;const h=a.getAttribute('href')||'';e.preventDefault();if(h[0]==='#'){let id='';try{id=decodeURIComponent(h.slice(1));}catch{return;}const t=id&&(document.getElementById(id)||document.getElementsByName(id)[0]);if(t)t.scrollIntoView();else if(!id)scrollTo(0,0);return;}if(/^page:/.test(h)){post({kind:'page',id:h.slice(5)});return;}if(/^(https?|mailto):/i.test(h))post({kind:'link',href:h});},true);addEventListener('submit',e=>e.preventDefault(),true);addEventListener('keydown',e=>{if(e.key==='Escape')post({kind:'escape'});},true);})();`;
/** The end of what the host puts before a page; everything after it is the page as stored, its media resolved. */
export const FRAME_PREFIX_END = '<\/script><!--aphrodite-page-->';

/**
 * The document a frame loads for a free page. The charset and the policy come first, before a single
 * character the page wrote, so no comment, `<head>` or script in the page can come before them; the page
 * follows as stored, with `media:<sha256>` turned into the address `media` gives (a hash it does not
 * hold is left as it is, and loads nothing).
 */
export function framedDocument(html: string, host: {media: (sha: string) => string | undefined; origins: readonly string[]}): string {
  const page = html.replace(/media:([0-9a-f]{64})(?![0-9a-f])/g, (all, sha: string) => {
    const address = host.media(sha);
    if (address === undefined) return all;
    if (!MEDIA_ADDRESS.test(address)) throw new Error(`not a media address a frame may be given: ${address.slice(0, 80)}`);
    return address;
  });
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${frameCsp(host.origins)}"><script>${HOST_SCRIPT}${FRAME_PREFIX_END}${page}`;
}

const lowSurrogate = (text: string, at: number) => { const c = text.charCodeAt(at); return c >= 0xdc00 && c <= 0xdfff; };

/**
 * Part of a page's html, from `start` up to `end` (character offsets, end not included), at most
 * `limit` characters, never cutting a character in two. What comes back is the stored text exactly,
 * so a passage read here can be sent back as `find` to html_replace.
 */
export function htmlWindow(html: string, range: {start?: number; end?: number} = {}, limit = HTML_WINDOW) {
  let start = Math.min(Math.max(0, Math.floor(range.start ?? 0)), html.length);
  let end = Math.min(html.length, Math.max(start, Math.floor(range.end ?? html.length)), start + limit);
  if (start > 0 && start < html.length && lowSurrogate(html, start)) start--;
  if (end > start && end < html.length && lowSurrogate(html, end)) end--;
  return {start, end, length: html.length, more: end < html.length, html: html.slice(start, end)};
}
