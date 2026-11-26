import {runBatch} from '../agent/apply';
import {refusal, type Dispatch} from '../agent/dispatch';
import {visiblePages} from '../editor/starter';
import {htmlProblem, MAX_PAGE_HTML, type StoredMedia} from '../free-page';
import {MAX_PAGES, type Project} from '../model';
import {clip} from '../text';
import {decode, elements, metadata, MAX_TEXT_BYTES} from './document';

export const IMPORT_HTML = 'edit.import-html';
export type GrantedFiles = {names: string[]; read(name: string): Promise<Uint8Array>; media(name: string): Promise<StoredMedia>};
type TextInput = {text: string | Blob | Uint8Array; name?: string};
export type ImportTarget = {
  current(): Project;
  defaultName(number: number): string;
  commit(change: () => void, dispatch: Dispatch, row: typeof IMPORT_HTML): void;
};
export type Issue = {name: string; code: string};
export type ImportResult = {pages: {id: string; name: string}[]; files: {count: number; bytes: number}; remote: number; skipped: Issue[]; documents: Issue[]};
type Document = {file: string; title?: string; html: string; width?: number};

async function textOf(value: TextInput['text']): Promise<string> {
  if (typeof value === 'string') return value;
  if (value instanceof Blob && value.size > MAX_TEXT_BYTES) throw 'too_large';
  return decode(value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : value, true);
}

/** Read first, then apply to the board that is current when the reading ends, in one synchronous commit. */
export async function importHtml(input: TextInput | GrantedFiles, dispatch: Dispatch | undefined, target: ImportTarget): Promise<ImportResult> {
  if (!dispatch || refusal(dispatch, IMPORT_HTML)) throw 'person_only';
  const board = target.current().id;
  const live = () => {
    const project = target.current();
    if (project.id !== board) throw 'board_changed';
    return project;
  };
  const result: ImportResult = {pages: [], files: {count: 0, bytes: 0}, remote: 0, skipped: [], documents: []};
  const names = 'names' in input ? [...input.names].sort() : [input.name ?? (typeof File !== 'undefined' && input.text instanceof File ? input.text.name : '')];
  const docs: Document[] = [];
  for (const file of names) {
    if (live().pages.length + docs.length >= MAX_PAGES) { result.documents.push({name: file, code: 'board_limit'}); continue; }
    try {
      if (file && !/\.html?$/i.test(file)) throw 'not_html';
      const html = await textOf('text' in input ? input.text : await input.read(file));
      if (html.length > MAX_PAGE_HTML) throw 'too_large';
      if (!html.trim()) throw 'empty';
      const nodes = elements(html);
      if (!nodes.length && !/^\s*<!doctype\s+html[\s>]/i.test(html) || !/^\s*</.test(html)) throw 'not_html';
      const {name, width} = metadata(nodes);
      if (htmlProblem(html)) throw 'invalid_html';
      docs.push({file, title: name, width, html});
    } catch (error) {
      result.documents.push({name: file, code: typeof error === 'string' ? error : 'io'});
    }
  }
  let next = live();
  for (const doc of docs) {
    if (next.pages.length >= MAX_PAGES) { result.documents.push({name: doc.file, code: 'board_limit'}); continue; }
    const name = clip(doc.title || doc.file || target.defaultName(visiblePages(next).length + 1), 60);
    const batch = runBatch(next, {ops: [{op: 'html_page', name, html: doc.html, width: doc.width}]}, '');
    if (!batch.ok) { result.documents.push({name: doc.file, code: 'board_limit'}); continue; }
    next = batch.project;
    result.pages.push({id: batch.created[0], name});
  }
  if (result.pages.length) target.commit(() => {
    const project = live();
    project.pages = next.pages;
    project.space = next.space;
  }, dispatch, IMPORT_HTML);
  return result;
}
