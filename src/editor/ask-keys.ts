/**
 * What a key does while a request to edit is open (0.3-G2b fix 1). Allowing is the person's alone, so a key answers only
 * when it comes from their own keyboard, as a fresh press (not a repeat, not a key already down before), and the focus
 * is inside the request they can see. A sheet drawn over it takes every key; a key with the focus anywhere else answers
 * nothing and moves no focus (0.3-G2b fix 3).
 */
export type AskKey = 'allow' | 'decline' | 'button' | 'sheet' | 'drop' | 'pass';
export function askKey(key: string, trusted: boolean, on: {sheet: boolean; inAsk: boolean; onButton: string; fresh: boolean}): AskKey {
  if (key !== 'Enter' && key !== 'Escape') return 'pass';
  if (on.sheet) return 'sheet';
  if (!trusted || !on.fresh || !on.inAsk) return 'drop';
  if (key === 'Enter' && on.onButton && on.onButton !== 'ask-allow') return 'button';
  return key === 'Enter' ? 'allow' : 'decline';
}
