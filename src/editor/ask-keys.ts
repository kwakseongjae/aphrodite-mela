/**
 * What a key does while a request to edit is open (0.3-G2b fix 1). Allowing is the person's alone, so a key answers only
 * when it comes from their own keyboard and the focus is inside the request they can see. A sheet drawn over it takes
 * every key; a key with the focus anywhere else brings the focus to Allow and answers nothing.
 */
export type AskKey = 'allow' | 'decline' | 'button' | 'to-allow' | 'sheet' | 'drop' | 'pass';
export function askKey(key: string, trusted: boolean, on: {sheet: boolean; inAsk: boolean; onButton: string}): AskKey {
  if (key !== 'Enter' && key !== 'Escape') return 'pass';
  if (on.sheet) return 'sheet';
  if (!trusted) return 'drop';
  if (!on.inAsk) return 'to-allow';
  if (key === 'Enter' && on.onButton && on.onButton !== 'ask-allow') return 'button';
  return key === 'Enter' ? 'allow' : 'decline';
}
