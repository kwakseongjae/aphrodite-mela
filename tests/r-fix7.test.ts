/**
 * 0.3-R fix 7 (Codex's check of fix 6, 2026-11-25).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const main = readFileSync(join(root, 'src/main.ts'), 'utf8');
const board = readFileSync(join(root, 'src-tauri/src/board.rs'), 'utf8');

/* 1: a file placed in board-media is never removed by the app. A refused batch clears its marks and leaves its files: a saved
   board may name the same bytes by their hash. Only copies not yet placed may go (a partial copy, an upload on its way in, the
   incoming copy of bytes already there). */
test('nothing in the app removes a file placed in board-media', () => {
  const rust = board.slice(0, board.indexOf('\nmod tests'));
  let fn = '';
  const removing: string[] = [];
  for (const line of rust.split('\n')) {
    const named = /^\s*(?:pub(?:\(crate\))? )?(?:async )?fn (\w+)/.exec(line);
    if (named) fn = named[1];
    if (/remove_file\(|remove_dir_all\(|remove_dir\(/.test(line)) removing.push(`${fn}: ${line.trim()}`);
  }
  const placed = removing.filter(r => /&path\)|MEDIA|media_file/.test(r) && !/^(append|finish|reap|sweep|publish_in):/.test(r));
  assert.deepEqual(placed, [], 'no removal of a placed board file');
  assert.match(rust, /pub\(crate\) fn release\(base: &Path, shas: &\[String\], session: &str\)/, 'release clears marks only');
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|mts|mjs)$/.test(n) ? [p] : []; });
  for (const path of walk(join(root, 'src'))) {
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(/'(board_media_\w+)'/g)) assert.ok(['board_media_begin', 'board_media_chunk', 'board_media_finish', 'board_media_import', 'board_media_release', 'board_media_path', 'board_media_stat', 'board_media_read'].includes(m[1]), `${path}: ${m[1]}`);
  }
  assert.match(main, /\}finally\{await frameHost\.releaseMedia\(staged\)\.catch\(\(\)=>\{\}\);\}/);
});
