/**
 * The toast stack.
 *
 * One line at a time was fine when a person did one thing at a time; an agent editing alongside them
 * can say several things in a second, and the old single element meant each message wiped the one
 * before it. These stack, the same message twice becomes one line with a count, and the oldest gives
 * way when there are too many to read.
 */
export type Toast = {id: number; message: string; count: number; at: number};

/** Long enough to read a sentence, short enough not to sit over the work. */
export const TOAST_LIFE = 4_200;
/** More than this and nobody reads any of them. */
export const TOAST_MAX = 3;

/**
 * Adds a message. Repeating what is already on screen bumps a count instead of pushing a duplicate —
 * "Deleted" three times is one line saying so, not three lines saying it.
 */
export function pushToast(list: readonly Toast[], message: string, now: number, nextId: number): Toast[] {
  const text = message.trim();
  if (!text) return [...list];
  const existing = list.findIndex(t => t.message === text);
  if (existing >= 0) {
    const bumped = {...list[existing], count: list[existing].count + 1, at: now};
    return [...list.slice(0, existing), ...list.slice(existing + 1), bumped];
  }
  return [...list, {id: nextId, message: text, count: 1, at: now}].slice(-TOAST_MAX);
}

/** Drops what has had its time. A bumped message gets its time back. */
export function expireToasts(list: readonly Toast[], now: number): Toast[] {
  return list.filter(t => now - t.at < TOAST_LIFE);
}

export function dismissToast(list: readonly Toast[], id: number): Toast[] {
  return list.filter(t => t.id !== id);
}

/** When the stack next needs sweeping, or 0 when there is nothing waiting. */
export function nextExpiry(list: readonly Toast[], now: number): number {
  if (!list.length) return 0;
  return Math.max(0, Math.min(...list.map(t => t.at + TOAST_LIFE - now)));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toastHtml(list: readonly Toast[]): string {
  return list
    .map(t => `<button type="button" class="toast" data-toast="${t.id}">${esc(t.message)}${t.count > 1 ? `<i>×${t.count}</i>` : ''}</button>`)
    .join('');
}
