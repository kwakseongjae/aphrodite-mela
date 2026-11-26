// Resolve URL paths without a network or filesystem API. The native reader independently confines
// every open to its held directory. Query strings and fragments are never part of a disk filename.
import {MAX_PAGE_HTML, type StoredMedia} from '../free-page';
import {decode} from './document';
import type {GrantedFiles, Issue} from './html';

type Address = {kind: 'local'; name: string; fragment: string} | {kind: 'remote' | 'keep' | 'outside'};
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
    if (part === '..') { if (!parts.length) return {kind: 'outside'}; parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return {kind: 'local', name: parts.join('/'), fragment: url.match(/#.*$/)?.[0] ?? ''};
}
export const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

const codes = new Set(['outside', 'missing', 'denied', 'not_file', 'too_large', 'empty', 'unsupported', 'expired_grant', 'invalid_grant', 'person_only', 'invalid_name', 'io']);
export const readCode = (error: unknown) => typeof error === 'string' && codes.has(error) ? error : 'io';

export class References {
  readonly files = new Map<string, number>();
  readonly skipped: Issue[] = [];
  remote = 0;
  private expanded = 0;
  constructor(private readonly disk: GrantedFiles | undefined, private readonly mediaCache: Map<string, StoredMedia>) {}

  skip(name: string, code: string) { this.skipped.push({name, code}); }
  locate(url: string, directory: string | null) {
    const to = address(url, directory ?? '');
    if (to.kind === 'remote') this.remote++;
    else if (to.kind === 'outside') this.skip(url, 'outside');
    else if (to.kind === 'local') {
      if (directory === null) this.skip(url, 'outside_base');
      else if (!this.disk) this.skip(url, 'no_folder');
      else return to;
    }
    return undefined;
  }

  async media(url: string, directory: string | null): Promise<string> {
    const to = this.locate(url, directory);
    if (!to) return portable(url);
    try {
      const file = this.mediaCache.get(to.name) ?? await this.disk!.media(to.name);
      this.mediaCache.set(to.name, file);
      this.files.set(file.sha, file.bytes);
      return 'media:' + file.sha + to.fragment;
    } catch (error) { this.skip(url, readCode(error)); return portable(url); }
  }

  async text(name: string, url: string, tag: 'script' | 'style') {
    let bytes: Uint8Array;
    try { bytes = await this.disk!.read(name); } catch (error) { this.skip(url, readCode(error)); return; }
    const text = decode(bytes);
    if (text.length > MAX_PAGE_HTML) { this.skip(url, 'too_large'); return; }
    // HTML raw text cannot represent an author-supplied closing tag unchanged.
    if (new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, 'i').test(text)) { this.skip(url, 'raw_end_tag'); return; }
    this.expanded += text.length;
    if (this.expanded > MAX_PAGE_HTML) throw 'too_large';
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    const sha = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    this.files.set(sha, bytes.length);
    return text;
  }
}

/** Machine addresses cannot be stored on any free page. Other refused resources stay behind the wall. */
export const portable = (url: string) => /^(?:file:|asset:|https?:\/\/asset\.localhost(?:[/:?#]|$))/i.test(url.trim()) ? '#' : url;
