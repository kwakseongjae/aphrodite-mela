import {runBatch} from '../agent/apply';
import {refusal, type Dispatch} from '../agent/dispatch';
import {visiblePages} from '../editor/starter';
import {htmlProblem, MAX_PAGE_HTML, type StoredMedia} from '../free-page';
import {MAX_PAGES, type Project} from '../model';
import {libraryRefusal, type Library, type LibraryLimit} from '../workspace/library';
import {carriedNow} from '../board-file';
import {clip} from '../text';
import {References, ImportFiles, MAX_DOCUMENTS, MAX_DIAGNOSTICS, readCode} from './references';
import {resolvePage} from './page';
import {decode, elements, metadata, MAX_TEXT_BYTES} from './document';

export const IMPORT_HTML = 'edit.import-html';
export type GrantedFiles = {
  names: readonly string[];
  overflow?: number;
  read(name: string, kind: 'document' | 'style' | 'script', limit: number): Promise<Uint8Array>;
  media(name: string, limit: number): Promise<StoredMedia>;
  finish?(kept: string[], staged: StoredMedia[]): Promise<void>;
};
type TextInput = {text: string | Blob | Uint8Array; name?: string};
export type ImportTarget = {
  current(): Project;
  storage(): {library: Library; limit: LibraryLimit};
  defaultName(number: number): string;
  commit(change: () => void, dispatch: Dispatch, row: typeof IMPORT_HTML): void;
};
export type Issue = {name: string; code: string};
export type ImportResult = {pages: {id: string; name: string}[]; files: {count: number; bytes: number; names: string[]}; remote: number; overflow: {skipped: number; documents: number}; skipped: Issue[]; documents: Issue[]};
type Document = {file: string; title?: string; html: string; width?: number; names: Set<string>; files: Map<string, number>};

async function textOf(value: TextInput['text']): Promise<string> {
  if (typeof value === 'string') return value;
  if (value instanceof Blob && value.size > MAX_TEXT_BYTES) throw 'too_large';
  return decode(value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : value, true);
}

async function prepare(file: string, input: TextInput | GrantedFiles, refs: References): Promise<Document> {
  if (file && !/\.html?$/i.test(file)) throw 'not_html';
  const source = await textOf('text' in input ? input.text : await refs.source.read(file, 'document'));
  if (source.length > MAX_PAGE_HTML) throw 'too_large';
  if (!source.trim()) throw 'empty';
  const nodes = elements(source);
  if (!/^\s*</.test(source) || (!nodes.length && !/^\s*<!doctype\s+html[\s>]/i.test(source))) throw 'not_html';
  const {name, width} = metadata(nodes);
  const html = await resolvePage(source, nodes, refs);
  if (htmlProblem(html)) throw 'invalid_html';
  return {file, title: name, width, html, names: refs.names, files: refs.files};
}

function place(project: Project, docs: Document[], target: ImportTarget) {
  const first = visiblePages(project).length + 1;
  const ops = docs.map((doc, i) => ({
    op: 'html_page' as const, html: doc.html, width: doc.width,
    name: clip(doc.title || doc.file || target.defaultName(first + i), 60),
  }));
  if (project.pages.length + docs.length > MAX_PAGES) return {code: 'board_limit'} as const;
  const batch = runBatch(project, {ops}, '');
  if (!batch.ok) return {code: batch.code ?? 'invalid_project'} as const;
  const {library, limit} = target.storage();
  if (libraryRefusal(library, project, batch.project, limit, batch.designChars)) return {code: 'library_limit'} as const;
  return batch;
}

/** Try the ordinary HTML batch once. If its combined design exceeds the save budget, keep each page that fits. */
function fit(project: Project, docs: Document[], target: ImportTarget, refuse: (issue: Issue) => void) {
  const batch = place(project, docs, target);
  if (!('code' in batch)) return {project: batch.project, docs};
  const kept: Document[] = [];
  for (const doc of docs) {
    const single = place(project, [doc], target);
    if (!('code' in single)) { project = single.project; kept.push(doc); }
    else refuse({name: doc.file, code: single.code});
  }
  return {project, docs: kept};
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
  const result: ImportResult = {pages: [], files: {count: 0, bytes: 0, names: []}, remote: 0, overflow: {documents: 0, skipped: 0}, skipped: [], documents: []};
  const names = 'names' in input ? input.names.slice(0, MAX_DOCUMENTS).sort() : [input.name ?? (typeof File !== 'undefined' && input.text instanceof File ? input.text.name : '')];
  const disk = 'read' in input ? input : undefined;
  const files = new ImportFiles(disk);
  result.overflow.documents = disk ? (disk.overflow ?? 0) + disk.names.length - names.length : 0;
  const report = (list: 'skipped' | 'documents', issue: Issue) => {
    if (result[list].length < MAX_DIAGNOSTICS) result[list].push(issue);
    else result.overflow[list]++;
  };
  let supplied: string[] = [];
  try {
    const candidates: Document[] = [];
    let at = 0, available = MAX_PAGES - live().pages.length;
    while (at < names.length && available > 0) {
      const file = names[at++], refs = new References(files, issue => report('skipped', issue));
      try {
        candidates.push(await prepare(file, input, refs));
        available--;
      } catch (e) { report('documents', {name: file, code: readCode(e)}); }
      result.remote += refs.remote;
      const project = live();
      if (!available && at < names.length) {
        available = MAX_PAGES - project.pages.length - fit(project, candidates, target, () => {}).docs.length;
      }
    }
    for (; at < names.length; at++) report('documents', {name: names[at], code: 'board_limit'});
    if (candidates.length) target.commit(() => {
      const project = live();
      const next = fit(project, candidates, target, issue => report('documents', issue));
      if (!next.docs.length) return;
      project.pages = next.project.pages;
      project.space = next.project.space;
      supplied = [...new Set(next.docs.flatMap(doc => [...doc.names].flatMap(name => files.media.get(name)?.sha ?? [])))];
      carriedNow(project, supplied);
      result.pages = project.pages.slice(-next.docs.length).map(({id, name}) => ({id, name}));
      const brought = new Map<string, number>();
      for (const doc of next.docs) for (const [sha, bytes] of doc.files) brought.set(sha, bytes);
      result.files = {names: [...new Set(next.docs.flatMap(d => [...d.names]))].sort(), count: brought.size, bytes: [...brought.values()].reduce((a, b) => a + b, 0)};
    }, dispatch, IMPORT_HTML);
  } finally {
    if (files.media.size) await disk?.finish?.(supplied, [...files.media.values()]);
  }
  return result;
}
