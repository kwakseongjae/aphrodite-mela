/**
 * The board file: one board, as a zip, to hand to someone else's Aphrodite and open there as it was,
 * scripts and all (0.3-P3). `board.json` is the project without its pages' html, `pages/<id>.html` each html
 * page's document, `media/<sha256>.<extension>` each file the board names and `ledger/changes.json` its history.
 *
 * A file that comes in is someone else's, and nothing in it is taken on its word. Names are read off a list,
 * never used as a path: anything else, a folder climbed out of, a link, a name twice, refuses the whole file.
 * Every size is added up from the zip's own directory before a byte is unpacked, and no entry unpacks past
 * the size it declared or a cap of its own. The project is read by parseProject, each page by htmlProblem,
 * each file by its first bytes and the hash of its bytes, which must be its name, and the history by
 * readLedger. A received board is always a new board: a new id, and no approval, which no file can give.
 */
import {Inflate, strFromU8, strToU8, zipSync, type Zippable} from 'fflate';
import {MAX_PROJECT, parseProject, uid, type Project} from './model';
import {htmlProblem, isFreePage, MAX_PAGE_HTML, mediaExtension, mediaNamed, sniffMedia, type FrameHost} from './free-page';
import {LEDGER_BUDGET, type Ledger} from './ledger/types';
import {MAX_EXPORT_FILE} from './page-export';
import {utf8Length} from './workspace/library';
import named from '../src-tauri/board-file.json';

/**
 * What a board file is called, in the one place it is named (src-tauri/board-file.json): its extension, MIME type
 * and macOS document type. Rust reads the same file, and tests hold tauri.conf.json to it.
 */
export const BOARD_FILE: {extension: string; mime: string; type: string; name: string; description: string} = named;
/** The file name a board goes out as: what `fileName` makes of it, with the board file's extension. */
export const isBoardFileName = (name: string) => name.toLowerCase().endsWith(`.${BOARD_FILE.extension}`);
/** The most a board file may be, packed and unpacked alike, in bytes: what any file the app writes to send may be (src-tauri/src/opened.rs refuses a bigger one the same). */
export const MAX_BOARD_FILE = MAX_EXPORT_FILE;
const MAX_ENTRIES = 2_000;
/** How much packed data is unpacked at a time, so an entry that runs on past what it declared is stopped within a few megabytes. */
const PIECE = 4096;

export class BoardFileError extends Error {}
const refuse = (why: string): never => { throw new BoardFileError(why); };

const FOLDERS = ['pages/', 'media/', 'ledger/'];
const PAGE = /^pages\/([a-zA-Z0-9_-]{1,200})\.html$/;
const MEDIA = /^media\/([0-9a-f]{64})\.(png|jpg|gif|webp|mp4|webm)$/;
/** The most bytes an entry may unpack to, by its name; undefined for a name a board file does not have. A text's cap is its cap in characters at three bytes each, the most UTF-8 spends on one. */
function entryCap(name: string, mediaBytes: number): number | undefined {
  if (name === 'board.json') return 3 * MAX_PROJECT;
  if (name === 'ledger/changes.json') return 3 * LEDGER_BUDGET;
  if (PAGE.test(name)) return 3 * MAX_PAGE_HTML;
  if (MEDIA.test(name)) return mediaBytes;
  return undefined;
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(bytes: Uint8Array): number { let c = -1; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

type Entry = {name: string; method: number; crc: number; packed: number; size: number; at: number};
/**
 * The entries of a zip, read off its central directory and checked before anything is unpacked: only names a
 * board file has, each once (in any case), no link and nothing encrypted, stored or deflated only, every size
 * within its cap and all of them together within MAX_BOARD_FILE. `read` unpacks one entry, to no more than
 * the size it declared, and checks it against its CRC.
 */
export function readZip(bytes: Uint8Array, mediaBytes: number): {names: string[]; read: (name: string, progress?: (unpacked: number) => void) => Uint8Array} {
  if (bytes.length > MAX_BOARD_FILE) refuse(`the file is ${bytes.length.toLocaleString('en')} bytes; a board file holds at most ${MAX_BOARD_FILE.toLocaleString('en')}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true), u32 = (at: number) => view.getUint32(at, true);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) { end = at; break; }
  if (end < 0) refuse('it is not a zip file');
  const count = u16(end + 10), dirSize = u32(end + 12), dirAt = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count) refuse('a zip in several parts is not a board file');
  if (count === 0xffff || dirAt === 0xffffffff || dirSize === 0xffffffff) refuse('a zip64 file is not a board file');
  if (count > MAX_ENTRIES) refuse(`it has ${count} entries; a board file has at most ${MAX_ENTRIES}`);
  if (dirAt + dirSize > end) refuse('its directory runs past where it ends');
  const entries = new Map<string, Entry>(), seen = new Set<string>();
  let total = 0, at = dirAt;
  for (let i = 0; i < count; i++) {
    if (at + 46 > dirAt + dirSize || u32(at) !== 0x02014b50) refuse('its directory is broken');
    const madeBy = u16(at + 4) >> 8, flags = u16(at + 8), method = u16(at + 10), crc = u32(at + 16), packed = u32(at + 20), size = u32(at + 24);
    const nameLength = u16(at + 28), extra = u16(at + 30), comment = u16(at + 32), disk = u16(at + 34), mode = u32(at + 38) >>> 16, local = u32(at + 42);
    if (at + 46 + nameLength > dirAt + dirSize) refuse('its directory is broken');
    const raw = bytes.subarray(at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extra + comment;
    if (!raw.every(b => b > 0x20 && b < 0x7f)) refuse('an entry has a name that is not plain text');
    const name = String.fromCharCode(...raw);
    if (seen.has(name.toLowerCase())) refuse(`it has ${name} twice`);
    seen.add(name.toLowerCase());
    if (madeBy === 3 && (mode & 0o170000) === 0o120000) refuse(`${name} is a link`);
    if (FOLDERS.includes(name)) continue;
    const cap = entryCap(name, mediaBytes);
    if (cap === undefined) refuse(`${name.slice(0, 80)} is not something a board file holds`);
    if (flags & 1) refuse(`${name} is encrypted`);
    if (method !== 0 && method !== 8) refuse(`${name} is packed in a way a board file is not`);
    if (disk || packed === 0xffffffff || size === 0xffffffff) refuse(`${name} is in a zip64 part`);
    if (size > cap!) refuse(`${name} unpacks to ${size.toLocaleString('en')} bytes; it may be at most ${cap!.toLocaleString('en')}`);
    if (method === 0 && packed !== size) refuse(`${name} says two sizes`);
    total += size;
    if (total > MAX_BOARD_FILE) refuse(`it unpacks to more than ${MAX_BOARD_FILE.toLocaleString('en')} bytes`);
    if (local + 30 > dirAt) refuse(`${name} starts past its data`);
    entries.set(name, {name, method, crc, packed, size, at: local});
  }
  const read = (name: string, progress?: (unpacked: number) => void): Uint8Array => {
    const e = entries.get(name) ?? refuse(`it has no ${name}`);
    if (u32(e.at) !== 0x04034b50 || u16(e.at + 26) !== e.name.length || String.fromCharCode(...bytes.subarray(e.at + 30, e.at + 30 + e.name.length)) !== e.name) refuse(`${name} does not match its directory`);
    const from = e.at + 30 + u16(e.at + 26) + u16(e.at + 28);
    if (from + e.packed > dirAt) refuse(`${name} runs past its data`);
    const data = bytes.subarray(from, from + e.packed);
    let out: Uint8Array;
    if (e.method === 0) out = data;
    else {
      out = new Uint8Array(e.size);
      let filled = 0, ended = false;
      const inflate = new Inflate((chunk, final) => {
        progress?.(filled + chunk.length);
        if (filled + chunk.length > e.size) refuse(`${name} unpacks past the ${e.size.toLocaleString('en')} bytes it declared`);
        out.set(chunk, filled); filled += chunk.length; if (final) ended = true;
      });
      try { for (let i = 0; i < data.length; i += PIECE) inflate.push(data.subarray(i, i + PIECE), i + PIECE >= data.length); }
      catch (error) { if (error instanceof BoardFileError) throw error; refuse(`${name} could not be unpacked`); }
      if (!ended || filled !== e.size) refuse(`${name} unpacks to less than it declared`);
    }
    if (crc32(out) !== e.crc) refuse(`${name} is not what its directory says`);
    return out;
  };
  return {names: [...entries.keys()], read};
}

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
const json = (bytes: Uint8Array, what: string): unknown => { try { return JSON.parse(strFromU8(bytes)); } catch { return refuse(`${what} is not JSON`); } };
const plain = (bytes: Uint8Array) => new TextDecoder('utf-8', {fatal: true}).decode(bytes);

/** The files a project names: its media items' and every `media:<sha256>` in its pages' html. */
export function filesNamed(project: Project): string[] {
  const named = new Set<string>();
  for (const page of project.pages) {
    if (page.media) named.add(page.media.src.slice('media:'.length));
    if (isFreePage(page)) for (const sha of mediaNamed(page.html)) named.add(sha);
  }
  return [...named];
}

/** What a board file was read into: the project, never yet saved anywhere, and the files that were left out and why. */
export type ReadBoard = {project: Project; files: number; left: {file: string; why: string}[]};

/**
 * Reads a board file someone else made. Every file it names is checked and put on this board (`host.put`)
 * before the project is given back, so the board the caller then adds finds its files there. A file whose
 * bytes are not a picture or a video, or whose hash is not its name, is left out and said so; anything
 * else that does not hold together refuses the whole file, and nothing is placed.
 */
export async function readBoardFile(bytes: Uint8Array, host: Pick<FrameHost, 'put' | 'maxBytes'>): Promise<ReadBoard> {
  const zip = readZip(bytes, host.maxBytes);
  if (!zip.names.includes('board.json')) refuse('it has no board.json');
  const raw = json(zip.read('board.json'), 'board.json') as {pages?: unknown; [key: string]: unknown};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.pages)) refuse('board.json is not a board');
  // What a file says about approval, its own id and its history is not read from board.json: a received
  // board is new, unapproved, and its history comes from ledger/ alone.
  delete raw.approvedFingerprint; delete raw.ledger;
  raw.id = uid();
  for (const page of raw.pages as {id?: unknown; kind?: unknown; html?: unknown}[]) {
    if (!page || typeof page !== 'object') continue;
    delete page.html;
    if (page.kind !== 'html') continue;
    const name = `pages/${String(page.id)}.html`;
    if (!PAGE.test(name) || !zip.names.includes(name)) refuse(`the page ${String(page.id).slice(0, 80)} has no html in the file`);
    let html: string;
    try { html = plain(zip.read(name)); } catch (error) { if (error instanceof BoardFileError) throw error; refuse(`${name} is not UTF-8 text`); }
    const problem = htmlProblem(html!);
    if (problem) refuse(`${name}: ${problem}`);
    page.html = html!;
  }
  if (zip.names.includes('ledger/changes.json')) raw.ledger = json(zip.read('ledger/changes.json'), 'ledger/changes.json');
  let project: Project;
  try { project = parseProject(JSON.stringify(raw)); } catch (error) { refuse(`board.json: ${error instanceof Error ? error.message : String(error)}`); }
  delete project!.approvedFingerprint;
  // A change made in the other copy is that copy's, whoever it says made it: never this Mac's person or agents.
  if (project!.ledger) project!.ledger = elsewhere(project!.ledger);
  const left: ReadBoard['left'] = [];
  let files = 0;
  const carried = new Map(zip.names.flatMap(n => { const m = MEDIA.exec(n); return m ? [[m[1], n] as const] : []; }));
  for (const sha of filesNamed(project!)) {
    const name = carried.get(sha);
    if (!name) { left.push({file: sha, why: 'the file does not carry it'}); continue; }
    const data = zip.read(name), mime = sniffMedia(data.subarray(0, 16));
    if (!mime || mediaExtension(mime) !== MEDIA.exec(name)![2]) { left.push({file: sha, why: 'it is not the picture or video its name says'}); continue; }
    if (hex(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)) !== sha) { left.push({file: sha, why: 'its bytes are not the ones its name was made from'}); continue; }
    const stored = await host.put(new Blob([data as Uint8Array<ArrayBuffer>], {type: mime}));
    if (stored.sha !== sha) { left.push({file: sha, why: 'it was kept under another name'}); continue; }
    files++;
  }
  return {project: project!, files, left};
}

/** A ledger read from a file, each change marked as made elsewhere: its author's name is kept, and it is never taken for someone on this Mac. */
function elsewhere(ledger: Ledger): Ledger {
  return {...ledger, changes: ledger.changes.map(c => ({...c, author: {...c.author, elsewhere: true as const}}))};
}


/**
 * Writes a board as a board file. Its size is added up first, each file's from what the host says it holds,
 * and a board past MAX_BOARD_FILE is refused before any file is read. A file the board names but does not
 * have is left out and said so. Approval does not travel: the person who opens it has not approved anything.
 */
export async function writeBoardFile(project: Project, host: Pick<FrameHost, 'stat' | 'read'>): Promise<{bytes: Uint8Array; left: string[]}> {
  const board = JSON.parse(JSON.stringify({...project, ledger: undefined, approvedFingerprint: undefined})) as Project;
  const texts: Record<string, string> = {};
  for (const page of board.pages) if (isFreePage(page)) { texts[`pages/${page.id}.html`] = page.html; delete (page as {html?: string}).html; }
  texts['board.json'] = JSON.stringify(board);
  if (project.ledger) texts['ledger/changes.json'] = JSON.stringify(project.ledger);
  const sizes = new Map<string, number>(), left: string[] = [];
  let total = Object.values(texts).reduce((sum, text) => sum + utf8Length(text), 0);
  for (const sha of filesNamed(project)) { const file = await host.stat(sha); if (!file) left.push(sha); else { sizes.set(sha, file.bytes); total += file.bytes; } }
  if (total > MAX_BOARD_FILE) refuse(`the board comes to ${total.toLocaleString('en')} bytes; a board file holds at most ${MAX_BOARD_FILE.toLocaleString('en')}. Take a video or two off the board, or send them apart.`);
  const files: Zippable = {};
  for (const [name, text] of Object.entries(texts)) files[name] = strToU8(text);
  for (const sha of sizes.keys()) {
    const data = await host.read(sha), mime = data && sniffMedia(data.subarray(0, 16));
    if (!data || !mime) { left.push(sha); continue; }
    files[`media/${sha}.${mediaExtension(mime)}`] = [data, {level: 0}];
  }
  return {bytes: zipSync(files, {level: 6}), left};
}

/**
 * An address that opens a board, and a page on it, in the app: `aphrodite://open?board=<id>&page=<id>`. It
 * names what to open and nothing else, so reading one opens and never edits: a link with anything more,
 * a path or a file among it, is not read at all. src-tauri/src/opened.rs reads it the same (tests/support/open-links.json).
 */
export type OpenLink = {board: string; page?: string};
const ID = /^[a-zA-Z0-9_-]{1,200}$/;
export function readOpenLink(href: string): OpenLink | undefined {
  if (href.length > 1000 || !/^aphrodite:\/\/open\/?\?/i.test(href)) return undefined;
  const query = href.slice(href.indexOf('?') + 1);
  if (query.includes('#')) return undefined;
  const got: Record<string, string> = {};
  for (const pair of query.split('&')) {
    const [key, value, more] = pair.split('=');
    if (more !== undefined || value === undefined || (key !== 'board' && key !== 'page') || key in got || !ID.test(value)) return undefined;
    got[key] = value;
  }
  return got.board ? {board: got.board, ...(got.page ? {page: got.page} : {})} : undefined;
}
export function openLink(board: string, page?: string): string {
  return `aphrodite://open?board=${board}${page ? `&page=${page}` : ''}`;
}
