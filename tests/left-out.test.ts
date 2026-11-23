/**
 * 0.3-R ④: a file a board did not carry when it was received does not go out with it again.
 *
 * P3's third review (M-1): a received board can name a file of this Mac's by its hash, in a comment if it likes, and
 * the hash can be learned without the file (a page sent with its video left out, a handoff's project JSON). The board
 * then showed it where this Mac had it, and carried it out again when the board was sent on. What shows stays as it is;
 * what goes out does not: the reader writes down what the board came without (a file's own word on it is not taken),
 * every export leaves those files out and says how many, and a file put on the board directly comes off the list.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync, strToU8} from 'fflate';
import * as boardFile from '../src/board-file.ts';
import {readBoardFile, writeBoardFile} from '../src/board-file.ts';
import {initialProject, parseProject, fingerprint, approvalPrint, agentRevision, type Project} from '../src/model.ts';
import {diffProject} from '../src/ledger/patch.ts';
import {importedProject} from '../src/workspace/library.ts';
import {exportPage} from '../src/page-export.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const MINE = sha(PNG);
const host = () => { const kept = new Map<string, Uint8Array>([[MINE, PNG]]); return {maxBytes: 500 * 1024 * 1024, put: async (blob: Blob) => { const b = new Uint8Array(await blob.arrayBuffer()); kept.set(sha(b), b); return {sha: sha(b), mime: blob.type, bytes: b.length}; }, stat: async (s: string) => kept.has(s) ? {mime: 'image/png', bytes: kept.get(s)!.length} : undefined, read: async (s: string) => kept.get(s)}; };
const b = boardFile as unknown as Record<string, unknown>;
const fn = <T>(name: string): T => { assert.equal(typeof b[name], 'function', `board-file.ts exports ${name}`); return b[name] as T; };
type Outgoing = <H extends {stat: (s: string) => Promise<unknown>; read: (s: string) => Promise<unknown>}>(p: Project, host: H, local?: (id: string) => Promise<{bytes: Uint8Array; mime: string} | undefined>) => {host: H; local?: (id: string) => Promise<{bytes: Uint8Array; mime: string} | undefined>; withheld: Set<string>};

/** The board someone sends back: one page that names this Mac's picture in a comment, and does not carry it. */
function received(extra: Record<string, unknown> = {}): Uint8Array {
  const p = initialProject();
  p.pages.push({id: 'note', name: 'Note', blocks: [], kind: 'html', html: `<p>please fix the typo</p><!-- media:${MINE} -->`} as never);
  const board = {...JSON.parse(JSON.stringify(p)), aphroditeBoardFile: 1, ...extra};
  const html = board.pages[1].html; delete board.pages[1].html;
  return zipSync({'board.json': strToU8(JSON.stringify(board)), 'pages/0002.html': strToU8(html)});
}

test('the reader writes down what a board came without, and takes no word of the file\'s own on it', async () => {
  const got = await readBoardFile(received({leftOut: []}), host());
  assert.deepEqual((got.project as Project & {leftOut?: string[]}).leftOut, [MINE]);
  const said = await readBoardFile(received({leftOut: ['f'.repeat(64)]}), host());
  assert.deepEqual((said.project as Project & {leftOut?: string[]}).leftOut, [MINE], 'what the file says is replaced by what the reader found');
  const p = initialProject();
  const whole = {...JSON.parse(JSON.stringify(p)), aphroditeBoardFile: 1, leftOut: ['not a file']};
  const none = await readBoardFile(zipSync({'board.json': strToU8(JSON.stringify(whole))}), host());
  assert.equal((none.project as Project & {leftOut?: string[]}).leftOut, undefined, 'a board that came with everything it names came without nothing, whatever it says');
});

test('sent on as a board file, it leaves out what it came without, even where this Mac has it, and says how many', async () => {
  const outgoing = fn<Outgoing>('outgoing');
  const got = await readBoardFile(received(), host());
  const out = outgoing(got.project, host());
  const written = await writeBoardFile(got.project, out.host);
  const again = await readBoardFile(written.bytes, host());
  assert.equal(again.files, 0, 'the picture did not go out');
  assert.deepEqual([...out.withheld], [MINE]);
});

test('a page exported from it keeps the address, not the picture', async () => {
  const outgoing = fn<Outgoing>('outgoing');
  const got = await readBoardFile(received(), host());
  const p = got.project;
  p.pages[1].html = `<p>shown</p><img src="media:${MINE}">`;
  const out = outgoing(p, host());
  const page = await exportPage(p.pages[1].html!, {scripts: true, videos: 'beside'}, out.host);
  assert.ok(!page.html.includes('data:image/png'), 'no picture inlined');
  assert.ok(out.withheld.has(MINE));
});

test('a project file opened from disk counts every file it names as not carried', () => {
  const p = initialProject();
  p.pages.push({id: 'pic', name: 'Pic', blocks: [], kind: 'media', media: {src: `media:${MINE}`, mime: 'image/png', width: 2, height: 2}} as never);
  p.pages[0].blocks[1].image = 'local:0123456789abcdef';
  const read = importedProject(JSON.stringify({...p, leftOut: []}), {version: 1, entries: []}) as Project & {leftOut?: string[]};
  assert.deepEqual([...(read.leftOut ?? [])].sort(), [MINE, 'local:0123456789abcdef'].sort());
});

test('the list is no part of the design: not in the fingerprint, the approval, the revision or the ledger, and a read keeps it', () => {
  const p = initialProject();
  const q = {...JSON.parse(JSON.stringify(p)), leftOut: [MINE]} as Project;
  assert.equal(fingerprint(q), fingerprint(p));
  assert.equal(approvalPrint(q), approvalPrint(p));
  assert.equal(agentRevision(q), agentRevision(p));
  assert.deepEqual(diffProject(p, q), []);
  assert.deepEqual((parseProject(JSON.stringify(q)) as Project & {leftOut?: string[]}).leftOut, [MINE]);
  // 0.3-R fix 2 #13: a list that cannot be trusted holds back every file, rather than refusing the board.
  assert.deepEqual((parseProject(JSON.stringify({...q, leftOut: ['not a file']})) as Project & {leftOut?: string[]}).leftOut, ['*']);
});

test('a file put on the board directly comes off the list', () => {
  const drop = fn<(p: Project, files: string[]) => void>('carriedNow');
  const p = {...initialProject(), leftOut: [MINE, 'local:0123456789abcdef']} as Project & {leftOut?: string[]};
  drop(p, [MINE]);
  assert.deepEqual(p.leftOut, ['local:0123456789abcdef']);
  drop(p, ['local:0123456789abcdef']);
  assert.equal(p.leftOut, undefined, 'an empty list is no list');
});

test('every way a board goes out holds back what it came without, and every way a file is put on it takes it off the list', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.equal((main.match(/exportBundle\(board,/g) ?? []).length, (main.match(/exportBundle\(board,go\.local,go\.host\)/g) ?? []).length, 'every handoff of a board');
  assert.match(main, /writeBoardFile\(board,\{\.\.\.go\.host,local:go\.local\}\)/, 'the board file');
  assert.match(main, /exportPage\(pageSource\(page\),choice,go\.host\),name,go\.host\)/, 'the page, and the videos beside it');
  assert.match(main, /exportPage\(pageSource\(page\), exportChoice, outgoing\(project, frameHost\)\.host/, 'and the page the export window shows');
  assert.equal((main.match(/carriedNow\(project,Object\.values\(media\)/g) ?? []).length, 2, 'a drop or paste, and media_add');
  assert.equal((main.match(/carriedNow\(project,\[`local:/g) ?? []).length, 2, 'a picture the person or an agent adds to the library');
});
