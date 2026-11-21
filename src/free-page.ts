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
 *
 * What keeps a page's scripts from reaching past its frame is the frame (sandbox and policy here) and, on
 * the desktop, WebKit itself (src-tauri/src/page_wall.rs: WebRTC and preconnect off, measured by verify:wall).
 * The browser build cannot do the second: a browser has no such settings, so a page there can still reach
 * out over WebRTC and preconnect. It is for development and checks, not for people's pages.
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

/** Why a page takes no sections, as a sentence, or undefined for a section page: an html page or a media item has none. */
export function noSections(page: {id: string; kind?: unknown}): string | undefined {
  if (page.kind === 'html') return `page ${page.id} is an html page, which has no sections. Change it with html_set or html_replace.`;
  if (page.kind !== undefined) return `page ${page.id} is a media item, which has no sections; it is a picture or a video.`;
  return undefined;
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
/** Where in `text` half of a surrogate pair stands on its own, or -1 (0.3-P3-fix2 #4; src/text.ts). Here, not imported: checks load this file in Node as it is. */
export function halfPair(text: string): number {
  return text.search(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
}
export function htmlProblem(html: string): string | undefined {
  if (html.length > MAX_PAGE_HTML) return `the html is ${html.length.toLocaleString('en')} characters; a page holds at most ${MAX_PAGE_HTML.toLocaleString('en')}.`;
  const half = halfPair(html);
  if (half >= 0) return `the html holds half of a surrogate pair on its own at character ${half.toLocaleString('en')}, which cannot be saved. Write the whole character, or leave it out.`;
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
  return [`default-src 'none'`, `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'`, `img-src ${media}`, `media-src ${media}`, 'font-src data:', `connect-src 'none'`, `frame-src 'none'`, `worker-src 'none'`, `object-src 'none'`, `form-action 'none'`, `base-uri 'none'`, `webrtc 'block'`].join('; ');
}

/**
 * What the host runs in the frame before the page: a link to `#x` scrolls inside the page instead of
 * loading the app's address into the frame, a link to `page:<id>` or out of the app is handed to the
 * host to decide, and Esc reaches the host, which cannot hear keys typed inside the frame. It is a
 * convenience, not a wall: a page can undo it, and the frame's sandbox and policy hold without it.
 */
const HOST_SCRIPT = `(()=>{const post=m=>parent.postMessage(Object.assign({aphrodite:'frame'},m),'*');addEventListener('click',e=>{const a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;const h=a.getAttribute('href')||'';e.preventDefault();if(h[0]==='#'){let id='';try{id=decodeURIComponent(h.slice(1));}catch{return;}const t=id&&(document.getElementById(id)||document.getElementsByName(id)[0]);if(t)t.scrollIntoView();else if(!id)scrollTo(0,0);return;}if(/^page:/.test(h)){post({kind:'page',id:h.slice(5)});return;}if(/^(https?|mailto):/i.test(h))post({kind:'link',href:h});},true);addEventListener('submit',e=>e.preventDefault(),true);addEventListener('keydown',e=>{if(e.key==='Escape')post({kind:'escape'});},true);})();`;
/**
 * How long a framed document may be once its media is put in. The browser build puts pictures in as
 * data: URLs, so a page that names one picture a thousand times would otherwise be built a thousand times
 * over (0.3-P2-fix1): 24,000,000 characters is the page's own 2,000,000 and about two pictures at the
 * 8 MB the browser build puts inline, each named once. The desktop names a file by a short asset address.
 */
export const MAX_FRAMED_DOCUMENT = 24_000_000;
/** The end of what the host puts before a page; everything after it is the page as stored, its media resolved. */
export const FRAME_PREFIX_END = '<\/script><!--aphrodite-page-->';

/**
 * The document a frame loads for a free page. The charset and the policy come first, before a single
 * character the page wrote, so no comment, `<head>` or script in the page can come before them; the page
 * follows as stored, with `media:<sha256>` turned into the address `media` gives (a hash it does not
 * hold is left as it is, and loads nothing).
 */
export function framedDocument(html: string, host: {media: (sha: string) => string | undefined; origins: readonly string[]}): string {
  const head = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${frameCsp(host.origins)}"><script>${HOST_SCRIPT}${FRAME_PREFIX_END}`;
  // Counted, and the length known, before a byte is put in: each file goes in while the whole still fits.
  const counts = new Map<string, number>();
  for (const m of html.matchAll(MEDIA_REFS)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const use = new Map<string, string>();
  let length = head.length + html.length;
  for (const [sha, times] of counts) {
    const address = host.media(sha);
    if (address === undefined) continue;
    if (!MEDIA_ADDRESS.test(address)) throw new Error(`not a media address a frame may be given: ${address.slice(0, 80)}`);
    const grows = times * (address.length - 'media:'.length - 64);
    if (length + grows > MAX_FRAMED_DOCUMENT) continue;
    length += grows;
    use.set(sha, address);
  }
  return head + withMedia(html, sha => use.get(sha));
}

const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** A short name for a text, to tell two versions of a page apart (not a check of anything: cyrb53 and the length). */
export function contentKey(text: string): string {
  let h1 = 0xdeadbeef ^ text.length, h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}
/**
 * The page the off-screen renderer loads for a free page. That window is a top-level page of its own,
 * so a page drawn there straight could send it anywhere (RESULTS 0.3-P0 §4); here the page is in the
 * same sandboxed frame as on the board, under a policy that runs nothing of the shell's own and lets the
 * frame be sent nowhere. The frame's scripts run under this policy as well as their own, so it allows
 * what the frame's does and no more.
 */
export function renderShell(doc: string, origins: readonly string[]): string {
  const media = ['data:', ...origins].join(' ');
  for (const origin of origins) if (!MEDIA_ORIGIN.test(origin)) throw new Error(`not a media origin a frame may load from: ${origin}`);
  const csp = [`default-src 'none'`, `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'`, `img-src ${media}`, `media-src ${media}`, 'font-src data:', `connect-src 'none'`, `frame-src 'none'`, `form-action 'none'`, `base-uri 'none'`, `webrtc 'block'`].join('; ');
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts" allow="${FRAME_ALLOW}" srcdoc="${attribute(doc)}"></iframe>`;
}
/** The render page for a free page, its media found the way its board frame finds them. */
export async function renderDocument(page: {html: string}, host: Pick<FrameHost, 'origins' | 'frameCost' | 'frameMedia'>): Promise<string> {
  const {found} = await pageMedia(page.html, host);
  return renderShell(framedDocument(page.html, {media: sha => found.get(sha), origins: host.origins}), host.origins);
}

/** One file on a board holds at most this many bytes (src-tauri/src/board.rs keeps the same). */
export const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
/**
 * The browser build's own cap. It reads a whole file into memory to hash it and keeps it in IndexedDB,
 * where the desktop reads a file in 8 MB pieces; 100 MB holds the 100 MB video P0 played in the browser.
 */
export const MAX_BROWSER_MEDIA_BYTES = 100 * 1024 * 1024;
const mb = (n: number) => Math.ceil(n / 1024 / 1024);

/** What a file is, by its first bytes: one of the six kinds a board shows, or undefined. */
export function sniffMedia(head: Uint8Array): string | undefined {
  const starts = (...b: number[]) => b.every((v, i) => head[i] === v);
  const text = (at: number, s: string) => [...s].every((c, i) => head[at + i] === c.charCodeAt(0));
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (text(0, 'GIF87a') || text(0, 'GIF89a')) return 'image/gif';
  if (text(0, 'RIFF') && text(8, 'WEBP')) return 'image/webp';
  if (text(4, 'ftyp')) return 'video/mp4';
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  return undefined;
}

/** Why a file cannot go on a board, as a sentence, decided from its size and first bytes before it is read in. */
export function mediaRefusal(file: {name: string; size: number}, head: Uint8Array, limit = MAX_MEDIA_BYTES): string | undefined {
  if (file.size > limit) return `${file.name} is ${mb(file.size)} MB; a file on a board holds at most ${mb(limit)} MB${limit < MAX_MEDIA_BYTES ? ' in the browser; the desktop app holds ' + mb(MAX_MEDIA_BYTES) + ' MB' : ''}.`;
  if (!file.size) return `${file.name} is empty.`;
  if (!sniffMedia(head)) return `${file.name} is not a PNG, JPEG, GIF, WebP, MP4 or WebM picture or video.`;
  return undefined;
}

/** The frame a media item sits in: its own shape, as wide as it is up to a desktop frame, never narrower than a frame may be. */
export function mediaFrame(width: number, height: number, at: {x: number; y: number}) {
  const w = Math.round(Math.min(1440, Math.max(240, width)));
  const h = Math.round(Math.min(20_000, Math.max(100, w * height / Math.max(1, width))));
  return {x: Math.round(at.x), y: Math.round(at.y), preset: 'custom' as const, width: w, height: h};
}

/** A file as the board keeps it. */
export type StoredMedia = {sha: string; mime: string; bytes: number};

/**
 * Whether a free page may be put in a frame at all, asked before the first frame is made (0.3-P2-fix4). A
 * free page is framed, with its scripts, only behind the engine's own wall (src-tauri/src/page_wall.rs):
 * every setting reads back off, and a frame made the way free pages are made says it has neither
 * `RTCPeerConnection` nor `navigator.mediaDevices`. Anything else, a macOS whose WebKit lacks a setting, a wall or a frame that does not
 * answer in time, and no free page is put in any frame: the board and Preview show a placeholder and a
 * render is refused. Drawing it without scripts would not do: preconnect needs none (scripts/verify-wall.mjs).
 *
 * The browser build is for development and checks, never shipped. A browser has no such settings: it cannot
 * keep a page from WebRTC or preconnect (verify:pages measures that as a known limit), and it does not
 * pretend to. It frames free pages by this named constant.
 */
export const DEVELOPMENT_BUILD_FRAMES_PAGES = true;
/**
 * What a free page's frame may ask for, in the frame's own allow attribute (0.3-P2-fix5): no camera, microphone,
 * screen or location. It says so in the frame itself; it is not what keeps a page from them. Measured in WebKit
 * (0.3-P2-fix6), a free page's frame is refused them by default with or without it, its sandboxed origin not
 * being the app's, and the wall takes the media devices away altogether (src-tauri/src/page_wall.rs). Autoplay
 * is left out: it captures nothing, and a page may play its own video.
 */
export const FRAME_ALLOW = "camera 'none'; microphone 'none'; display-capture 'none'; geolocation 'none'";
/** How long one asking of the wall may take, the status and the probe frame together, before it is a no. */
export const WALL_DEADLINE = 5000;
/** How many times a no that came from silence or an error is asked again; a no the wall read back is final. */
export const WALL_ASKS = 3;
type Setting = 'off' | 'on' | 'unavailable';
export type WallStatus = {rtc: Setting; preconnect: Setting; capture: Setting};
/** What the probe frame says it has: `typeof RTCPeerConnection` and `typeof navigator.mediaDevices`. */
export type FrameSays = {rtc?: string; media?: string};
export function wallHolds(status: WallStatus | undefined, frameSays: FrameSays | undefined): boolean {
  return status?.rtc === 'off' && status?.preconnect === 'off' && status?.capture === 'off' && frameSays?.rtc === 'undefined' && frameSays?.media === 'undefined';
}

/**
 * How a frame gets its document, decided in this one place. The browser build gives it as srcdoc. The
 * desktop cannot: a srcdoc (or blob:) frame there runs under the app's own `script-src 'self'` and not
 * one of the page's scripts runs (RESULTS 0.3-P0 §1), so the page is written to `free-pages/` and the
 * frame loads it through the asset protocol. That file is a copy for the frame; the project holds the page.
 */
export type FrameHost = {
  /** Where board media may load from inside a frame, beside data: URLs. */
  origins: readonly string[];
  /** How big one file this host keeps may be. */
  maxBytes: number;
  /** Keeps a file the person put on the board, under the hash of its bytes. `holding`: the ticket of a board file's import placing it (hold), which it keeps or takes back with settle. */
  put(file: Blob, options?: {holding?: string}): Promise<StoredMedia>;
  /** A ticket for one board file's import, made by the host, never by the page. */
  hold(): Promise<string>;
  /** An import's end: `keep` keeps what it placed; otherwise the host takes back only the files that import alone put here new (src-tauri/src/board.rs take_back). Whether the import has ended: false while a file is still held, to be taken back again (0.3-P3-fix3 #9). */
  settle(ticket: string, keep: boolean): Promise<boolean>;
  /** Copies a file an agent names onto the board: a path on this Mac or a picture in the image library. Desktop only. */
  importFile(ask: {path?: string; libraryId?: string; project?: string}): Promise<StoredMedia>;
  /** The address the app itself shows a board file at, or undefined when this board has no such file. */
  mediaUrl(sha: string): Promise<string | undefined>;
  /** How long the address frameMedia would give is, without reading the file; undefined when it would give none. */
  frameCost(sha: string): Promise<number | undefined>;
  /** The address a frame may load a media file from, or undefined when this board has no such file. */
  frameMedia(sha: string): Promise<string | undefined>;
  /** What a board file is, its kind and its size in bytes, without reading it; undefined when this board has no such file. */
  stat(sha: string): Promise<{mime: string; bytes: number} | undefined>;
  /** A board file's bytes, whole, for a page or a board the person exports; undefined when this board has no such file. */
  read(sha: string): Promise<Uint8Array | undefined>;
  /** Whether a free page may be put in a frame (wallHolds), asked before any is made. */
  pageWall(): Promise<boolean>;
  /** Puts the framed document in the frame. `key` names this version of the page. */
  load(frame: HTMLIFrameElement, pageId: string, key: string, doc: string): Promise<void>;
};

const MEDIA_REFS = /media:([0-9a-f]{64})(?![0-9a-f])/g;
/**
 * Every `media:<sha256>` in a page's text given its address, wherever it stands: in a picture, in words, in a script.
 * The board's frame (framedDocument) and a page sent as a file (src/page-export.ts) both put addresses in this way,
 * so the file shows what the board shows. One with no address is left as named.
 */
export function withMedia(html: string, address: (sha: string) => string | undefined): string {
  return html.replace(MEDIA_REFS, (all, sha: string) => address(sha) ?? all);
}
/** Each file a page names as `media:<sha256>`, once. */
export function mediaNamed(html: string): string[] {
  return [...new Set(Array.from(html.matchAll(MEDIA_REFS), m => m[1]))];
}
/** The extension a board keeps a file of this kind under (src-tauri/src/board.rs names them the same). */
export function mediaExtension(mime: string): string {
  return ({'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm'} as Record<string, string>)[mime] ?? 'bin';
}
/**
 * The addresses a page's media is given, read one file at a time and only while it fits: each file's
 * cost is asked first (frameCost reads nothing), counted as many times as the page names it, and a file
 * that would take the document past MAX_FRAMED_DOCUMENT is not read at all. `missing` is what the board
 * cannot give a frame (no such file, or one too big to put inline); a file left out for room is not, since
 * drawing the page again would not change it.
 */
async function pageMedia(html: string, host: Pick<FrameHost, 'frameCost' | 'frameMedia'>): Promise<{found: Map<string, string>; missing: string[]}> {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(MEDIA_REFS)) if (counts.has(m[1]) || counts.size < 500) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const found = new Map<string, string>(), missing: string[] = [];
  let length = html.length + 8_000;
  for (const [sha, times] of counts) {
    const cost = await host.frameCost(sha);
    if (cost === undefined) { missing.push(sha); continue; }
    const grows = times * (cost - 'media:'.length - 64);
    if (length + grows > MAX_FRAMED_DOCUMENT) continue;
    const address = await host.frameMedia(sha);
    if (address === undefined) { missing.push(sha); continue; }
    length += times * (address.length - 'media:'.length - 64);
    found.set(sha, address);
  }
  return {found, missing};
}

/** Loads a free page into its frame: its media found first, then the framed document. Says which of the files it names the board cannot give it yet. */
export async function loadFreePage(frame: HTMLIFrameElement, page: {id: string; html: string}, key: string, host: FrameHost): Promise<string[]> {
  const {found, missing} = await pageMedia(page.html, host);
  await host.load(frame, page.id, key, framedDocument(page.html, {media: sha => found.get(sha), origins: host.origins}));
  return missing;
}

/** How much of a file a srcdoc frame in the browser build is given inline: it cannot load the app's blob: URLs. */
const INLINE_MEDIA = 8 * 1024 * 1024;
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/**
 * The browser build: a frame gets its page as srcdoc, which runs under the browser build's policy as well
 * as the page's own (src/csp.mjs), and board files are kept in this browser (IndexedDB), by hash.
 */
export function browserFrameHost(options: {pageWall?: boolean} = {}): FrameHost {
  let db: Promise<IDBDatabase> | undefined;
  const open = () => db ??= new Promise((resolve, reject) => { const r = indexedDB.open('aphrodite-board-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const read = async (sha: string) => (await request((await open()).transaction('files').objectStore('files').get(sha))) as Blob | undefined;
  const urls = new Map<string, string>();
  /* What each import put here new, by its ticket, as the desktop keeps it (src-tauri/src/board.rs Held). One tab only:
     another tab's drop cannot tell this one it now relies on a held file. The browser build is for checks, not shipped. */
  const held = new Map<string, string>(), tickets = new Set<string>();
  return {
    origins: [],
    maxBytes: MAX_BROWSER_MEDIA_BYTES,
    put: async (file, options) => {
      if (file.size > MAX_BROWSER_MEDIA_BYTES) throw new Error(`the file is ${mb(file.size)} MB; a file on a board holds at most ${mb(MAX_BROWSER_MEDIA_BYTES)} MB in the browser.`);
      const mime = sniffMedia(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
      if (!mime) throw new Error('the file is not a PNG, JPEG, GIF, WebP, MP4 or WebM picture or video.');
      const sha = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      const holding = options?.holding;
      if (holding !== undefined && !tickets.has(holding)) throw new Error('that import has ended');
      const db = await open();
      // Another import's hold on this file ends the moment this put begins, before any wait: a take-back that looks
      // after this sees it is not that import's alone any more (0.3-P3-fix3 #8).
      if (held.has(sha) && held.get(sha) !== holding) held.delete(sha);
      // Whether it is here and putting it if not, in one transaction: no other write in this tab comes between. What
      // it did counts once the transaction has completed; one that is aborted puts nothing, and says so.
      const tx = db.transaction('files', 'readwrite'), store = tx.objectStore('files');
      let fresh = false;
      const got = store.get(sha);
      got.onsuccess = () => { if (!got.result) { fresh = true; store.put(new Blob([file], {type: mime}), sha); } };
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error('the file was not kept')); tx.onerror = () => reject(tx.error ?? new Error('the file was not kept')); });
      if (fresh && holding !== undefined) held.set(sha, holding);
      return {sha, mime, bytes: file.size};
    },
    hold: async () => { const ticket = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); tickets.add(ticket); return ticket; },
    settle: async (ticket, keep) => {
      if (!tickets.has(ticket)) return true;
      const db = await open();
      for (const sha of [...held.keys()]) {
        // Looked at again right before each file, and the delete begun with no wait in between: a put that came since
        // has let go of it, and a put that comes after is ordered after the delete (0.3-P3-fix3 #8).
        if (held.get(sha) !== ticket) continue;
        if (!keep) { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(sha); try { await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); }); } catch { continue; } const url = urls.get(sha); if (url) { URL.revokeObjectURL(url); urls.delete(sha); } }
        if (held.get(sha) === ticket) held.delete(sha);
      }
      if (![...held.values()].includes(ticket)) tickets.delete(ticket);
      return !tickets.has(ticket);
    },
    importFile: async () => { throw new Error('the browser build cannot read files on this Mac; drop the file onto the board, or use the desktop app.'); },
    mediaUrl: async sha => { const known = urls.get(sha); if (known) return known; const blob = await read(sha); if (!blob) return undefined; const url = URL.createObjectURL(blob); urls.set(sha, url); return url; },
    stat: async sha => { const blob = await read(sha); return blob ? {mime: blob.type, bytes: blob.size} : undefined; },
    read: async sha => { const blob = await read(sha); return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined; },
    frameCost: async sha => { const blob = await read(sha); return blob && blob.size <= INLINE_MEDIA ? `data:${blob.type};base64,`.length + Math.ceil(blob.size / 3) * 4 : undefined; },
    frameMedia: async sha => {
      const blob = await read(sha);
      if (!blob || blob.size > INLINE_MEDIA) return undefined;
      return `data:${blob.type};base64,${btoa(Array.from(new Uint8Array(await blob.arrayBuffer()), b => String.fromCharCode(b)).join(''))}`;
    },
    pageWall: async () => options.pageWall ?? DEVELOPMENT_BUILD_FRAMES_PAGES,
    load: async (frame, _page, _key, doc) => { frame.srcdoc = doc; },
  };
}

type Native = {invoke: <T>(command: string, args?: Record<string, unknown> | Uint8Array, options?: {headers: Record<string, string>}) => Promise<T>; fileSrc: (path: string) => string};
/** How much of a dropped file one call carries to the desktop. */
const PIECE = 8 * 1024 * 1024;
/**
 * The desktop: board files in `board-media/` and page copies in `free-pages/` (src-tauri/src/board.rs),
 * both loaded through the asset protocol, whose scope is those two folders and nothing else.
 */
export function desktopFrameHost(native: Native, timing: {deadline: number} = {deadline: WALL_DEADLINE}): FrameHost {
  const where = async (sha: string) => { const path = await native.invoke<string | null>('board_media_path', {sha}).catch(() => null); return path ? native.fileSrc(path) : undefined; };
  let settled: boolean | undefined, asking: Promise<boolean> | undefined, asks = 0;
  /* One asking of the wall, under one deadline: the status, then a frame made the way free pages are made,
     asked what it has. Whatever comes after the deadline is ignored, and the frame is taken away either way.
     A no from silence or an error is not final (pageWall asks again); one read back from WebKit is. */
  const ask = () => new Promise<{holds: boolean; final: boolean}>(resolve => {
    let done = false, frame: HTMLIFrameElement | undefined, status: WallStatus | undefined;
    const hear = (e: MessageEvent) => { if (frame && e.source === frame.contentWindow && e.data && typeof e.data.wallProbe === 'string') end({holds: wallHolds(status, {rtc: e.data.wallProbe, media: e.data.media}), final: true}); };
    const end = (answer: {holds: boolean; final: boolean}) => { if (done) return; done = true; clearTimeout(timer); removeEventListener('message', hear); frame?.remove(); resolve(answer); };
    const timer = setTimeout(() => end({holds: false, final: false}), timing.deadline);
    native.invoke<WallStatus>('page_wall_status').then(read => {
      if (done) return;
      status = read;
      if (read?.rtc !== 'off' || read.preconnect !== 'off' || read.capture !== 'off') return end({holds: false, final: !!read});
      frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('allow', FRAME_ALLOW);
      frame.hidden = true;
      addEventListener('message', hear);
      document.body.append(frame);
      return host.load(frame, 'page-wall-probe', 'probe', framedDocument('<script>parent.postMessage({wallProbe: typeof RTCPeerConnection, media: typeof navigator.mediaDevices}, "*")</script>', {media: () => undefined, origins: host.origins}));
    }).catch(() => end({holds: false, final: false}));
  });
  const host: FrameHost = {
    origins: ['asset:', 'http://asset.localhost'],
    maxBytes: MAX_MEDIA_BYTES,
    put: async (file, options) => {
      if (file.size > MAX_MEDIA_BYTES) throw new Error(`the file is ${mb(file.size)} MB; a file on a board holds at most ${mb(MAX_MEDIA_BYTES)} MB.`);
      const id = await native.invoke<string>('board_media_begin');
      for (let at = 0; at < file.size; at += PIECE) await native.invoke('board_media_chunk', new Uint8Array(await file.slice(at, at + PIECE).arrayBuffer()), {headers: {'upload-id': id}});
      return native.invoke<StoredMedia>('board_media_finish', {id, holding: options?.holding ?? null});
    },
    hold: () => native.invoke<string>('board_media_hold_begin'),
    settle: async (ticket, keep) => { if (keep) { await native.invoke('board_media_keep', {ticket}); return true; } return (await native.invoke<{removed: string[]; left: number}>('board_media_take_back', {ticket})).left === 0; },
    importFile: ask => native.invoke<StoredMedia>('board_media_import', {path: ask.path ?? null, libraryId: ask.libraryId ?? null, project: ask.project ?? null}),
    mediaUrl: where,
    // A failure to look is not an answer: it throws, rather than reading as a file this Mac does not have (0.3-P3-fix3 #9).
    stat: async sha => (await native.invoke<StoredMedia | null>('board_media_stat', {sha})) ?? undefined,
    read: async sha => { try { return new Uint8Array(await native.invoke<ArrayBuffer>('board_media_read', {sha})); } catch { return undefined; } },
    frameCost: async sha => (await where(sha))?.length,
    frameMedia: where,
    // The copy is named for the document the frame loads, not the page alone: a picture the page names that
    // reaches this Mac later changes the document, and so the copy.
    load: async (frame, page, _key, doc) => { frame.src = native.fileSrc(await native.invoke<string>('free_page_write', {page, key: contentKey(doc), html: doc})); },
    pageWall: () => settled !== undefined ? Promise.resolve(settled) : asking ??= ask().then(answer => {
      asking = undefined;
      if (answer.final || ++asks >= WALL_ASKS) settled = answer.holds;
      return answer.holds;
    }),
  };
  return host;
}

/**
 * Where a link out of a page goes, read the way the browser will read it, for the person to see before
 * they open it: the host on its own (an international name in its ASCII form), and the whole address,
 * shortened in the middle when it is long so the host and the end stay in view. An address that hides its
 * host (a name and password before it, direction marks, control characters) is not offered at all;
 * open_link in src-tauri/src/update.rs refuses the same.
 */
export function linkOut(raw: string): {host: string; href: string; shown: string} | {refused: string} {
  if (raw.length > 2000) return {refused: 'the address is too long'};
  if (/[\s\u0000-\u001f\u007f-\u009f\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069"'<>\\]/.test(raw)) return {refused: 'the address has hidden or unsafe characters in it'};
  // Read as written, before the browser tidies it: no name or password (even an empty one) and no
  // encoded characters before the host, and a mail address names who it goes to. open_link checks the same.
  const web = /^https?:\/\//i.exec(raw);
  if (web) { const authority = raw.slice(web[0].length).split(/[/?#]/)[0]; if (!authority || /[@%]/.test(authority)) return {refused: 'the address hides or encodes its host'}; }
  else if (/^mailto:/i.test(raw)) { if (!/^[^@?#%]+@[^@?#%]+$/.test(raw.slice(7).split(/[?#]/)[0])) return {refused: 'the mail address names nobody'}; }
  else return {refused: 'only a web or mail address opens from a page'};
  let url: URL;
  try { url = new URL(raw); } catch { return {refused: 'that is not an address'}; }
  if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return {refused: 'only a web or mail address opens from a page'};
  if (url.username || url.password) return {refused: 'the address puts a name and password before its host, which hides where it goes'};
  const host = url.protocol === 'mailto:' ? url.pathname.split('@').pop() ?? '' : url.hostname;
  if (!host) return {refused: 'the address has no host'};
  const href = url.href;
  const lead = url.protocol === 'mailto:' ? '' : `${url.protocol}//${url.host}/`;
  const shown = href.length <= 200 ? href : href.startsWith(lead) && lead.length < 120 ? `${lead}${href.slice(lead.length, lead.length + 40)}…${href.slice(-40)}` : `${href.slice(0, 120)}…${href.slice(-40)}`;
  return {host, href, shown};
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
