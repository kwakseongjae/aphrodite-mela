/**
 * 0.3-R fix 6 (Codex's check of fix 5, 2026-11-25).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const board = readFileSync(new URL('../src-tauri/src/board.rs', import.meta.url), 'utf8');

/** Every place in the Rust source that removes a file or a folder, by the function it is in. */
function removals(source: string): {fn: string; line: string}[] {
  let fn = '';
  const found: {fn: string; line: string}[] = [];
  for (const line of source.split('\n')) {
    if (/^mod tests\b/.test(line)) break;
    const named = /^\s*(?:pub(?:\(crate\))? )?(?:async )?fn (\w+)/.exec(line);
    if (named) fn = named[1];
    if (/remove_file\(|remove_dir_all\(|remove_dir\(/.test(line)) found.push({fn, line: line.trim()});
  }
  return found;
}

/* 1: a board's file is removed in one place only: a batch of this process's own, refused, letting go of what it was the first
   to bring and nothing has taken since. Nothing reads a saved library, or another process's state, to decide a file may go;
   what a process that ended left stays. */
test('a board file is removed only when this process\'s own batch is refused', () => {
  const sites = removals(board);
  assert.deepEqual([...new Set(sites.map(s => s.fn))].sort(), ['append', 'copy_hashed', 'finish', 'publish_in', 'reap', 'release', 'settle', 'sweep'],
    'uploads on their way in, the frames\' copies, and one release');
  const media = sites.filter(s => /MEDIA|&path\)|media_file/.test(s.line) && !['append', 'finish', 'reap', 'sweep', 'publish_in'].includes(s.fn));
  assert.deepEqual(media.map(s => s.fn), ['release'], 'a board file goes only in release');
  assert.doesNotMatch(board, /fn reap_marks|fn saved_libraries|fn hold_session|workspace-v1/, 'nothing judges by the saved library or a session that ended');
  for (const name of readdirSync(new URL('../src-tauri/src/', import.meta.url))) {
    if (name === 'board.rs' || !name.endsWith('.rs')) continue;
    assert.doesNotMatch(readFileSync(new URL(`../src-tauri/src/${name}`, import.meta.url), 'utf8'), /board-media/, `${name} touches no board file`);
  }
  assert.match(readFileSync(new URL('../docs/AGENT-CHANNEL.md', import.meta.url), 'utf8'), /비정상 종료되면 대기 표시와 그 파일이 남을 수 있다/, 'and the guide to the channel says so');
  assert.match(main, /\}finally\{await frameHost\.releaseMedia\(staged,answer\?\.ok===true\)\.catch\(\(\)=>\{\}\);\}/, 'a batch lets go of its marks as it ends, keeping its files when it landed');
});

/* 2: no wait holds the editor without a time limit. Every turn in the line of leavings, and whatever it runs, waits only
   through a bound (within, bounded) or for its own steps; the board file's files are placed before its turn. A table of
   these is in the branch's notes. */
function balanced(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) { if (source[i] === '(') depth++; else if (source[i] === ')') { depth--; if (depth === 0) return source.slice(open + 1, i); } }
  return '';
}
function fnBody(name: string): string {
  const at = main.search(new RegExp(`(?:async )?function ${name}\\(`));
  return at < 0 ? '' : main.slice(at, main.indexOf('\n}\n', at));
}
test('nothing that holds the editor waits without a time limit', () => {
  const held: {where: string; body: string}[] = [];
  for (const m of main.matchAll(/\b(leave|turn)\(/g)) {
    if (/function (?:leave|turn)<T>\($/.test(main.slice(Math.max(0, m.index! - 30), m.index! + m[0].length))) continue;
    const body = balanced(main, m.index! + m[1].length);
    held.push({where: `${m[1]} at ${main.slice(0, m.index!).split('\n').length}`, body});
    for (const call of body.matchAll(/^\s*(?:async\s*)?\(\)=>(\w+)\(/g)) held.push({where: call[1], body: fnBody(call[1])});
  }
  assert.ok(held.length >= 10, `found ${held.length}`);
  const allowed = /^await (?:within\(|bounded\(|go\(\)|destroy\(\)|new Promise\(r=>setTimeout\(r,\d)/;
  const unbounded = held.flatMap(h => [...h.body.matchAll(/await [^;]{0,40}/g)].filter(w => !allowed.test(w[0])).map(w => `${h.where}: ${w[0]}`));
  assert.deepEqual(unbounded, []);
  const open = fnBody('openBoardFileNow');
  assert.ok(open.indexOf('await read.place()') > 0 && open.indexOf('await read.place()') < open.indexOf('leave('), 'a board file\'s files are placed before its turn');
});

/* 2: a window that refuses to go is not a save that failed: it is said as it is, nobody is asked about the save, and within
   one request the window is asked to go once. */
import {windowCloser, WindowRefused, type CloseAnswer} from '../src/workspace/closing.ts';
test('a refused going is said as it is, once, and not asked about as a save', async () => {
  assert.equal(typeof WindowRefused, 'function', 'closing.ts exports WindowRefused');
  let tries = 0, asked = 0;
  const refuse = async () => { tries++; throw new Error('the system would not close it'); };
  const prompt = windowCloser(async destroy => { await destroy(); return true; }, async (): Promise<CloseAnswer> => { asked++; return 'discard'; }, async () => false, 50);
  await assert.rejects(prompt.request(refuse), (error: unknown) => error instanceof WindowRefused && /would not close/.test((error as Error).message));
  assert.deepEqual([tries, asked], [1, 0], 'asked to go once; nobody asked about a save');
  assert.equal(prompt.busy(), false, 'and the next close is free to go');
  tries = 0; asked = 0;
  const late = windowCloser(() => new Promise(() => {}), async (): Promise<CloseAnswer> => { asked++; return 'discard'; }, async () => false, 20);
  await assert.rejects(late.request(refuse), WindowRefused);
  assert.deepEqual([tries, asked], [1, 1], 'a save still under way is asked about, and Close without saving asks the window to go once');
});
