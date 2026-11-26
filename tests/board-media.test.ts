/**
 * 0.3-P2: a picture or a video on a board is a file kept under the hash of its bytes (src-tauri/src/
 * board.rs on the desktop), and the project names it only as media:<sha256>. What may go on a board is
 * decided by its first bytes and its size, before anything is read in, the same way on both sides.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_MEDIA_BYTES, MAX_BROWSER_MEDIA_BYTES, sniffMedia, mediaRefusal, mediaFrame, mediaMimes, browserFrameHost, desktopFrameHost, type FrameHost} from '../src/free-page.ts';
import {newBoard,visiblePages} from '../src/editor/starter';
import {personAt} from '../src/agent/dispatch';
import {isBoardFileName} from '../src/board-file';
import {editorBoard,editorCalls,noop} from './support/editor-calls';
import {screenToWorld,validFrameLayout} from '../src/editor/space.ts';
import {parseBatch} from '../src/agent/ops.ts';
import {runBatch, importMedia, heldBatch, preflightBatch} from '../src/agent/apply.ts';
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
  // A media item the patch makes whole, kind and file together: a shape the model accepts, so only the media_add rule refuses it.
  const item = {id: 'forged-item', name: 'Forged', blocks: [], kind: 'media' as const, media: {...media, src: 'media:' + '9'.repeat(64)}};
  assert.ok(parseProject(JSON.stringify({...project, pages: [...project.pages, item]})), 'the shape itself is one a project may hold');
  const forged = runBatch(project, {ops: [{op: 'media_add', path: '/a.png'}], patch: [{op: 'insert_page', index: 1, page: item}]}, '', {0: media});
  assert.ok(!forged.ok && /arrives with media_add/.test(forged.error), forged.ok ? 'it landed' : forged.error);
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

/* 0.3-P2-fix2: "before reading it", counted. A file too big for the host is refused by put() without one
   byte of it being read or sent. */
test('a host refuses a file past what it holds without reading or sending any of it', async () => {
  const touched: string[] = [];
  const fake = (size: number) => ({size, type: 'video/mp4', slice: () => { touched.push('slice'); return fake(0); }, arrayBuffer: async () => { touched.push('arrayBuffer'); return new ArrayBuffer(0); }, stream: () => { touched.push('stream'); }, text: async () => { touched.push('text'); return ''; }}) as unknown as Blob;
  await assert.rejects(browserFrameHost().put(fake(MAX_BROWSER_MEDIA_BYTES + 1)), /at most 100 MB/);
  const calls: string[] = [];
  const desktop = desktopFrameHost({invoke: async (command: string) => { calls.push(command); return '' as never; }, fileSrc: p => p});
  await assert.rejects(desktop.put(fake(MAX_MEDIA_BYTES + 1)), /at most 500 MB/);
  assert.deepEqual(touched, [], 'nothing of the file was read');
  assert.deepEqual(calls, [], 'nothing was sent to the desktop');
});

/* 0.3-P2-fix2: a path on this Mac is read only for an agent running here (the apply row's `reads`). The
   refusal comes before the host is asked to read anything. */
test('media_add by path from a surface that may not read files is refused before any file is read', async () => {
  const asked: string[] = [];
  const host = {importFile: async (ask: {path?: string; libraryId?: string}) => { asked.push(ask.path ?? ask.libraryId!); return {sha: 'a'.repeat(64), mime: 'image/png', bytes: 1}; }, mediaUrl: async () => 'blob:x'} as unknown as FrameHost;
  const measure = async () => ({width: 10, height: 10});
  const refused = await importMedia([{op: 'media_add', path: '/Users/me/shot.png'}], 'inApp', host, 'p', measure);
  assert.ok('error' in refused && refused.status === 403 && /library_id/.test(refused.error));
  assert.deepEqual(asked, [], 'no file was read');
  const library = await importMedia([{op: 'media_add', library_id: '0123456789abcdef'}], 'inApp', host, 'p', measure);
  assert.ok('media' in library, 'a library picture is fine from the app');
  const local = await importMedia([{op: 'media_add', path: '/Users/me/shot.png'}], 'mcp', host, 'p', measure);
  assert.ok('media' in local && local.media[0].src === 'media:' + 'a'.repeat(64));
  assert.deepEqual(asked, ['0123456789abcdef', '/Users/me/shot.png']);
});

/* 0.3-P2-fix4 #3: a batch with files waits while they are copied, and a page picked meanwhile must not take
   it. It is held to the page it arrived on; one without files runs at once (src/main.ts applyBatch). */
test('a batch with files is held to the page it arrived on, and lands there after another page is picked', () => {
  const project = initialProject();
  const first = project.pages[0]!.id;
  project.pages.push({id: 'second', name: 'Second', blocks: []});
  const withFiles = parseBatch({reason: 'r', ops: [{op: 'add', component_kind: 'cta'}, {op: 'media_add', library_id: '0123456789abcdef'}]});
  const plain = parseBatch({reason: 'r', ops: [{op: 'add', component_kind: 'cta'}]});
  const named = parseBatch({reason: 'r', page_id: 'second', ops: [{op: 'media_add', library_id: '0123456789abcdef'}]});
  if ('error' in withFiles || 'error' in plain || 'error' in named) throw new Error('parse');
  const held = heldBatch(withFiles.batch, project);
  assert.equal(held.pageId, first, 'held to the page open when it arrived');
  assert.equal(heldBatch(plain.batch, project), plain.batch, 'a batch without files is left as it is: it does not wait');
  assert.equal(heldBatch(named.batch, project).pageId, 'second', 'a page the batch names stays its page');
  project.activePageId = 'second';
  const media = {1: {src: 'media:' + 'a'.repeat(64), mime: 'image/png', width: 10, height: 10}};
  const result = runBatch(project, held, '', media);
  assert.ok(result.ok, JSON.stringify(result));
  const page = (id: string) => result.project.pages.find(p => p.id === id)!;
  assert.equal(page(first).blocks.filter(b => b.kind === 'cta').length, initialProject().pages[0]!.blocks.filter(b => b.kind === 'cta').length + 1, 'the component landed on the page it arrived on');
  assert.equal(page('second').blocks.length, 0);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  // 0.3-R: a batch with files is run ahead (preflightBatch) and the door asked before the copy; neither waits.
  assert.match(main, /const held:Batch=heldBatch\(batch,project\);\n(?:.*\n){0,8}?\s*const imported=withFiles\?await importMedia\(/, 'applyBatch holds the batch before its one wait, and waits only for files');
  const ahead = main.slice(main.indexOf('const held:Batch=heldBatch(batch,project);'), main.indexOf('const imported=withFiles?await importMedia('));
  assert.doesNotMatch(ahead, /await /, 'nothing before the copy waits');
  assert.match(main, /const result=runBatch\(project,held,selected,media\);/);
});

test('the sidebar sends people to the board where a dropped picture is placed',async()=>{
  const project=newBoard('Board'),events=new Map<string,Function>();
  const space={getBoundingClientRect:()=>({left:10,top:20}),addEventListener:(type:string,fn:Function)=>events.set(type,fn)};
  const sha='3'.repeat(64);
  const screen={...editorBoard(project),spaceAbort:undefined,AbortController,document:{getElementById:(id:string)=>id==='canvas-scroll'?space:null},
    cameraProjectId:project.id,spaceHeld:false,applyCamera:noop,camera:{x:0,y:0,zoom:1},visiblePages,screenToWorld,who:personAt,isBoardFileName,
    frameHost:{maxBytes:MAX_MEDIA_BYTES,put:async()=>({sha,mime:'image/png'}),mediaUrl:async()=> 'blob:picture'},mediaSize:async()=>({width:50,height:50}),
    mediaRefusal,MAX_PAGES,preflightBatch,selected:'',libraryRefusal:noop,library:{},diskQueue:null,BROWSER_LIBRARY_ESTIMATE:5_000_000,
    mediaFrame,runBatch,carriedNow:noop};
  editorCalls(['function commit(','function mountSpace(','function spaceEl(','function spaceLocal(','async function putMedia('],screen);
  const host=screen as typeof screen & {mountSpace:Function;putMedia:(...args:unknown[])=>Promise<void>};
  let placed:Promise<void>|undefined;
  const put=host.putMedia;host.putMedia=(...args)=>placed=put(...args);
  host.mountSpace();
  const png=new File([Uint8Array.of(137,80,78,71,13,10,26,10)],'Photo.png',{type:'image/png'});
  events.get('drop')!({isTrusted:true,preventDefault:noop,clientX:70,clientY:90,dataTransfer:{files:[png]}});
  await placed;
  const [page]=visiblePages(screen.project);
  assert.equal(page.name,'Photo.png');
  const frame=screen.project.space!.frames[page.id];
  assert.deepEqual([frame.x,frame.y],[60,70]);assert.equal(screen.project.ledger?.changes.at(-1)?.source,'media:drop');
  const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  const caption=main.match(/<span class="library-drop">(.+?)<\/span>/)![1];
  assert.ok(caption.includes('Drop pictures or videos onto the board.'));
  assert.ok(caption.includes('그림이나 영상을 보드에 끌어다 놓으세요.'));
});

test('a page can carry fonts and sounds through the board store without making them standalone media items', async () => {
  const {sniffBoardFile, mediaExtension} = await import('../src/free-page');
  for (const [head, mime, ext] of [['wOF2', 'font/woff2', 'woff2'], ['OggS', 'audio/ogg', 'ogg'], ['RIFF0000WAVE', 'audio/wav', 'wav']]) {
    assert.equal(sniffBoardFile(bytes(head)), mime);
    assert.equal(mediaExtension(mime), ext);
    assert.equal(sniffMedia(bytes(head)), undefined);
  }
  assert.equal(sniffBoardFile(bytes([0, 1, 0, 0], 'ftypisom')), 'video/mp4', 'an existing board file keeps its type');
  const sha = 'a'.repeat(64);
  const data = bytes('wOF2-demo');
  const font = desktopFrameHost({fileSrc: p => 'asset://localhost' + p, invoke: async (command: string) => (
    command === 'board_media_path' ? '/board-media/' + sha + '.woff2' : command === 'board_media_stat' ? {mime: 'font/woff2', bytes: data.length} : data.buffer
  ) as never});
  const url = 'data:font/woff2;base64,' + Buffer.from(data).toString('base64');
  assert.equal(await font.frameCost(sha), url.length);
  assert.equal(await font.frameMedia(sha), url);
});

test('the browser upload refusal names pictures, videos, fonts and sounds', async () => {
  await assert.rejects(browserFrameHost().put(new Blob(['unknown'])), {
    message: 'the file is not a PNG, JPEG, GIF or WebP picture, MP4 or WebM video, WOFF, WOFF2, TTF or OTF font, or MP3, WAV or Ogg sound.',
  });
});

test('TypeScript and Rust agree on the extension for every board file kind', async () => {
  const {boardFileExtensions} = await import('../src/free-page');
  const rust = readFileSync(new URL('../src-tauri/src/board.rs', import.meta.url), 'utf8');
  const table = rust.match(/const BOARD_FILES:[^=]+=(.*?)\];/s)![1];
  const rows = [...table.matchAll(/\("([^"]+)", "([^"]+)"\)/g)];
  // MP3 alone needs an internal binary fallback for the desktop responder.
  const expected = {...boardFileExtensions, 'audio/mpeg': boardFileExtensions['audio/mpeg'] + '.bin'};
  assert.equal(rows.length, Object.keys(expected).length);
  assert.deepEqual(Object.fromEntries(rows.map(([, ext, mime]) => [mime, ext])), expected);
});
