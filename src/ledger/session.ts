/**
 * The editor's side of the ledger: one call before an edit, one after, and undo and redo.
 *
 * `main.ts` wraps every edit in `commit()`, and `commit()` calls `begin` and `end` from here. Keeping
 * the logic in this file means the rules — what counts as a change, what undo does, how deep it goes —
 * run under test without a browser.
 *
 * Something that changes the project outside `commit()` is caught too: `begin` and `step` compare the
 * project with the state last seen, and record the difference as an `untracked` change before the new
 * one, by an `unknown` author — not whoever happens to edit next. The ledger stays complete even when a
 * code path forgets to commit, and the source name says which kind of path to go and fix.
 */
import {dropStaleApproval, isApproved, parseProject, type Project} from '../model';
import {mendHalfPairs} from '../text';
import {HUMAN_ONLY_ERROR} from '../agent/authority';
import {applyPatch, diffProject, type PatchOp} from './patch';
import {designOf, emptyLedger, record, MAX_REASON, UNDO_LIMIT, UNKNOWN, type Author, type Change, type UndoEntry} from './ledger';

/**
 * The note a change carries when the approval went with it (0.3-R): its content no longer matched the fingerprint, or
 * someone other than the person would have brought an approval the board did not have. Approving is the person's alone.
 */
export const APPROVAL_CLEARED = 'Approval cleared: only the person brings an approval back.';

/**
 * Holds a board's approval to the rule where a change is recorded, on the board itself (not a copy): a fingerprint the
 * content no longer matches goes, and so does one anyone but the person would bring (one other than the board had in
 * `before`, compared as fingerprints, so a step that left a standing approval as it was keeps it). True when it cleared.
 */
function settleApproval(project: Project, before: Project, author: Author, step = false): boolean {
  if (dropStaleApproval(project)) return true;
  // A board that came in already without it (a batch's result, read as a saved board is) lost it the same way. A step's
  // ops are the change it takes back or puts back, so one that takes an approval away is that change's, not a clearing.
  if (project.approvedFingerprint === undefined) return !step && before.approvedFingerprint !== undefined;
  if (author.kind === 'person') return false;
  if (isApproved(before) && before.approvedFingerprint === project.approvedFingerprint) return false;
  delete project.approvedFingerprint;
  return true;
}
/** The reason a change that cleared the approval records: the one it was given, then the note, which is never the part cut. */
function noted(reason: string | undefined): string {
  const given = reason?.trim().slice(0, MAX_REASON - APPROVAL_CLEARED.length - 3).trim();
  return given ? `${given} · ${APPROVAL_CLEARED}` : APPROVAL_CLEARED;
}
/** Mends half pairs (src/text.ts) in the board itself, the design and not its ledger, which records what was mended. */
function mendDesign(project: Project): void {
  const ledger = project.ledger;
  delete project.ledger;
  try { mendHalfPairs(project); } finally { if (ledger) project.ledger = ledger; }
}
const writesApproval = (ops: PatchOp[]) => ops.some(op => op.op === 'set' && op.on === 'project' && op.field === 'approvedFingerprint');

export type History = {undo: UndoEntry[]; redo: UndoEntry[]; last?: Project};

/** Given the project as it opens, takes it as the baseline: what changes outside `commit()` from then on is recorded. */
export function newHistory(project?: Project): History {
  return project ? {undo: [], redo: [], last: clone(project)} : {undo: [], redo: []};
}

const clone = (p: Project): Project => JSON.parse(JSON.stringify(designOf(p))) as Project;

function ledgerOf(project: Project) {
  if (!project.ledger) project.ledger = emptyLedger();
  return project.ledger;
}

/**
 * Records whatever changed since the state last seen as an `untracked` change. Redo is cleared with it:
 * what it would put back was taken from a state that is gone. Returns the design as it stands.
 */
function reconcile(project: Project, history: History): Project {
  if (history.last) {
    // Nobody can say whose the drift was, so it brings no approval: the clearing is part of the drift recorded.
    mendDesign(project);
    const cleared = settleApproval(project, history.last, UNKNOWN);
    const drift = diffProject(history.last, designOf(project));
    if (drift.length) {
      record(ledgerOf(project), history.last, designOf(project), {author: UNKNOWN, source: 'untracked', ...(cleared ? {reason: noted(undefined)} : {})}, drift);
      history.last = clone(project);
      history.redo = [];
    }
  } else history.last = clone(project);
  return history.last;
}

/** Call before an edit. Returns the design as it stands, for `end`. */
export function begin(project: Project, history: History): Project {
  return reconcile(project, history);
}

/** Call after an edit. Records it and makes it the next thing undo takes back; null when nothing changed. */
export function end(project: Project, before: Project, meta: {author: Author; source: string; reason?: string}, history: History): Change | null {
  // Half a pair on its own (the person's typing, a cut) is mended before it is recorded or saved (src/text.ts).
  mendDesign(project);
  const cleared = settleApproval(project, before, meta.author);
  const done = record(ledgerOf(project), before, designOf(project), cleared ? {...meta, reason: noted(meta.reason)} : meta);
  if (!done) return null;
  // A clearing is the system's, not a write of the approval: undoing this change is content, for anyone (step).
  if (cleared) done.undo.cleared = true;
  history.undo.push(done.undo);
  if (history.undo.length > UNDO_LIMIT) history.undo.shift();
  history.redo = [];
  history.last = clone(project);
  return done.change;
}

/**
 * A change to a board that is not open in the editor (Home's rename), by `meta.author`: the same rule as `end`, recorded in
 * that board's own ledger. It has no undo here; the editor's history starts when the board is opened. Null when nothing changed.
 */
export function changeAside(project: Project, change: (project: Project) => void, meta: {author: Author; source: string; reason?: string}): Change | null {
  const before = clone(project);
  change(project);
  mendDesign(project);
  const cleared = settleApproval(project, before, meta.author);
  return record(ledgerOf(project), before, designOf(project), cleared ? {...meta, reason: noted(meta.reason)} : meta)?.change ?? null;
}

/**
 * An undo or redo that would give or take back the approval, asked for by someone other than the
 * person. Approving is theirs alone (src/agent/authority.ts), and history is not a way round that.
 */
export class HumanOnlyStep extends Error {
  constructor() { super(HUMAN_ONLY_ERROR); }
}

/**
 * A step the way the screen takes it (main.ts history): the step, then the project held to what a saved
 * one must be. Returns the project to show, parsed, with its ledger.
 */
export function stepForScreen(project: Project, direction: 'undo' | 'redo', history: History, author: Author): {project: Project; change: Change | null} | null {
  // The design is held to what a saved project must be before anything moves; the history is the
  // save's to fit (src/workspace/library.ts upsertProject), so a header this step adds never decides.
  let shown: Project | undefined;
  const done = step(project, direction, history, author, design => { shown = parseProject(JSON.stringify(design)); });
  return done && {project: {...shown!, ...(done.project.ledger ? {ledger: done.project.ledger} : {})}, change: done.change};
}

/** A step whose design could not be saved: nothing moved, the stacks, history and ledger as they were. */
export class StepDoesNotFit extends Error {}

/**
 * Takes back the last change, or puts back the last one taken back. Returns the project to show and
 * the change it appended, or null when there is nothing to do. The project passed in is not touched;
 * its ledger and shelf carry over to the one returned. Throws a `HumanOnlyStep` when anyone but the
 * person would move the approval, a `PatchError` when the step no longer fits the project, and a
 * `StepDoesNotFit` when `check` refuses the design it would show; every way the stacks, the history
 * and the ledger are left as they were, but for the redo an untracked change already cleared.
 */
export function step(project: Project, direction: 'undo' | 'redo', history: History, author: Author, check?: (design: Project) => void): {project: Project; change: Change | null} | null {
  // What changed behind the ledger is recorded first, even with nothing to step, so the step is only the step.
  reconcile(project, history);
  const from = direction === 'undo' ? history.undo : history.redo;
  const entry = from[from.length - 1];
  if (!entry) return null;
  const ops = direction === 'undo' ? entry.inverse : entry.ops;
  // The person's approve, taken back or given again, is theirs. A clearing the system made with an edit is not (`end`):
  // that step goes on, and the rule below keeps whatever it would bring of an approval from anyone but the person.
  if (author.kind !== 'person' && !entry.cleared && writesApproval(ops)) throw new HumanOnlyStep();
  const current = designOf(project);
  const next = applyPatch(current, ops);
  mendDesign(next);
  const cleared = settleApproval(next, current, author, true);
  if (check) {
    try { check(next); }
    catch (error) { throw new StepDoesNotFit(error instanceof Error ? error.message : String(error)); }
  }
  const ledger = ledgerOf(project);
  const done = record(ledger, current, next, {author, source: direction, ...(cleared ? {reason: noted(undefined)} : {}), ...(direction === 'undo' ? {undoes: entry.seq} : {redoes: entry.seq})});
  from.pop();
  (direction === 'undo' ? history.redo : history.undo).push(entry);
  next.ledger = ledger;
  history.last = clone(next);
  // A step that changes nothing (its effect was already gone) still moves the stacks, and records nothing.
  return {project: next, change: done ? done.change : null};
}
