// Resolve URL paths without a network or filesystem API. The native reader independently confines
// every open to its held directory. Query strings and fragments are never part of a disk filename.
import {MAX_PAGE_HTML, type StoredMedia} from '../free-page';
import {decode} from './document';
import type {GrantedFiles, Issue} from './html';

type Address = {kind: 'local'; name: string; fragment: string} | {kind: 'remote' | 'keep' | 'outside' | 'hidden'};
export function address(raw: string, directory: string): Address {
  const url = raw.trim();
  if (/^(?:asset:|https?:\/\/asset\.localhost(?:[/:?#]|$))/i.test(url)) return {kind: 'outside'};
  if (/^(?:https?:|\/\/)/i.test(url)) return {kind: 'remote'};
  if (!url || /^(?:[#?]|data:|media:|page:)/i.test(url)) return {kind: 'keep'};
  let path: string;
  try { path = decodeURIComponent(url.split(/[?#]/, 1)[0]); } catch { return {kind: 'outside'}; }
  if (/^(?:\/|[a-z][\w+.-]*:)|[\\\x00-\x1f\x7f]/i.test(path)) return {kind: 'outside'};
  const parts = directory.split('/').filter(Boolean);
  for (const part of path.split('/')) {
    if (part.startsWith('.') && part !== '.' && part !== '..') return {kind: 'hidden'};
    if (part === '..') { if (!parts.length) return {kind: 'outside'}; parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return {kind: 'local', name: parts.join('/'), fragment: url.match(/#.*$/)?.[0] ?? ''};
}
export const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

const codes = new Set(['not_html', 'invalid_html', 'outside', 'missing', 'denied', 'not_file', 'too_large', 'empty', 'unsupported', 'expired_grant', 'invalid_grant', 'person_only', 'invalid_name', 'hidden', 'changed', 'symlink', 'read_limit', 'copy_limit', 'window_destroyed', 'encoding', 'io']);
export const readCode = (error: unknown) => typeof error === 'string' && codes.has(error) ? error : 'io';

export const MAX_DOCUMENTS = 128;
export const MAX_DIAGNOSTICS = 128;
export const MAX_REFERENCES = 500;
export const READ_BYTES = 128 * 1024 * 1024;
export const COPY_BYTES = 100 * 1024 * 1024;

export class ImportFiles {
  readonly media = new Map<string, StoredMedia>();
  private readonly sheets = new Map<string, Promise<Uint8Array>>();
  private remainingRead = READ_BYTES;
  private remainingCopy = COPY_BYTES;
  constructor(readonly disk?: GrantedFiles) {}

  async read(name: string, kind: 'document' | 'style' | 'script'): Promise<Uint8Array> {
    const cached = kind === 'style' && this.sheets.get(name);
    if (cached) return cached;
    if (!this.remainingRead) throw 'read_limit';
    const read = this.disk!.read(name, kind, this.remainingRead).then(bytes => {
      if (bytes.length > this.remainingRead) throw 'read_limit';
      this.remainingRead -= bytes.length;
      return bytes;
    });
    if (kind === 'style') this.sheets.set(name, read);
    return read;
  }

  async binary(name: string) {
    const cached = this.media.get(name);
    if (cached) return cached;
    if (!this.remainingRead) throw 'read_limit';
    if (!this.remainingCopy) throw 'copy_limit';
    const file = await this.disk!.media(name, Math.min(this.remainingCopy, this.remainingRead));
    this.media.set(name, file);
    if (file.bytes > this.remainingCopy || file.bytes > this.remainingRead) throw 'copy_limit';
    this.remainingRead -= file.bytes;
    this.remainingCopy -= file.bytes;
    return file;
  }
}

export class References {
  readonly files = new Map<string, number>();
  readonly names = new Set<string>();
  private followed = 0;
  skippedCount = 0;
  remote = 0;
  private expanded = 0;
  constructor(readonly source: ImportFiles, private readonly report: (issue: Issue) => void) {}

  checkpoint() {
    const names = new Set(this.names), files = new Map(this.files), expanded = this.expanded;
    return () => {
      this.expanded = expanded;
      for (const name of this.names) if (!names.has(name)) this.names.delete(name);
      for (const hash of this.files.keys()) if (!files.has(hash)) this.files.delete(hash);
    };
  }
  skip(name: string, code: string) { this.skippedCount++; this.report({name, code}); }
  locate(url: string, directory: string | null) {
    const to = address(url, directory ?? '');
    if (to.kind === 'remote') this.remote++;
    else if (to.kind === 'outside' || to.kind === 'hidden') this.skip(url, to.kind);
    else if (to.kind === 'local') {
      if (directory === null) this.skip(url, 'outside_base');
      else if (to.name.split('/').some(part => part.startsWith('.'))) this.skip(url, 'hidden');
      else if (!this.source.disk) this.skip(url, 'no_folder');
      else if (this.followed >= MAX_REFERENCES) this.skip(url, 'reference_limit');
      else { this.followed++; return to; }
    }
    return undefined;
  }

  async media(url: string, directory: string | null): Promise<string> {
    const to = this.locate(url, directory);
    if (!to) return portable(url);
    if (!/\.(?:png|jpe?g|gif|webp|mp4|webm|woff2?|ttf|otf|wav|ogg|mp3)$/i.test(to.name)) {
      this.skip(url, 'unsupported'); return portable(url);
    }
    try {
      const file = await this.source.binary(to.name);
      this.names.add(to.name);
      this.files.set(file.sha, file.bytes);
      return 'media:' + file.sha + to.fragment;
    } catch (error) { this.skip(url, readCode(error)); return portable(url); }
  }

  async text(name: string, url: string, tag: 'script' | 'style', fallback: string) {
    if (!(tag === 'style' ? /\.css$/i : /\.(?:js|mjs|cjs)$/i).test(name)) { this.skip(url, 'unsupported'); return; }
    let bytes: Uint8Array, decoded;
    try {
      bytes = await this.source.read(name, tag);
      decoded = decode(bytes, tag === 'style' ? 'css' : 'script', fallback);
    } catch (error) { this.skip(url, readCode(error)); return; }
    const {text} = decoded;
    if (text.length > MAX_PAGE_HTML) { this.skip(url, 'too_large'); return; }
    // HTML raw text cannot represent an author-supplied closing tag unchanged.
    if (new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, 'i').test(text)) { this.skip(url, 'raw_end_tag'); return; }
    this.expanded += text.length;
    if (this.expanded > MAX_PAGE_HTML) throw 'too_large';
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    const sha = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    this.names.add(name);
    this.files.set(sha, bytes.length);
    return decoded;
  }
}

/** Machine addresses cannot be stored on any free page. Other refused resources stay behind the wall. */
export const portable = (url: string) => /^(?:file:|asset:|https?:\/\/asset\.localhost(?:[/:?#]|$))/i.test(url.trim()) ? '#' : url;
