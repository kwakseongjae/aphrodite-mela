/**
 * 0.3-P2: a picture or a video on a board is a file kept under the hash of its bytes (src-tauri/src/
 * board.rs on the desktop), and the project names it only as media:<sha256>. What may go on a board is
 * decided by its first bytes and its size, before anything is read in, the same way on both sides.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_MEDIA_BYTES, MAX_BROWSER_MEDIA_BYTES, sniffMedia, mediaRefusal, mediaFrame, mediaMimes, browserFrameHost} from '../src/free-page.ts';
import {validFrameLayout} from '../src/editor/space.ts';
import {parseBatch} from '../src/agent/ops.ts';
import {runBatch} from '../src/agent/apply.ts';
import {initialProject, parseProject, MAX_PAGES, MAX_PAGE_NAME} from '../src/model.ts';

const bytes = (...parts: (number[] | string)[]) => Uint8Array.from(parts.flatMap(p => typeof p === 'string' ? [...p].map(c => c.charCodeAt(0)) : p));

test('the cap is the one the desktop keeps', () => {
  const rust = readFileSync(new URL('../src-tauri/src/board.rs', import.meta.url), 'utf8');
  const m = rust.match(/pub const MAX_MEDIA_BYTES: u64 = ([\d_ *]+);/)!;
  assert.equal(MAX_MEDIA_BYTES, m[1].replace(/_/g, '').split('*').reduce((a, b) => a * Number(b.trim()), 1));
  assert.equal(MAX_MEDIA_BYTES, 500 * 1024 * 1024);
});

test('a board knows a file by its first bytes, as the desktop does', () => {
  assert.equal(sniffMedia(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffMedia(bytes('GIF89a')), 'image/gif');
  assert.equal(sniffMedia(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')), 'image/webp');
  assert.equal(sniffMedia(bytes([0, 0, 0, 0x20], 'ftypisom')), 'video/mp4');
  assert.equal(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3, 1])), 'video/webm');
  assert.equal(sniffMedia(bytes('<svg onload=alert(1)>')), undefined);
  for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']) assert.ok(mediaMimes.includes(mime));
  const rust = readFileSync(new URL('../src-tauri/src/board.rs', import.meta.url), 'utf8');
  for (const mime of mediaMimes) assert.ok(rust.includes(`Some("${mime}")`), `the desktop knows ${mime}`);
});

test('a file too big or of another kind is refused with the reason, before it is read', () => {
  const png = bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(mediaRefusal({name: 'shot.png', size: 1000}, png), undefined);
  assert.match(mediaRefusal({name: 'film.mp4', size: MAX_MEDIA_BYTES + 1}, bytes([0, 0, 0, 0x20], 'ftypisom'))!, /film\.mp4 is 501 MB; a file on a board holds at most 500 MB/);
  assert.match(mediaRefusal({name: 'notes.txt', size: 10}, bytes('hello'))!, /notes\.txt is not a PNG, JPEG, GIF, WebP, MP4 or WebM/);
  assert.match(mediaRefusal({name: 'empty.png', size: 0}, new Uint8Array())!, /empty/);
});

test('a media item sits in a frame of its own shape, at most desktop width', () => {
  const shot = mediaFrame(2880, 1800, {x: 10.4, y: -3});
  assert.deepEqual(shot, {x: 10, y: -3, preset: 'custom', width: 1440, height: 900});
  const tiny = mediaFrame(4, 4, {x: 0, y: 0});
  assert.deepEqual(tiny, {x: 0, y: 0, preset: 'custom', width: 240, height: 240});
  const tall = mediaFrame(300, 90_000, {x: 0, y: 0});
  for (const frame of [shot, tiny, tall]) assert.ok(validFrameLayout(frame), JSON.stringify(frame));
});

/* An agent's picture or video: media_add names a file on this Mac (path) or a picture in the image
   library (library_id). The host puts the file on the board first, then the batch places it; the batch
   alone cannot point an item at a file. */
test('media_add names one file, by an absolute path or a library id', () => {
  const ok = parseBatch({reason: 'The screenshot goes beside the brief.', ops: [{op: 'media_add', path: '/Users/me/Desktop/shot.png', name: 'Shot'}]});
  assert.ok('batch' in ok, JSON.stringify(ok));
  assert.deepEqual(ok.batch.ops[0], {op: 'media_add', path: '/Users/me/Desktop/shot.png', name: 'Shot'});
  const lib = parseBatch({reason: 'r', ops: [{op: 'media_add', library_id: '0123456789abcdef'}]});
  assert.ok('batch' in lib && lib.batch.ops[0].op === 'media_add');
  for (const [why, op] of [['relative', {op: 'media_add', path: 'shot.png'}], ['both', {op: 'media_add', path: '/a.png', library_id: '0123456789abcdef'}], ['neither', {op: 'media_add'}], ['not an id', {op: 'media_add', library_id: '../x'}]] as const) {
    const bad = parseBatch({reason: 'r', ops: [op]});
    assert.ok('error' in bad, why);
  }
});

test('a batch places a media item only with the file the host put on the board, all or nothing', () => {
  const project = parseProject(JSON.stringify(initialProject()));
  const media = {src: 'media:' + 'c'.repeat(64), mime: 'video/mp4', width: 1920, height: 1080, duration: 2};
  const without = runBatch(project, {ops: [{op: 'media_add', path: '/a.mp4'}]}, '');
  assert.ok(!without.ok && /file/.test(without.error), 'no file, no item');
  const failing = runBatch(project, {ops: [{op: 'media_add', path: '/a.mp4'}, {op: 'html_set', page_id: 'nope', html: 'x'}]}, '', {0: media});
  assert.ok(!failing.ok, 'a later op fails');
  assert.equal(project.pages.length, 1, 'the project passed in is untouched');
  const placed = runBatch(project, {ops: [{op: 'media_add', path: '/a.mp4', name: 'Clip'}]}, '', {0: media});
  assert.ok(placed.ok);
  const item = placed.project.pages.find(p => p.id === placed.created[0])!;
  assert.equal(item.kind, 'media');
  assert.equal(item.name, 'Clip');
  assert.deepEqual(item.media, media);
  const frame = placed.project.space!.frames[item.id];
  assert.equal(frame.width, 1440);
  assert.equal(frame.height, 810);
  assert.ok(parseProject(JSON.stringify(placed.project)), 'and it saves');
});

test('a media item has no sections: an add aimed at one is refused, and says why', () => {
  const project = parseProject(JSON.stringify(initialProject()));
  const media = {src: 'media:' + 'd'.repeat(64), mime: 'image/png', width: 800, height: 600};
  const placed = runBatch(project, {ops: [{op: 'media_add', path: '/a.png'}]}, '', {0: media});
  assert.ok(placed.ok);
  const id = placed.created[0];
  const refused = runBatch(placed.project, {ops: [{op: 'add', component_kind: 'cta'}], pageId: id}, '');
  assert.ok(!refused.ok);
  assert.match(refused.error, /media item, which has no sections/);
});

/* 0.3-P2-fix1 #4: a person's drop goes through the same batch as an agent's media_add, so what it makes
   is held to what a saved project may be: a long file name, a full project. */
test('a media item is named within what a page name may be, and a full project takes no more', () => {
  const project = parseProject(JSON.stringify(initialProject()));
  const media = {src: 'media:' + 'e'.repeat(64), mime: 'image/png', width: 800, height: 600};
  const long = runBatch(project, {ops: [{op: 'media_add', name: 'x'.repeat(300) + '.png'}]}, '', {0: media});
  assert.ok(long.ok);
  const item = long.project.pages.find(p => p.id === long.created[0])!;
  assert.equal(item.name.length, MAX_PAGE_NAME);
  assert.ok(parseProject(JSON.stringify(long.project)));
  const ops = Array.from({length: MAX_PAGES}, () => ({op: 'media_add' as const, name: 'shot.png'}));
  const full = runBatch(project, {ops}, '', Object.fromEntries(ops.map((_, i) => [i, media])));
  assert.ok(!full.ok && /30 pages/.test(full.error), 'one page and thirty items is one too many');
  const at = runBatch(project, {ops: [{op: 'media_add', name: 'shot.png'}]}, '', {0: media}, {0: {x: 320, y: -480}});
  assert.ok(at.ok);
  const frame = at.project.space!.frames[at.created[0]];
  assert.deepEqual([frame.x, frame.y], [320, -480], 'placed where it was dropped');
});

/* 0.3-P2-fix1 #6: a patch beside a media_add is checked against what the ops made, not what was there before. */
test('media_add and a patch in one batch land together', () => {
  const project = parseProject(JSON.stringify(initialProject()));
  const media = {src: 'media:' + 'f'.repeat(64), mime: 'image/png', width: 800, height: 600};
  const both = runBatch(project, {ops: [{op: 'media_add', path: '/a.png'}], patch: [{op: 'set', on: 'project', field: 'name', value: 'Changed'}]}, '', {0: media});
  assert.ok(both.ok, both.ok ? '' : both.error);
  assert.equal(both.project.name, 'Changed');
  const forged = runBatch(project, {ops: [{op: 'media_add', path: '/a.png'}], patch: [{op: 'set', on: 'page', page_id: project.pages[0].id, field: 'media', value: media} as never]}, '', {0: media});
  assert.ok(!forged.ok, 'a patch still cannot point a page at a file');
});

/* 0.3-P2-fix1 #8: the browser build reads a whole file into memory to hash it, so it holds less than the
   desktop, which reads a file in pieces. */
test('the browser build holds a smaller file than the desktop, and says so before reading it', () => {
  assert.equal(MAX_BROWSER_MEDIA_BYTES, 100 * 1024 * 1024);
  assert.ok(MAX_BROWSER_MEDIA_BYTES < MAX_MEDIA_BYTES);
  assert.equal(browserFrameHost().maxBytes, MAX_BROWSER_MEDIA_BYTES);
  const mp4 = bytes([0, 0, 0, 0x20], 'ftypisom');
  assert.equal(mediaRefusal({name: 'clip.mp4', size: MAX_BROWSER_MEDIA_BYTES}, mp4, MAX_BROWSER_MEDIA_BYTES), undefined);
  assert.match(mediaRefusal({name: 'clip.mp4', size: MAX_BROWSER_MEDIA_BYTES + 1}, mp4, MAX_BROWSER_MEDIA_BYTES)!, /clip\.mp4 is 101 MB; a file on a board holds at most 100 MB in the browser/);
});
