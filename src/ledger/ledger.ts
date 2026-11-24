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
import {agentRevision, MAX_PROJECT, type Project} from '../model';
import {anchorsOf, diffProject, isViewOnly, type PatchOp} from './patch';
import {capAnchors, compact, forSaving, MAX_REASON, sizeOf, slim, type Author, type Change, type Ledger} from './types';
import {clip, wholeText} from '../text';
export {readLedger, compact, slim, forSaving, capAnchors, MAX_ANCHORS, LEDGER_BUDGET, LEDGER_RESERVE, MAX_REASON, UNKNOWN, type Author, type Change, type Ledger} from './types';

/** `cleared`: the change cleared the approval as the system does (src/ledger/session.ts), and wrote none of its own. */
export type UndoEntry = {seq: number; ops: PatchOp[]; inverse: PatchOp[]; cleared?: true};

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

function anchored(ops: PatchOp[]): Change['anchors'] {
  return capAnchors(anchorsOf(ops));
}

export type ChangeMeta = {author: Author; source: string; reason?: string; undoes?: number; redoes?: number; at?: string; id?: string};

/**
 * Records the step from `before` to `after` in the ledger and returns the undo entry for it, or null
 * when the design did not change. `ops`, when given, must be `diffProject(before, after)`.
 */
export function record(ledger: Ledger, before: Project, after: Project, meta: ChangeMeta, ops = diffProject(before, after)): {change: Change; undo: UndoEntry} | null {
  if (!ops.length) return null;
  const seq = ledger.seq + 1;
  // Cut on whole characters and mended: what is recorded is saved, and the save takes no half of a pair (src/text.ts).
  const reason = meta.reason === undefined ? undefined : clip(wholeText(meta.reason.trim()), MAX_REASON);
  const change: Change = {
    id: meta.id ?? crypto.randomUUID(),
    ...(ledger.changes.length ? {parent: ledger.changes[ledger.changes.length - 1].id} : {}),
    seq,
    at: meta.at ?? new Date().toISOString(),
    author: {kind: meta.author.kind, name: clip(wholeText(meta.author.name), 100)},
    source: clip(wholeText(meta.source), 80),
    ...(reason ? {reason} : {}),
    ops: slim(forSaving(ops)),
    anchors: anchored(ops),
    baseRevision: agentRevision(before),
    revision: agentRevision(after),
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
 * point is the last change that produced it, or the first kept change that started from it. A revision
 * neither names is not one this ledger keeps (older than what is kept, or another board's): `known` is
 * false and no changes are given, so the reader reads the board again rather than take a history from
 * its start as what changed since. View-only changes are left out unless asked for. Revisions written
 * before 0.3-R (the design's fingerprint, src/model.ts) are found as they were written. `current` is the revision the
 * board is at now, known with nothing after it.
 */
export function changesSince(ledger: Ledger | undefined, since: number | string | undefined, options: {includeView?: boolean; limit?: number; moved?: boolean; current?: string} = {}): {changes: Change[]; more: boolean; from: number; known: boolean} {
  const all = ledger?.changes ?? [];
  let from = 0;
  // The revision the board is at now is known, with nothing after it, history or none (0.3-R fix 1 #7).
  if (typeof since === 'string' && since === options.current) return {changes: [], more: false, from: all.length ? all[all.length - 1].seq : ledger?.seq ?? 0, known: true};
  if (typeof since === 'number') from = since;
  else if (typeof since === 'string') {
    const hit = [...all].reverse().find(c => c.revision === since) ?? all.find(c => c.baseRevision === since);
    if (!hit) return {changes: [], more: false, from: all.length ? all[all.length - 1].seq : 0, known: false};
    from = hit.revision === since ? hit.seq : hit.seq - 1;
  }
  // `moved`: a view change that moved the revision (a frame dragged) is listed too, as a 409 needs to say what moved it.
  const after = all.filter(c => c.seq > from && (options.includeView || !c.view || (options.moved && c.revision !== c.baseRevision)));
  const limit = options.limit ?? 50;
  return {changes: after.slice(0, limit), more: after.length > limit, from, known: true};
}

/**
 * Keeps what is saved — the design and its history together — within what a project holds
 * (MAX_PROJECT), in place: the history gives way, oldest ops first and then oldest headers, and the
 * design never does. The save calls this (src/workspace/library.ts upsertProject) when the project it
 * has just serialized is over the cap, so a project far from it costs nothing, and what stays in memory
 * is what was saved. A design within MAX_PROJECT − LEDGER_RESERVE never gets here. A design past
 * MAX_PROJECT on its own is not rescued: saving it fails and the person sees the not-saved warning.
 */
export function fitSaved(project: Project): void {
  const ledger = project.ledger;
  if (!ledger) return;
  // The saved project is the design with `,"ledger":` and the ledger added, wherever the key falls.
  compact(ledger, MAX_PROJECT - JSON.stringify(designOf(project)).length - ',"ledger":'.length);
}

export function emptyLedger(): Ledger {
  return {seq: 0, changes: []};
}
