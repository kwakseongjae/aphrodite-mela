/**
 * The shapes the ledger is saved in, what is left out of them, and the reader for them. Kept apart
 * from the ledger logic so the project model can read a saved ledger without importing what records one.
 */
import type {PatchOp} from './patch';
import {passageHash} from './sha256';

/** `unknown` is a change caught after the fact (an edit made outside `commit()`): nobody can say whose it was. */
export type Author = {kind: 'person' | 'agent' | 'unknown'; name: string};
export const UNKNOWN: Author = {kind: 'unknown', name: 'unknown'};
export type Change = {
  /** Its own, never reused: what 0.5's folders and branches name a change by. */
  id: string;
  /**
   * The change this one was made on top of: the one before it in this ledger, unless it came from another
   * copy. Once compact() has dropped the oldest headers, the first change left names a parent that is no
   * longer in the ledger. That is expected: history is cut at the front, and a missing parent means "made
   * on something older than what is kept", never a broken link (0.5 reads branches from this).
   */
  parent?: string;
  seq: number;
  at: string;
  author: Author;
  /** Where it came from: `editor:change`, `pointer:move`, `agent:apply`, `undo`, … */
  source: string;
  reason?: string;
  ops: PatchOp[];
  anchors: {pages: string[]; nodes: string[]};
  baseRevision: string;
  revision: string;
  /** Only where the person was looking moved — the page they opened, a frame dragged on the space. */
  view: boolean;
  undoes?: number;
  redoes?: number;
  /** The ops were dropped to keep the ledger within budget; what, who and why remain. */
  compacted?: true;
  /** Size of this entry as saved, in characters of JSON. */
  size: number;
};
export type Ledger = {seq: number; changes: Change[]};
export const MAX_REASON = 500;
/** Saved ledger budget per project. Local storage in a browser holds about five million characters for everything. */
export const LEDGER_BUDGET = 1_200_000;
/**
 * The most a saved ledger adds to a saved project: its budget, which compact() holds the serialized
 * ledger to, and the `,"ledger":` that carries it. The newest header alone always fits the budget
 * (record() anchors a change to at most MAX_ANCHORS components), so no recording can exceed this:
 * what a project may hold of design is MAX_PROJECT less this, known before a change is made.
 */
export const LEDGER_RESERVE = LEDGER_BUDGET + ',"ledger":'.length;
const MAX_INLINE_DATA = 2_000;

/**
 * Replaces uploaded pictures, however small, and other long `data:` strings with a marker that keeps
 * their size. Used for what is saved and shown, never for undo.
 */
export function slim<T>(value: T): T {
  if (typeof value === 'string') return (/^data:image\//i.test(value) || (value.startsWith('data:') && value.length > MAX_INLINE_DATA) ? {$omitted: 'data-url', bytes: value.length} : value) as T;
  if (Array.isArray(value)) return value.map(slim) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, slim(v)])) as T;
  return value;
}

/**
 * The length of an entry as saved, its own `size` included: the field holds a number whose digits are
 * part of what it counts, so the count settles on itself.
 */
export function sizeOf(change: Change): number {
  let size = 0;
  for (let n = -1; n !== size;) { n = size; size = JSON.stringify({...change, size: n}).length; }
  return size;
}

/**
 * Eight hex digits made from a text (FNV-1a over its UTF-16 code units), to name something: the id an
 * old ledger's change is given when it is read. Identity only, not a check — two texts can share one.
 * A saved text diff checks its passage with passageHash (sha256.ts).
 */
export function shortHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The ops as they are saved: a text diff keeps what it put in, and for what it took out only the
 * length and a 128-bit SHA-256 hash — enough to check the passage before replaying it, at a fraction of the
 * size. Undo keeps the ops as they were. Anything not shaped like a text diff passes through.
 */
export function forSaving(ops: PatchOp[]): PatchOp[] {
  return ops.map(op => {
    if (!op || op.op !== 'text' || !Array.isArray(op.hunks)) return op;
    return {...op, hunks: op.hunks.map(h => h && typeof (h as {remove?: unknown}).remove === 'string' ? {at: h.at, remove_length: (h as {remove: string}).remove.length, remove_hash: passageHash((h as {remove: string}).remove), insert: h.insert} : h)};
  });
}

/**
 * Drops the ops of the oldest entries, then the oldest headers, until the ledger serializes to at most
 * `budget` characters — brackets, commas and the sequence number counted. The newest header is kept;
 * it fits any budget the ledger is given in practice (see LEDGER_RESERVE).
 */
export function compact(ledger: Ledger, budget = LEDGER_BUDGET): void {
  // {"seq":N,"changes":[…]} — the entries, a comma between each two, and the frame around them.
  let total = ledger.changes.reduce((sum, c) => sum + c.size, 0) + Math.max(0, ledger.changes.length - 1) + 21 + String(ledger.seq).length;
  const drop = (change: Change) => {
    total -= change.size;
    change.ops = [];
    change.compacted = true;
    change.size = sizeOf(change);
    total += change.size;
  };
  // One change bigger than a quarter of the budget (a whole page of html, say) gives up its own ops
  // first; otherwise it would take every older change's with it and still not fit.
  for (const change of ledger.changes) if (total > budget && !change.compacted && change.size > budget / 4) drop(change);
  for (const change of ledger.changes) {
    if (total <= budget) break;
    if (!change.compacted) drop(change);
  }
  // Headers alone can outgrow the budget after very long histories; the oldest go first.
  while (total > budget && ledger.changes.length > 1) total -= ledger.changes.shift()!.size + 1;
}

const isStr = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

/**
 * Reads a saved ledger. A ledger that does not hold together is dropped rather than refused: losing
 * the history of a project is bad, being unable to open the project is worse.
 */
export function readLedger(raw: unknown): Ledger | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const l = raw as Ledger;
  if (!Number.isInteger(l.seq) || l.seq < 0 || !Array.isArray(l.changes) || l.changes.length > 20_000) return undefined;
  let last = 0;
  for (const c of l.changes) {
    if (!c || typeof c !== 'object' || !Number.isInteger(c.seq) || c.seq <= last || c.seq > l.seq) return undefined;
    last = c.seq;
    if ((c.id !== undefined && !isStr(c.id, 100)) || (c.parent !== undefined && !isStr(c.parent, 100)) || !isStr(c.at, 40) || !isStr(c.source, 80) || !isStr(c.baseRevision, 100) || !isStr(c.revision, 100)) return undefined;
    if (!c.author || !['person', 'agent', 'unknown'].includes(c.author.kind) || !isStr(c.author.name, 100)) return undefined;
    if (c.reason !== undefined && !isStr(c.reason, MAX_REASON)) return undefined;
    if (!Array.isArray(c.ops) || typeof c.view !== 'boolean' || !Number.isInteger(c.size)) return undefined;
    if (!c.anchors || !Array.isArray(c.anchors.pages) || !Array.isArray(c.anchors.nodes)) return undefined;
  }
  // A ledger from a file is held to what is saved: pictures left out, sizes counted rather than trusted, the budget kept.
  // A ledger saved before changes had ids gets them here, made from what each change already says so every read agrees.
  let previous: string | undefined;
  const read: Ledger = {seq: l.seq, changes: l.changes.map(c => {
    const id = c.id ?? `legacy-${c.seq}-${shortHash(`${c.at}|${c.baseRevision}|${c.revision}`)}`;
    const parent = c.parent ?? previous;
    previous = id;
    const kept = {...c, id, ...(parent ? {parent} : {}), ops: slim(forSaving(c.ops)), size: 0};
    kept.size = sizeOf(kept);
    return kept;
  })};
  compact(read);
  return read;
}
