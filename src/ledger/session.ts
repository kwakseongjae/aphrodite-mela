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
import type {Project} from '../model';
import {HUMAN_ONLY_ERROR} from '../agent/authority';
import {applyPatch, diffProject} from './patch';
import {designOf, emptyLedger, fitSaved, record, UNDO_LIMIT, UNKNOWN, type Author, type Change, type UndoEntry} from './ledger';

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
    const drift = diffProject(history.last, designOf(project));
    if (drift.length) {
      record(ledgerOf(project), history.last, designOf(project), {author: UNKNOWN, source: 'untracked'}, drift);
      fitSaved(project);
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
  const done = record(ledgerOf(project), before, designOf(project), meta);
  if (!done) return null;
  fitSaved(project);
  history.undo.push(done.undo);
  if (history.undo.length > UNDO_LIMIT) history.undo.shift();
  history.redo = [];
  history.last = clone(project);
  return done.change;
}

/**
 * An undo or redo that would give or take back the approval, asked for by someone other than the
 * person. Approving is theirs alone (src/agent/authority.ts), and history is not a way round that.
 */
export class HumanOnlyStep extends Error {
  constructor() { super(HUMAN_ONLY_ERROR); }
}

/**
 * Takes back the last change, or puts back the last one taken back. Returns the project to show and
 * the change it appended, or null when there is nothing to do. The project passed in is not touched;
 * its ledger and shelf carry over to the one returned. Throws a `HumanOnlyStep` when anyone but the
 * person would move the approval, and a `PatchError` when the step no longer fits the project; either
 * way the stacks are left as they were, but for the redo an untracked change already cleared.
 */
export function step(project: Project, direction: 'undo' | 'redo', history: History, author: Author): {project: Project; change: Change | null} | null {
  // What changed behind the ledger is recorded first, even with nothing to step, so the step is only the step.
  reconcile(project, history);
  const from = direction === 'undo' ? history.undo : history.redo;
  const entry = from[from.length - 1];
  if (!entry) return null;
  const ops = direction === 'undo' ? entry.inverse : entry.ops;
  if (author.kind !== 'person' && ops.some(op => op.op === 'set' && op.on === 'project' && op.field === 'approvedFingerprint')) throw new HumanOnlyStep();
  const current = designOf(project);
  const next = applyPatch(current, ops);
  const ledger = ledgerOf(project);
  const done = record(ledger, current, next, {author, source: direction, ...(direction === 'undo' ? {undoes: entry.seq} : {redoes: entry.seq})});
  from.pop();
  (direction === 'undo' ? history.redo : history.undo).push(entry);
  next.ledger = ledger;
  fitSaved(next);
  history.last = clone(next);
  // A step that changes nothing (its effect was already gone) still moves the stacks, and records nothing.
  return {project: next, change: done ? done.change : null};
}
