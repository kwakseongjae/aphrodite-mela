/**
 * Running an agent's batch against a project, without the app.
 *
 * This used to live inside `main.ts`, which meant the only way to know what a batch does was to run
 * the desktop app. Now it is a function of the project, the person's selection and the batch, and
 * returns a new project: the one passed in is never touched, so a failed batch has nothing to put back.
 * `main.ts` calls it inside `commit()`, which records the result in the ledger as one change.
 */
import {currentPage, makeBlock, parseProject, safeImage, uid, MAX_PROJECT, MAX_PAGES, MAX_PAGE_NAME, type BlockKind, type Page, type Project} from '../model';
import {supportsProvider} from '../providers';
import {canParent} from '../layout';
import {patternVariants} from '../patterns';
import {sampleSrc} from '../design/sample-images';
import {localRef} from '../design/local-images';
import {ensureSpace, framePresets, nextFramePosition} from '../editor/space';
import {applyPatch, PatchError, type PatchOp} from '../ledger/patch';
import {designOf, LEDGER_RESERVE} from '../ledger/ledger';
import {unknownValue} from './errors';
import {SELECTION, type Op} from './ops';
import {htmlProblem, isFreePage, mediaFrame, noSections, MAX_PAGE_HTML, type PageMedia, type FrameHost} from '../free-page';
import {commandById, type Surface} from './commands.mjs';

/**
 * `created` is every page the batch made, in order, so the agent can address what it just made.
 * `designChars` is how long the resulting design serializes to, for measuring what saving takes.
 */
export type BatchResult = {ok: true; project: Project; selected: string; created: string[]; designChars: number} | {ok: false; index: number; error: string; part: 'ops' | 'patch'};
type Focus = {selected: string; created: string[]};

/** A free page's html, written by an op: held to what a page may store, or an error sentence. */
function setHtml(target: Page, html: string): string | undefined {
  const problem = htmlProblem(html);
  if (problem) return problem;
  target.html = html;
  return undefined;
}

/**
 * The ops that write html. A page is made whole, replaced whole, or changed one exact passage at a
 * time; a passage that is not on the page, or is there more than once without `all`, changes nothing.
 * Making a page does not move the person to it: they are looking where they were looking.
 */
function runHtmlOp(project: Project, op: Extract<Op, {op: 'html_page' | 'html_set' | 'html_replace'}>, focus: Focus): string | undefined {
  if (op.op === 'html_page') {
    if (project.pages.length >= 30) return 'this project already has 30 pages, which is the limit.';
    const created: Page = {id: uid(), name: op.name, blocks: [], kind: 'html', html: ''};
    const refused = setHtml(created, op.html);
    if (refused) return refused;
    ensureSpace(project);
    project.pages.push(created);
    const frame = nextFramePosition(project.space!, op.width === undefined ? 'desktop' : 'custom', op.width);
    project.space!.frames[created.id] = op.height === undefined ? frame : {...frame, height: op.height};
    focus.created.push(created.id);
    return undefined;
  }
  const target = project.pages.find(p => p.id === op.page_id);
  if (!target) return `no page ${op.page_id}. Take an html page id from aphrodite_get_contract, or from the reply that made it.`;
  if (!isFreePage(target)) return `page ${op.page_id} is a section page, not an html page. Its sections change with add, update, move and delete; html_set and html_replace change an html page.`;
  if (op.op === 'html_set') return setHtml(target, op.html);
  // Counted, and the new length known, before anything is built: a short passage replaced everywhere by a
  // long one would otherwise make the whole result first and only then find it too big.
  const {html} = target, {find, replace} = op, places: number[] = [];
  let length = html.length;
  for (let at = html.indexOf(find); at >= 0; at = html.indexOf(find, at + find.length)) {
    places.push(at);
    length += replace.length - find.length;
    if (!op.all && places.length > 1) return `the passage to find is on page ${op.page_id} more than once. Send a longer passage that is there once, or "all": true to change every one.`;
    if (length > MAX_PAGE_HTML) return `changing every place the passage is would make page ${op.page_id} more than ${MAX_PAGE_HTML.toLocaleString('en')} characters, which a page holds at most. Change fewer places, or split the page.`;
  }
  if (!places.length) return `the passage to find is not on page ${op.page_id}. Read the page again with aphrodite_get_page_html (it may have changed) and send the exact text.`;
  let next = '', from = 0;
  for (const at of places) { next += html.slice(from, at) + replace; from = at + find.length; }
  return setHtml(target, next + html.slice(from));
}

/**
 * A picture or a video placed on the board, beside the others, in a frame of its own shape. `media` is
 * the file the host has already put on the board for this op; without it there is nothing to place.
 */
function runMediaAdd(project: Project, op: Extract<Op, {op: 'media_add'}>, media: PageMedia | undefined, at: {x: number; y: number} | undefined, focus: Focus): string | undefined {
  if (!media) return 'the file was not put on the board, so there is nothing to place. Send media_add through aphrodite_apply_edits, which copies the file first.';
  if (project.pages.length >= MAX_PAGES) return `this project already has ${MAX_PAGES} pages and media items, which is the limit.`;
  ensureSpace(project);
  const name = op.name ?? (op.path ? op.path.split('/').pop() || 'Media' : 'Picture');
  const created: Page = {id: uid(), name: name.slice(0, MAX_PAGE_NAME), blocks: [], kind: 'media', media};
  project.pages.push(created);
  project.space!.frames[created.id] = mediaFrame(media.width, media.height, at ?? nextFramePosition(project.space!, 'desktop'));
  focus.created.push(created.id);
  return undefined;
}

/** One operation against a page of `project`, which it changes in place. Returns an error sentence, or nothing. */
function runOp(project: Project, page: Page, op: Exclude<Op, {op: 'media_add'}>, focus: Focus): string | undefined {
  if (op.op === 'html_page' || op.op === 'html_set' || op.op === 'html_replace') return runHtmlOp(project, op, focus);
  const sectionless = ['add', 'update', 'move', 'delete'].includes(op.op) ? noSections(page) : undefined;
  if (sectionless) return sectionless;
  const blocks = page.blocks;
  const find = (id: string) => blocks.find(b => b.id === (id === SELECTION ? focus.selected : id));
  if (op.op === 'add') {
    if (blocks.length >= 100) return 'this page already has 100 components, which is the limit.';
    const kind = op.component_kind as BlockKind;
    const block = makeBlock(kind);
    if (op.variant) block.variant = op.variant;
    if (supportsProvider(project.system.id, kind)) block.provider = project.system.id;
    const before = op.before_block_id ? blocks.find(b => b.id === op.before_block_id) : undefined;
    if (op.before_block_id && !before) return `no component ${op.before_block_id} on this page; before_block_id must name one of its components.`;
    block.parentId = before ? (before.kind === 'frame' ? before.id : before.parentId) : undefined;
    if (!canParent([...blocks, block], block.id, block.parentId)) return 'that frame cannot nest any deeper.';
    for (const [field, text] of Object.entries(op.content ?? {})) (block as unknown as Record<string, string>)[field] = text;
    const at = before && before.kind !== 'frame' ? blocks.indexOf(before) : -1;
    blocks.splice(at < 0 ? blocks.length : at, 0, block);
    focus.selected = block.id;
    return undefined;
  }
  if (op.op === 'update') {
    const block = find(op.block_id);
    if (!block) return op.block_id === SELECTION ? 'nothing is selected. Pass a block_id from the contract, or ask the person to select something.' : `no component ${op.block_id} on this page.`;
    if (op.fields.description !== undefined && block.kind !== 'products') return 'description belongs to a collection component; this one is a ' + block.kind + '.';
    if (op.image !== undefined) {
      if (!['hero', 'products'].includes(block.kind)) return `a picture belongs to a hero or a collection; this one is a ${block.kind}.`;
      if (op.image === '') block.image = '';
      else {
        // `sample:desk-lamp` names one the app ships with; anything else must be a library id.
        const src = op.image.startsWith('sample:') ? sampleSrc(op.image.slice('sample:'.length)) : localRef(op.image);
        if (!safeImage(src)) return unknownValue('image', op.image, ['sample:<id> from aphrodite_list_images', 'a library id from aphrodite_list_images', '"" to clear it']);
        block.image = src;
      }
    }
    if (op.variant !== undefined) {
      const variants = patternVariants(block.kind);
      if (!variants.includes(op.variant)) return unknownValue('variant', op.variant, variants, `This is a ${block.kind}.`);
      block.variant = op.variant;
    }
    for (const [field, text] of Object.entries(op.fields)) (block as unknown as Record<string, string>)[field] = text;
    return undefined;
  }
  if (op.op === 'move') {
    const block = find(op.block_id);
    if (!block) return `no component ${op.block_id} on this page.`;
    const from = blocks.indexOf(block), to = from + (op.direction === 'up' ? -1 : 1);
    if (to < 0 || to >= blocks.length) return `that component is already ${op.direction === 'up' ? 'first' : 'last'}.`;
    [blocks[from], blocks[to]] = [blocks[to], blocks[from]];
    return undefined;
  }
  if (op.op === 'delete') {
    const block = find(op.block_id);
    if (!block) return `no component ${op.block_id} on this page.`;
    blocks.forEach(child => { if (child.parentId === block.id) child.parentId = block.parentId; });
    blocks.splice(blocks.indexOf(block), 1);
    if (focus.selected === block.id) focus.selected = '';
    return undefined;
  }
  if (op.op === 'page') {
    // With a page_id it renames one; without, it makes one. Either way the design system carries
    // over untouched, because a page is a frame on the same space, not a new project.
    if (op.page_id !== undefined) {
      const target = project.pages.find(p => p.id === op.page_id);
      if (!target) return `no page ${op.page_id}. Take an id from the contract.`;
      target.name = op.name;
      if (op.preset !== undefined) { ensureSpace(project); const f = project.space!.frames[target.id]; if (f) f.preset = op.preset; }
      return undefined;
    }
    if (project.pages.length >= 30) return 'this project already has 30 pages, which is the limit.';
    ensureSpace(project);
    const created: Page = {id: uid(), name: op.name, blocks: []};
    project.pages.push(created);
    focus.created.push(created.id);
    project.space!.frames[created.id] = nextFramePosition(project.space!, op.preset ?? 'desktop', framePresets.find(p => p.id === (op.preset ?? 'desktop'))?.width ?? 1200);
    project.activePageId = created.id;
    return undefined;
  }
  ensureSpace(project);
  const frame = project.space!.frames[op.page_id ?? page.id];
  if (!frame) return `no page ${op.page_id} to resize.`;
  frame.preset = op.preset;
  return undefined;
}

/**
 * A batch: the ops in order, then the patch. All of it lands or none of it does. The ledger is left
 * on the project passed in; the caller carries it over.
 */
export function runBatch(project: Project, batch: {ops: Op[]; patch?: PatchOp[]; pageId?: string}, selected: string, media: Record<number, PageMedia> = {}, places: Record<number, {x: number; y: number}> = {}): BatchResult {
  // Whatever goes wrong inside, the answer is a sentence and the project passed in is untouched.
  try { return attempt(project, batch, selected, media, places); }
  catch (error) { return {ok: false, index: -1, part: batch.patch?.length && !batch.ops.length ? 'patch' : 'ops', error: `the batch could not be applied: ${error instanceof Error ? error.message : String(error)}`}; }
}

function attempt(project: Project, batch: {ops: Op[]; patch?: PatchOp[]; pageId?: string}, selected: string, media: Record<number, PageMedia>, places: Record<number, {x: number; y: number}>): BatchResult {
  let next = JSON.parse(JSON.stringify(designOf(project))) as Project, json: string | undefined;
  const focus: Focus = {selected, created: []};
  if (batch.ops.length) {
    let target = batch.pageId ? next.pages.find(p => p.id === batch.pageId) : currentPage(next);
    if (!target) return {ok: false, index: -1, part: 'ops', error: `no page "${batch.pageId}". This project has: ${next.pages.map(p => p.id).join(', ')}`};
    for (const [index, op] of batch.ops.entries()) {
      const error = op.op === 'media_add' ? runMediaAdd(next, op, media[index], places[index], focus) : runOp(next, target, op, focus);
      if (error) return {ok: false, index, part: 'ops', error};
      /* Making a page moves the batch onto it, the way a person making a frame lands inside it.
         Without this, "make a mobile page and put a hero on it" quietly puts the hero back on the
         page they started from. */
      if (op.op === 'page' && op.page_id === undefined) target = currentPage(next);
    }
    // What the ops made is held to what a saved project must be, as the patch is below: thirty pages of
    // 2MB would not fit in one, and a project that cannot be saved cannot be undone into either.
    json = JSON.stringify(next);
    try { parseProject(json); }
    catch (error) { return {ok: false, index: -1, part: 'ops', error: `the ops would leave the project invalid: ${error instanceof Error ? error.message : String(error)}`}; }
  }
  if (batch.patch?.length) {
    // What the patch changed is read against what the ops made: a media item media_add placed is theirs, not the patch's.
    const was = new Map(next.pages.map(p => [p.id, p]));
    try { next = applyPatch(next, batch.patch); }
    catch (error) {
      if (error instanceof PatchError) return {ok: false, index: error.index, part: 'patch', error: error.message};
      throw error;
    }
    // A patch can say anything the model can hold, so the result is held to what a saved project must be.
    try { next = parseProject(JSON.stringify(next)); }
    catch (error) { return {ok: false, index: -1, part: 'patch', error: `the patch would leave the project invalid: ${error instanceof Error ? error.message : String(error)}`}; }
    for (const page of next.pages) {
      const problem = typeof page.html === 'string' && page.html !== was.get(page.id)?.html ? htmlProblem(page.html) : undefined;
      if (problem) return {ok: false, index: -1, part: 'patch', error: `page ${page.id}: ${problem}`};
      // A media item points at a file on the board, so it is made where the file is put there (media_add, 0.3-P2).
      if (page.media !== undefined && JSON.stringify(page.media) !== JSON.stringify(was.get(page.id)?.media)) return {ok: false, index: -1, part: 'patch', error: `page ${page.id}: a media item arrives with media_add, which puts its file on the board first; a patch cannot point one at a file that may not be there.`};
    }
    if (!next.pages.some(p => p.blocks.some(b => b.id === focus.selected))) focus.selected = '';
  }
  // What is saved is the design and its history, and the history never takes more than LEDGER_RESERVE
  // (src/ledger/types.ts). So the design alone is held to the rest: a batch that lands is a project that
  // saves and opens, whoever records it and with whatever reason.
  const designChars = (batch.patch?.length || !json ? JSON.stringify(next) : json).length;
  if (designChars > MAX_PROJECT - LEDGER_RESERVE) return {ok: false, index: -1, part: batch.ops.length ? 'ops' : 'patch', error: `with this change the design would be ${designChars.toLocaleString('en')} characters; a project holds ${(MAX_PROJECT - LEDGER_RESERVE).toLocaleString('en')} of design beside its history. Make the page smaller, or split the work across pages or another project.`};
  return {ok: true, project: next, selected: focus.selected, created: focus.created, designChars};
}

/**
 * A batch with files waits while they are copied (importMedia), and a page picked meanwhile must not take
 * it: it is held to the page it arrived on. One without files runs at once and needs no hold.
 */
export function heldBatch<B extends {ops: Op[]; pageId?: string}>(batch: B, project: Project): B {
  return batch.ops.some(o => o.op === 'media_add') && !batch.pageId ? {...batch, pageId: currentPage(project).id} : batch;
}

/**
 * An agent's media_add files, put on the board before the batch runs (src-tauri/src/board.rs checks each
 * before it is copied). A path on this Mac is read only for an agent running here (the apply row's
 * `reads`), and that is decided before the host is asked to read anything. `measure` reads a kept file's
 * size, which needs the page (src/main.ts mediaSize).
 */
export async function importMedia(ops: Op[], surface: Surface, host: Pick<FrameHost, 'importFile' | 'mediaUrl'>, projectId: string, measure: (url: string, mime: string) => Promise<{width: number; height: number; duration?: number}>): Promise<{media: Record<number, PageMedia>} | {error: string; status?: number; failed_at?: number}> {
  const reads = commandById['edit.apply'].reads!;
  if (!reads.surfaces.includes(surface) && ops.some(o => o.op === 'media_add' && o.path !== undefined)) return {error: `media_add reads a file by its path only for an agent running on this Mac (${reads.surfaces.join(', ')}); from here, name a picture in the image library with library_id.`, status: 403};
  const media: Record<number, PageMedia> = {};
  for (const [i, op] of ops.entries()) {
    if (op.op !== 'media_add') continue;
    try {
      const stored = await host.importFile({path: op.path, libraryId: op.library_id, project: projectId}), url = await host.mediaUrl(stored.sha);
      if (!url) throw new Error('the file was not kept');
      const size = await measure(url, stored.mime);
      media[i] = {src: `media:${stored.sha}`, mime: stored.mime, width: size.width, height: size.height, ...(size.duration !== undefined ? {duration: size.duration} : {})};
    } catch (error) { return {error: `ops[${i}]: ${error instanceof Error ? error.message : String(error)}`, failed_at: i}; }
  }
  return {media};
}
