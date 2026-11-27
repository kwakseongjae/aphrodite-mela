/**
 * The toast stack.
 *
 * One line at a time was fine when a person did one thing at a time; an agent editing alongside them
 * can say several things in a second, and the old single element meant each message wiped the one
 * before it. These stack, the same message twice becomes one line with a count, and the oldest gives
 * way when there are too many to read.
 */
export type Toast = {id: number; message: string; count: number; at: number; undo?: string};

/** Long enough to read a sentence, short enough not to sit over the work. */
export const TOAST_LIFE = 4_200;
/** However long the line, it does not sit over the work for good. */
export const TOAST_LIFE_MAX = 10_000;
/** Time to read a line to its end: a short one keeps TOAST_LIFE, a long one gets more, and one with Undo a little
 *  more again, to be reached. */
export function toastLife(message: string, undo = false): number {
  return Math.min(TOAST_LIFE_MAX, Math.max(TOAST_LIFE, 1_400 + [...message].length * 70) + (undo ? 1_800 : 0));
}
/** More than this and nobody reads any of them. */
export const TOAST_MAX = 3;

/**
 * Adds a message. Repeating what is already on screen bumps a count instead of pushing a duplicate —
 * "Deleted" three times is one line saying so, not three lines saying it. The line's Undo is the newest one's, or none
 * when the newest recorded nothing: an older change is never offered under a newer line.
 */
export function pushToast(list: readonly Toast[], message: string, now: number, nextId: number, o: {undo?: string} = {}): Toast[] {
  const text = message.trim();
  if (!text) return [...list];
  const existing = list.findIndex(t => t.message === text);
  if (existing >= 0) {
    const {undo: _old, ...kept} = list[existing];
    const bumped = {...kept, count: list[existing].count + 1, at: now, ...(o.undo ? {undo: o.undo} : {})};
    return [...list.slice(0, existing), ...list.slice(existing + 1), bumped];
  }
  return [...list, {id: nextId, message: text, count: 1, at: now, ...(o.undo ? {undo: o.undo} : {})}].slice(-TOAST_MAX);
}

/** Takes Undo off every line whose change is not `last`: once history moves past a change, its button does not come back. */
export function settleUndo(list: readonly Toast[], last: string): Toast[] {
  return list.map(t => (t.undo && t.undo !== last ? (({undo: _gone, ...rest}) => rest)(t) : t));
}

/** Drops what has had its time. A bumped message gets its time back. */
export function expireToasts(list: readonly Toast[], now: number): Toast[] {
  return list.filter(t => now - t.at < toastLife(t.message, !!t.undo));
}

export function dismissToast(list: readonly Toast[], id: number): Toast[] {
  return list.filter(t => t.id !== id);
}

/** When the stack next needs sweeping, or 0 when there is nothing waiting. */
export function nextExpiry(list: readonly Toast[], now: number): number {
  if (!list.length) return 0;
  return Math.max(0, Math.min(...list.map(t => t.at + toastLife(t.message, !!t.undo) - now)));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The stack as the page draws it. `undo` is the change that is last now: a toast made for that change offers Undo,
 * which is the same single step as the shortcut, and one made for an earlier change does not, since pressing it
 * would take back a change it does not name. The line itself is a button that puts it away, beside Undo, so the keyboard
 * reaches both.
 */
export function toastHtml(list: readonly Toast[], o: {undo?: string; ko?: boolean} = {}): string {
  return list
    .map(t => {
      const undo = !!t.undo && t.undo === o.undo;
      return `<div class="toast ui-toast${undo ? ' ui-toast-undo' : ''}" data-toast="${t.id}"><button type="button" class="ui-toast-text toast-dismiss" title="${o.ko ? '닫기' : 'Dismiss'}">${esc(t.message)}</button>${t.count > 1 ? `<span class="ui-toast-count">×${t.count}</span>` : ''}${undo ? `<button type="button" class="ui-btn ui-btn-quiet toast-undo" data-action="undo" data-undo-for="${esc(t.undo!)}">${o.ko ? '되돌리기' : 'Undo'}</button>` : ''}</div>`;
    })
    .join('');
}
