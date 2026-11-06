/**
 * The shapes the ledger is saved in, and the reader for them. Kept apart from the ledger logic so the
 * project model can read a saved ledger without importing what records one.
 */
import type {PatchOp} from './patch';

export type Author = {kind: 'person' | 'agent'; name: string};
export type Change = {
  id: string;
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
    if (!isStr(c.id, 100) || !isStr(c.at, 40) || !isStr(c.source, 80) || !isStr(c.baseRevision, 100) || !isStr(c.revision, 100)) return undefined;
    if (!c.author || !['person', 'agent'].includes(c.author.kind) || !isStr(c.author.name, 100)) return undefined;
    if (c.reason !== undefined && !isStr(c.reason, MAX_REASON)) return undefined;
    if (!Array.isArray(c.ops) || typeof c.view !== 'boolean' || !Number.isInteger(c.size)) return undefined;
    if (!c.anchors || !Array.isArray(c.anchors.pages) || !Array.isArray(c.anchors.nodes)) return undefined;
  }
  return l;
}
