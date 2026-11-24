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
