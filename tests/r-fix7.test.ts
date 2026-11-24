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

/* 2: what holds the editor or the close is bounded as a whole: the image library's pictures of a board file share one limit,
   and a window that does not go when asked (closing, or restarting) gives the screen back and is said as refused. */
import {windowCloser, WindowRefused, type CloseAnswer} from '../src/workspace/closing.ts';
test('a window that never goes gives everything back, said as refused; the pictures of a board file share one limit', async () => {
  const never = () => new Promise<void>(() => {});
  const prompt = windowCloser(async destroy => { await destroy(); return true; }, async (): Promise<CloseAnswer> => 'discard', async () => false, 1_000, 30);
  await assert.rejects(prompt.request(never), WindowRefused);
  assert.equal(prompt.busy(), false, 'a close that went nowhere is over');
  const asked = windowCloser(() => new Promise(() => {}), async (): Promise<CloseAnswer> => 'discard', async () => false, 20, 30);
  await assert.rejects(asked.request(never), WindowRefused, 'Close without saving too');
  assert.equal(asked.busy(), false);
  const close = main.slice(main.indexOf('function closeWindow('), main.indexOf('\n', main.indexOf('function closeWindow(')));
  assert.match(close, /await bounded\(destroy\(\),SAVE_LIMIT,\(\)=>new WindowRefused\(/, 'the close\'s own turn waits for the window a bounded time');
  const place = main.slice(main.indexOf('async function placeReadBoard('), main.indexOf('\n}\n', main.indexOf('async function placeReadBoard(')));
  assert.match(place, /const until=Date\.now\(\)\+SAVE_LIMIT;for\(const pic of read\.pictures\)\{if\(Date\.now\(\)>=until\)\{missing\+\+;continue;\}try\{await bounded\(invoke\('image_library_import'.*?\),until-Date\.now\(\)\)/, 'one limit for all its pictures');
  assert.doesNotMatch(readFileSync(join(root, 'tests/r-fix6.test.ts'), 'utf8'), /destroy\\\(\\\)\)/, 'and no wait is let off the check');
});

/* 3: every close the system asks for is held and goes through the one closer, a saved board's too, and one asked while the
   window is already going asks nothing more of it. */
test('every close request is held and goes through the closer', () => {
  // The handler is closing.ts closeRequests now (its behaviour is tested in tests/r-fix8.test.ts).
  const closing = readFileSync(join(root, 'src/workspace/closing.ts'), 'utf8');
  const handler = closing.slice(closing.indexOf('export function closeRequests('));
  assert.ok(handler.indexOf('event.preventDefault();') > 0 && handler.indexOf('event.preventDefault();') < handler.indexOf('if(closing)return;'), 'held first, whatever the board');
  assert.doesNotMatch(main, /onCloseRequested\(async event=>\{[^]*?if\(lastSaved[^)]*\)return;/, 'a saved board is not let through to close on its own');
});

/* 4: a board file whose write to the disk is refused says so as a notice, even over a request to edit. */
test('a board file\'s refused disk write is one the person must not miss', () => {
  const place = main.slice(main.indexOf('async function placeReadBoard('), main.indexOf('\n}\n', main.indexOf('async function placeReadBoard(')));
  assert.match(place, /\/\* the not-saved warning says so \*\/\}throw error instanceof Unmissable\?error:new Unmissable\(error instanceof Error\?error\.message:String\(error\)\);\}/);
});
