/**
 * The ledger: every change to a project, in order, with who made it and why.
 *
 * It is append-only. An undo does not erase the change it takes back; it appends a change of its own
 * that names the one it undid. So "the first state plus every change in order" is always the state on
 * screen, and an agent asking what happened since it last looked never meets a gap.
 *
 * Two copies of each change exist, for two jobs:
 * - The ledger entry is saved with the project. Uploaded pictures inside it are replaced by their
 *   size, and the oldest entries lose their ops once the ledger outgrows its budget, so a long session
 *   cannot push the project past what local storage holds.
 * - The undo entry stays in memory with the ops exactly as they were, pictures included, so undo is
 *   exact for the last `UNDO_LIMIT` changes.
 */
import {fingerprint, MAX_PROJECT, type Project} from '../model';
import {anchorsOf, diffProject, isViewOnly, type PatchOp} from './patch';
import {compact, forSaving, MAX_REASON, sizeOf, slim, type Author, type Change, type Ledger} from './types';
export {readLedger, compact, slim, forSaving, LEDGER_BUDGET, LEDGER_RESERVE, MAX_REASON, UNKNOWN, type Author, type Change, type Ledger} from './types';

export type UndoEntry = {seq: number; ops: PatchOp[]; inverse: PatchOp[]};

export const UNDO_LIMIT = 200;

/** A design state without what is not design: the ledger itself. */
export function designOf(project: Project): Project {
  const {ledger: _ledger, ...design} = project as Project & {ledger?: Ledger};
  return design as Project;
}

/** True when an op carries a marker `slim` left in place of a picture, which cannot be replayed. */
export function hasOmitted(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if ((value as {$omitted?: unknown}).$omitted !== undefined) return true;
  return Object.values(value).some(hasOmitted);
}

/**
 * How many components and pages one change is anchored to at most. Anchors point the canvas at what a
 * change touched; past this many it touched the whole page anyway, and the cap is what keeps one header
 * small enough that the saved ledger never outgrows its reserve (LEDGER_RESERVE).
 */
export const MAX_ANCHORS = {nodes: 500, pages: 60};
function anchored(ops: PatchOp[]): {pages: string[]; nodes: string[]} {
  const all = anchorsOf(ops);
  return {pages: all.pages.slice(0, MAX_ANCHORS.pages), nodes: all.nodes.slice(0, MAX_ANCHORS.nodes)};
}

export type ChangeMeta = {author: Author; source: string; reason?: string; undoes?: number; redoes?: number; at?: string; id?: string};

/**
 * Records the step from `before` to `after` in the ledger and returns the undo entry for it, or null
 * when the design did not change. `ops`, when given, must be `diffProject(before, after)`.
 */
export function record(ledger: Ledger, before: Project, after: Project, meta: ChangeMeta, ops = diffProject(before, after)): {change: Change; undo: UndoEntry} | null {
  if (!ops.length) return null;
  const seq = ledger.seq + 1;
  const reason = meta.reason?.trim().slice(0, MAX_REASON);
  const change: Change = {
    id: meta.id ?? crypto.randomUUID(),
    ...(ledger.changes.length ? {parent: ledger.changes[ledger.changes.length - 1].id} : {}),
    seq,
    at: meta.at ?? new Date().toISOString(),
    author: {kind: meta.author.kind, name: meta.author.name.slice(0, 100)},
    source: meta.source.slice(0, 80),
    ...(reason ? {reason} : {}),
    ops: slim(forSaving(ops)),
    anchors: anchored(ops),
    baseRevision: fingerprint(before),
    revision: fingerprint(after),
    view: isViewOnly(ops, before, after),
    ...(meta.undoes !== undefined ? {undoes: meta.undoes} : {}),
    ...(meta.redoes !== undefined ? {redoes: meta.redoes} : {}),
    size: 0,
  };
  change.size = sizeOf(change);
  ledger.seq = seq;
  ledger.changes.push(change);
  compact(ledger);
  return {change, undo: {seq, ops, inverse: diffProject(after, before)}};
}

/**
 * The changes after a point, oldest first. `since` is a sequence number, or a revision — then the
 * point is the last change that produced it. View-only changes are left out unless asked for.
 */
export function changesSince(ledger: Ledger | undefined, since: number | string | undefined, options: {includeView?: boolean; limit?: number} = {}): {changes: Change[]; more: boolean; from: number} {
  const all = ledger?.changes ?? [];
  let from = 0;
  if (typeof since === 'number') from = since;
  else if (typeof since === 'string') {
    const hit = [...all].reverse().find(c => c.revision === since);
    from = hit ? hit.seq : all.length ? all[0].seq - 1 : 0;
  }
  const after = all.filter(c => c.seq > from && (options.includeView || !c.view));
  const limit = options.limit ?? 50;
  return {changes: after.slice(0, limit), more: after.length > limit, from};
}

/** What the saved project carries besides the design and the ledger's own entries: its key, brackets and commas. */
const SAVED_SLACK = 1_000;

/**
 * Keeps what is saved — the design and its history together — within what a project holds
 * (MAX_PROJECT). When the two would not fit, the history gives way, oldest ops first and then oldest
 * headers; the design never does. Every recording in session.ts ends here. A design within
 * MAX_PROJECT − LEDGER_RESERVE always saves and opens after a person's edit, undo or redo; one past it
 * (a big picture uploaded, say — this was so before html pages) is not rescued here: saving it fails and
 * the person sees the not-saved warning, as they did before.
 */
export function fitSaved(project: Project): void {
  const ledger = project.ledger;
  if (!ledger) return;
  const room = MAX_PROJECT - JSON.stringify(designOf(project)).length - SAVED_SLACK;
  if (JSON.stringify(ledger).length > room) compact(ledger, Math.max(0, room - ledger.changes.length));
}

export function emptyLedger(): Ledger {
  return {seq: 0, changes: []};
}
