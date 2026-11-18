/**
 * The change vocabulary underneath everything.
 *
 * A patch is what actually happened to a project, in the plainest terms that can say it: a field
 * took a value, a page or a block came, went or moved. Every edit — a click in the inspector, a drag
 * on the canvas, an agent's batch — is recorded this way, because the ops are not written by the
 * handler that made the edit. They are read off the project before and after it (`diffProject`), so a
 * new button cannot forget to report what it did.
 *
 * Two rules keep the record exact:
 * - `applyPatch(before, diffProject(before, after))` equals `after`, and the reverse diff undoes it.
 *   A property test holds both on random projects.
 * - Only the design is diffed. The ledger itself is not, and neither is the assembly shelf, which
 *   the person keeps beside the canvas and which canvas undo has never touched.
 */
import type {Block, Page, Project} from '../model';
import {shortHash} from './types';

export type PatchOp =
  | {op: 'set'; on: 'project'; field: ProjectField; value?: unknown; unset?: true}
  | {op: 'set'; on: 'system'; field: string; value?: unknown; unset?: true}
  | {op: 'set'; on: 'page'; page_id: string; field: PageField; value?: unknown; unset?: true}
  | {op: 'set'; on: 'block'; page_id: string; block_id: string; field: string; value?: unknown; unset?: true}
  | {op: 'insert_page'; index: number; page: Page}
  | {op: 'remove_page'; page_id: string}
  | {op: 'move_page'; page_id: string; index: number}
  | {op: 'insert_block'; page_id: string; index: number; block: Block}
  | {op: 'remove_block'; page_id: string; block_id: string}
  | {op: 'move_block'; page_id: string; block_id: string; index: number}
  | {op: 'text'; on: 'page'; page_id: string; field: 'html'; hunks: TextHunk[]};

/**
 * One passage of a text diff: at `at` (a place in the text as it was before the change) take out
 * `remove` and put in `insert`. The ledger saves `remove` as its length and a short hash, which is
 * enough to check the passage is still there and to replay the change forward; undo keeps the text.
 */
export type TextHunk = {at: number; remove: string; insert: string} | {at: number; remove_length: number; remove_hash: string; insert: string};

/** Project fields a patch may set. `id`, `version`, `pages` (by its own ops) and the shelf are not among them. */
export const projectFields = ['name', 'brief', 'reference', 'contentLanguage', 'space', 'activePageId', 'approvedFingerprint'] as const;
export type ProjectField = typeof projectFields[number];
export const pageFields = ['name', 'referenceEvidence', 'vibeReceipt', 'proposal', 'kind', 'html', 'media'] as const;
export type PageField = typeof pageFields[number];

/** Where the person is looking, rather than what the design is. Changes made only of these are marked `view`. */
const viewFields: readonly string[] = ['activePageId'];

/** Deep equality that ignores key order: `{...b, x}` and a parsed copy of it are the same design. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => same(x, (b as unknown[])[i]));
  const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every(k => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;

function fieldOps(before: Record<string, unknown>, after: Record<string, unknown>, keys: readonly string[] | undefined, make: (field: string, value: unknown, unset: boolean) => PatchOp, skip: readonly string[] = []): PatchOp[] {
  const names = keys ?? [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => !skip.includes(k));
  const ops: PatchOp[] = [];
  for (const field of names) {
    const was = before[field], now = after[field];
    if (same(was, now)) continue;
    ops.push(make(field, copy(now), now === undefined));
  }
  return ops;
}

/**
 * Brings a list to `after`: the removes, and then one insert or move per position. Applied in that
 * order, every index an op names is an index in the list as it stands at that moment.
 */
function listOps<T extends {id: string}>(before: T[], after: T[], remove: (id: string) => PatchOp, insert: (item: T, index: number) => PatchOp, move: (id: string, index: number) => PatchOp): {removes: PatchOp[]; places: PatchOp[]} {
  const removes: PatchOp[] = [], places: PatchOp[] = [];
  const kept = new Set(after.map(x => x.id));
  const order = before.map(x => x.id).filter(id => {
    if (kept.has(id)) return true;
    removes.push(remove(id));
    return false;
  });
  const existed = new Set(order);
  after.forEach((item, index) => {
    if (order[index] === item.id) return;
    if (existed.has(item.id)) {
      order.splice(order.indexOf(item.id), 1);
      order.splice(index, 0, item.id);
      places.push(move(item.id, index));
    } else {
      order.splice(index, 0, item.id);
      places.push(insert(copy(item), index));
    }
  });
  return {removes, places};
}

/**
 * What turned `before` into `after`, as ops. Empty when nothing in the design changed.
 *
 * Every remove comes before every insert, across pages too: a block dragged from one page to
 * another is taken out before it is put in, so the project never holds two blocks with one id.
 */
export function diffProject(before: Project, after: Project): PatchOp[] {
  const head: PatchOp[] = [], removes: PatchOp[] = [], places: PatchOp[] = [], fields: PatchOp[] = [];
  head.push(...fieldOps(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, projectFields,
    (field, value, unset) => unset ? {op: 'set', on: 'project', field: field as ProjectField, unset: true} : {op: 'set', on: 'project', field: field as ProjectField, value}));
  head.push(...fieldOps(before.system as unknown as Record<string, unknown>, after.system as unknown as Record<string, unknown>, undefined,
    (field, value, unset) => unset ? {op: 'set', on: 'system', field, unset: true} : {op: 'set', on: 'system', field, value}));
  const pages = listOps(before.pages, after.pages,
    page_id => ({op: 'remove_page', page_id}),
    (page, index) => ({op: 'insert_page', index, page}),
    (page_id, index) => ({op: 'move_page', page_id, index}));
  removes.push(...pages.removes);
  places.push(...pages.places);
  const old = new Map(before.pages.map(p => [p.id, p]));
  for (const page of after.pages) {
    const was = old.get(page.id);
    if (!was) continue;
    fields.push(...fieldOps(was as unknown as Record<string, unknown>, page as unknown as Record<string, unknown>, pageFields,
      (field, value, unset) => {
        const hunks = field === 'html' && typeof was.html === 'string' && typeof value === 'string' ? textEdit(was.html, value) : undefined;
        if (hunks) return {op: 'text', on: 'page', page_id: page.id, field: 'html', hunks};
        return unset ? {op: 'set', on: 'page', page_id: page.id, field: field as PageField, unset: true} : {op: 'set', on: 'page', page_id: page.id, field: field as PageField, value};
      }));
    const blocks = listOps(was.blocks, page.blocks,
      block_id => ({op: 'remove_block', page_id: page.id, block_id}),
      (block, index) => ({op: 'insert_block', page_id: page.id, index, block}),
      (block_id, index) => ({op: 'move_block', page_id: page.id, block_id, index}));
    removes.push(...blocks.removes);
    places.push(...blocks.places);
    const prior = new Map(was.blocks.map(b => [b.id, b]));
    for (const block of page.blocks) {
      const p = prior.get(block.id);
      if (!p) continue;
      fields.push(...fieldOps(p as unknown as Record<string, unknown>, block as unknown as Record<string, unknown>, undefined,
        (field, value, unset) => unset ? {op: 'set', on: 'block', page_id: page.id, block_id: block.id, field, unset: true} : {op: 'set', on: 'block', page_id: page.id, block_id: block.id, field, value}, ['id']));
    }
  }
  return [...head, ...removes, ...places, ...fields];
}

export class PatchError extends Error {
  constructor(readonly index: number, message: string) { super(message); }
}

function position(index: number, size: number, where: number): number {
  if (!Number.isInteger(index) || index < 0 || index > size) throw new PatchError(where, `index ${index} is outside 0…${size}`);
  return index;
}

/**
 * Applies ops to a copy and returns it; the project passed in is never touched. Throws a
 * `PatchError` naming the op that does not fit, so a batch either lands whole or not at all.
 */
export function applyPatch(project: Project, ops: readonly PatchOp[]): Project {
  const next = copy(project);
  ops.forEach((op, index) => {
    const page = (id: string) => {
      const found = next.pages.find(p => p.id === id);
      if (!found) throw new PatchError(index, `no page ${id}`);
      return found;
    };
    const assign = (target: Record<string, unknown>, field: string, value: unknown, unset?: true) => {
      if (unset) delete target[field];
      else target[field] = copy(value);
    };
    switch (op.op) {
      case 'set': {
        if (op.on === 'project') {
          if (!(projectFields as readonly string[]).includes(op.field)) throw new PatchError(index, `project field ${op.field} cannot be set`);
          assign(next as unknown as Record<string, unknown>, op.field, op.value, op.unset);
        } else if (op.on === 'system') {
          if (op.field === 'id' && op.unset) throw new PatchError(index, 'a design system keeps its id');
          assign(next.system as unknown as Record<string, unknown>, op.field, op.value, op.unset);
        } else if (op.on === 'page') {
          if (!(pageFields as readonly string[]).includes(op.field)) throw new PatchError(index, `page field ${op.field} cannot be set`);
          assign(page(op.page_id) as unknown as Record<string, unknown>, op.field, op.value, op.unset);
        } else {
          if (op.field === 'id') throw new PatchError(index, 'a block keeps its id');
          const block = page(op.page_id).blocks.find(b => b.id === op.block_id);
          if (!block) throw new PatchError(index, `no block ${op.block_id} on page ${op.page_id}`);
          assign(block as unknown as Record<string, unknown>, op.field, op.value, op.unset);
        }
        return;
      }
      case 'insert_page': {
        if (next.pages.some(p => p.id === op.page.id)) throw new PatchError(index, `page ${op.page.id} already exists`);
        next.pages.splice(position(op.index, next.pages.length, index), 0, copy(op.page));
        return;
      }
      case 'remove_page': {
        const target = page(op.page_id);
        next.pages.splice(next.pages.indexOf(target), 1);
        return;
      }
      case 'move_page': {
        const target = page(op.page_id);
        next.pages.splice(next.pages.indexOf(target), 1);
        next.pages.splice(position(op.index, next.pages.length, index), 0, target);
        return;
      }
      case 'insert_block': {
        const blocks = page(op.page_id).blocks;
        if (next.pages.some(p => p.blocks.some(b => b.id === op.block.id))) throw new PatchError(index, `block ${op.block.id} already exists`);
        blocks.splice(position(op.index, blocks.length, index), 0, copy(op.block));
        return;
      }
      case 'remove_block': {
        const blocks = page(op.page_id).blocks;
        const i = blocks.findIndex(b => b.id === op.block_id);
        if (i < 0) throw new PatchError(index, `no block ${op.block_id} on page ${op.page_id}`);
        blocks.splice(i, 1);
        return;
      }
      case 'move_block': {
        const blocks = page(op.page_id).blocks;
        const i = blocks.findIndex(b => b.id === op.block_id);
        if (i < 0) throw new PatchError(index, `no block ${op.block_id} on page ${op.page_id}`);
        const [moving] = blocks.splice(i, 1);
        blocks.splice(position(op.index, blocks.length, index), 0, moving);
        return;
      }
      case 'text': {
        if (op.on !== 'page' || op.field !== 'html') throw new PatchError(index, 'only a page\'s html takes a text diff');
        const target = page(op.page_id);
        if (typeof target.html !== 'string') throw new PatchError(index, `page ${op.page_id} has no html to change; it is not an html page`);
        try { target.html = applyText(target.html, op.hunks); }
        catch (error) { throw new PatchError(index, `page ${op.page_id}: ${error instanceof Error ? error.message : String(error)}`); }
        return;
      }
      default:
        throw new PatchError(index, `unknown op ${(op as {op?: unknown}).op}`);
    }
  });
  return next;
}

/** True when the ops only move the person's view: which page is open, where frames sit on the space. */
export function isViewOnly(ops: readonly PatchOp[], before: Project, after: Project): boolean {
  if (!ops.length) return false;
  return ops.every(op => {
    if (op.op !== 'set' || op.on !== 'project') return false;
    if (viewFields.includes(op.field)) return true;
    if (op.field !== 'space') return false;
    // Dragging a frame around the space moves x and y; its preset, width and height are the design's.
    const was = before.space?.frames ?? {}, now = after.space?.frames ?? {};
    const ids = new Set([...Object.keys(was), ...Object.keys(now)]);
    return [...ids].every(id => {
      const a = was[id], b = now[id];
      if (!a || !b) return false;
      return a.preset === b.preset && a.width === b.width && a.height === b.height;
    });
  });
}

/** The pages and nodes a patch touches, for anchoring a change to the canvas. */
export function anchorsOf(ops: readonly PatchOp[]): {pages: string[]; nodes: string[]} {
  const pages = new Set<string>(), nodes = new Set<string>();
  for (const op of ops) {
    if (op.op === 'insert_page') { pages.add(op.page.id); op.page.blocks.forEach(b => nodes.add(b.id)); continue; }
    if ('page_id' in op) pages.add(op.page_id);
    if (op.op === 'insert_block') nodes.add(op.block.id);
    else if ('block_id' in op) nodes.add(op.block_id);
  }
  return {pages: [...pages], nodes: [...nodes]};
}

/* ---------- text diffs: a long text recorded as the passages that changed ---------- */

/** Lines, and the tags on a line: each unit ends at a newline or a `>`, so a page written on one line still splits. */
function units(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 62) { out.push(text.slice(from, i + 1)); from = i + 1; }
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/** How far the line diff may go before it gives up and records one passage from the first change to the last. */
const MAX_EDITS = 1_000, MAX_WORK = 4_000_000;

/**
 * The shortest edit from `a` to `b` (Myers), as the runs that differ: [aFrom, aTo, bFrom, bTo].
 * Undefined when finding it would take longer than a recorded change is worth.
 */
function differingRuns(a: number[], b: number[]): [number, number, number, number][] | undefined {
  const n = a.length, m = b.length, limit = Math.min(n + m, MAX_EDITS), off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  let work = 0;
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; work++; }
      v[off + k] = x;
      if (x < n || y < m) continue;
      const removed = new Uint8Array(n), inserted = new Uint8Array(m);
      for (let e = d; e > 0; e--) {
        const w = trace[e], kk = x - y;
        const prevK = kk === -e || (kk !== e && w[off + kk - 1] < w[off + kk + 1]) ? kk + 1 : kk - 1;
        const prevX = w[off + prevK], prevY = prevX - prevK;
        while (x > prevX && y > prevY) { x--; y--; }
        if (prevK === kk + 1) inserted[prevY] = 1; else removed[prevX] = 1;
        x = prevX; y = prevY;
      }
      const runs: [number, number, number, number][] = [];
      for (let i = 0, j = 0; i < n || j < m;) {
        if (i < n && j < m && !removed[i] && !inserted[j]) { i++; j++; continue; }
        const from = [i, j];
        while ((i < n && removed[i]) || (j < m && inserted[j])) { while (i < n && removed[i]) i++; while (j < m && inserted[j]) j++; }
        runs.push([from[0], i, from[1], j]);
      }
      return runs;
    }
    work += d;
    if (work > MAX_WORK) return undefined;
  }
  return undefined;
}

const high = (c: number) => c >= 0xd800 && c <= 0xdbff;
const low = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** One passage, trimmed to the characters that differ, never cutting a character in two. */
function trimmed(at: number, remove: string, insert: string): {at: number; remove: string; insert: string} {
  const most = Math.min(remove.length, insert.length);
  let head = 0;
  while (head < most && remove.charCodeAt(head) === insert.charCodeAt(head)) head++;
  if (head > 0 && high(remove.charCodeAt(head - 1))) head--;
  let tail = 0;
  while (tail < most - head && remove.charCodeAt(remove.length - 1 - tail) === insert.charCodeAt(insert.length - 1 - tail)) tail++;
  if (tail > 0 && low(remove.charCodeAt(remove.length - tail))) tail--;
  return {at: at + head, remove: remove.slice(head, remove.length - tail), insert: insert.slice(head, insert.length - tail)};
}

/**
 * The passages that turn `before` into `after`: found line by line (and tag by tag), then trimmed to
 * the character. In order, apart, each `at` a place in `before`. Empty when the two are the same.
 */
export function textHunks(before: string, after: string): {at: number; remove: string; insert: string}[] {
  if (before === after) return [];
  const ua = units(before), ub = units(after);
  let head = 0;
  while (head < ua.length && head < ub.length && ua[head] === ub[head]) head++;
  let tail = 0;
  while (tail < ua.length - head && tail < ub.length - head && ua[ua.length - 1 - tail] === ub[ub.length - 1 - tail]) tail++;
  const ids = new Map<string, number>();
  const id = (u: string) => { let n = ids.get(u); if (n === undefined) { n = ids.size; ids.set(u, n); } return n; };
  const a = ua.slice(head, ua.length - tail).map(id), b = ub.slice(head, ub.length - tail).map(id);
  const runs = differingRuns(a, b) ?? [[0, a.length, 0, b.length]];
  const startsA = [0], startsB = [0];
  for (const u of ua) startsA.push(startsA[startsA.length - 1] + u.length);
  for (const u of ub) startsB.push(startsB[startsB.length - 1] + u.length);
  const hunks: {at: number; remove: string; insert: string}[] = [];
  for (const [a0, a1, b0, b1] of runs) {
    const from = startsA[head + a0];
    const hunk = trimmed(from, before.slice(from, startsA[head + a1]), after.slice(startsB[head + b0], startsB[head + b1]));
    if (hunk.remove || hunk.insert) hunks.push(hunk);
  }
  return hunks;
}

/**
 * The text diff worth recording for this change, or undefined when the whole value says it better:
 * when the passages carry more than half of it, a reader is better off with the value itself.
 */
export function textEdit(before: string, after: string): {at: number; remove: string; insert: string}[] | undefined {
  const hunks = textHunks(before, after);
  const carried = hunks.reduce((n, h) => n + h.remove.length + h.insert.length, 0);
  return hunks.length && carried * 2 <= Math.max(before.length, after.length) ? hunks : undefined;
}

/**
 * Applies passages to `value`. Every one is checked first — in order, apart, inside the text, and
 * taking out exactly what it says (the text, or its length and hash) — and if any does not fit,
 * nothing is applied and this throws. Each `at` is a place in `value` as it is now.
 */
export function applyText(value: string, hunks: readonly TextHunk[]): string {
  if (!Array.isArray(hunks)) throw new Error('a text change is a list of passages');
  const pieces: string[] = [];
  let from = 0;
  for (const [i, h] of hunks.entries()) {
    const length = 'remove' in h ? h.remove.length : h.remove_length;
    if (!Number.isInteger(h.at) || h.at < from || !Number.isInteger(length) || length < 0 || h.at + length > value.length || typeof h.insert !== 'string') throw new Error(`passage ${i} at ${h.at} is outside the text or out of order`);
    const taken = value.slice(h.at, h.at + length);
    if ('remove' in h ? taken !== h.remove : shortHash(taken) !== h.remove_hash) throw new Error(`the text at ${h.at} is no longer what passage ${i} took out`);
    pieces.push(value.slice(from, h.at), h.insert);
    from = h.at + length;
  }
  pieces.push(value.slice(from));
  return pieces.join('');
}
