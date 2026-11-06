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
  | {op: 'move_block'; page_id: string; block_id: string; index: number};

/** Project fields a patch may set. `id`, `version`, `pages` (by its own ops) and the shelf are not among them. */
export const projectFields = ['name', 'brief', 'reference', 'contentLanguage', 'space', 'activePageId', 'approvedFingerprint'] as const;
export type ProjectField = typeof projectFields[number];
export const pageFields = ['name', 'referenceEvidence', 'vibeReceipt', 'proposal'] as const;
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
      (field, value, unset) => unset ? {op: 'set', on: 'page', page_id: page.id, field: field as PageField, unset: true} : {op: 'set', on: 'page', page_id: page.id, field: field as PageField, value}));
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
    // Dragging a frame around the space moves x and y; its preset and width are the design's.
    const was = before.space?.frames ?? {}, now = after.space?.frames ?? {};
    const ids = new Set([...Object.keys(was), ...Object.keys(now)]);
    return [...ids].every(id => {
      const a = was[id], b = now[id];
      if (!a || !b) return false;
      return a.preset === b.preset && a.width === b.width;
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
