/**
 * The editor's side of the ledger: one call before an edit, one after, and undo and redo.
 *
 * `main.ts` wraps every edit in `commit()`, and `commit()` calls `begin` and `end` from here. Keeping
 * the logic in this file means the rules — what counts as a change, what undo does, how deep it goes —
 * run under test without a browser.
 *
 * Something that changes the project outside `commit()` is caught too: `begin` compares the project
 * with the state `end` last saw, and records the difference as an `untracked` change before the new
 * one. The ledger stays complete even when a code path forgets to commit, and the source name says
 * which kind of path to go and fix.
 */
import type {Project} from '../model';
import {applyPatch, diffProject} from './patch';
import {designOf, emptyLedger, record, UNDO_LIMIT, type Author, type Change, type UndoEntry} from './ledger';

export type History = {undo: UndoEntry[]; redo: UndoEntry[]; last?: Project};

export function newHistory(): History {
  return {undo: [], redo: []};
}

const clone = (p: Project): Project => JSON.parse(JSON.stringify(designOf(p))) as Project;

function ledgerOf(project: Project) {
  if (!project.ledger) project.ledger = emptyLedger();
  return project.ledger;
}

/** Call before an edit. Returns the design as it stands, for `end`. */
export function begin(project: Project, history: History, author: Author): Project {
  if (history.last) {
    const drift = diffProject(history.last, designOf(project));
    if (drift.length) {
      record(ledgerOf(project), history.last, designOf(project), {author, source: 'untracked'}, drift);
      history.last = clone(project);
    }
  } else history.last = clone(project);
  return history.last;
}

/** Call after an edit. Records it and makes it the next thing undo takes back; null when nothing changed. */
export function end(project: Project, before: Project, meta: {author: Author; source: string; reason?: string}, history: History): Change | null {
  const done = record(ledgerOf(project), before, designOf(project), meta);
  if (!done) return null;
  history.undo.push(done.undo);
  if (history.undo.length > UNDO_LIMIT) history.undo.shift();
  history.redo = [];
  history.last = clone(project);
  return done.change;
}

/**
 * Takes back the last change, or puts back the last one taken back. Returns the project to show and
 * the change it appended, or null when there is nothing to do. The project passed in is not touched;
 * its ledger and shelf carry over to the one returned. Throws a `PatchError` when the step no longer
 * fits the project, and then the stacks are left as they were.
 */
export function step(project: Project, direction: 'undo' | 'redo', history: History, author: Author): {project: Project; change: Change | null} | null {
  const from = direction === 'undo' ? history.undo : history.redo;
  const entry = from[from.length - 1];
  if (!entry) return null;
  const current = designOf(project);
  const next = applyPatch(current, direction === 'undo' ? entry.inverse : entry.ops);
  const ledger = ledgerOf(project);
  const done = record(ledger, current, next, {author, source: direction, ...(direction === 'undo' ? {undoes: entry.seq} : {redoes: entry.seq})});
  from.pop();
  (direction === 'undo' ? history.redo : history.undo).push(entry);
  next.ledger = ledger;
  history.last = clone(next);
  // A step that changes nothing (its effect was already gone) still moves the stacks, and records nothing.
  return {project: next, change: done ? done.change : null};
}
