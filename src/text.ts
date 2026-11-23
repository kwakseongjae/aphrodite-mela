/**
 * Half of a surrogate pair on its own (0.3-P3-fix2 #4): a JavaScript string can hold one, UTF-8 cannot, and the
 * desktop's save refuses the JSON escape it becomes (src-tauri/src/workspace.rs, its test). Such text is refused at
 * the doors it could come in by: an html page (htmlProblem), a board file, and a project file. Since 0.3-R an agent's
 * other text is refused on its value where its command comes in (main.ts runAgentCommand); whatever else makes one is
 * mended where a change is recorded (src/ledger/session.ts), and the save refuses a library that still holds one.
 */
import {halfPair} from './free-page';
export {halfPair};
/** The path of the first string value (or key) in a parsed JSON value holding one, or undefined. */
export function halfPairIn(value: unknown, path = ''): string | undefined {
  if (typeof value === 'string') return halfPair(value) >= 0 ? path || '(the text)' : undefined;
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) { const at = halfPairIn(value[i], `${path}[${i}]`); if (at) return at; } return undefined; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (halfPair(k) >= 0) return `${path}.${k}`; const at = halfPairIn(v, path ? `${path}.${k}` : k); if (at) return at; }
  return undefined;
}
/** At most `max` UTF-16 units of `text`, never ending on half a pair: a cut that would split one leaves the first half out. */
export function clip(text: string, max: number): string { const cut = text.slice(0, max); return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut; }
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** `text` with U+FFFD where half a pair stood on its own. */
export function wholeText(text: string): string { return text.replace(LONE, '\uFFFD'); }
/**
 * Puts U+FFFD where half a pair stands on its own, in every string (and key) of a value, in place: what the person's
 * typing or a cut made, mended before it is recorded or saved, so the screen, the ledger and the disk hold the same
 * text. Returns how many strings it mended.
 */
export function mendHalfPairs(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  let mended = 0;
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v] as const) : Object.entries(value);
  for (const [k, v] of entries) {
    if (typeof v === 'string') { if (halfPair(v) >= 0) { (value as Record<string | number, unknown>)[k] = wholeText(v); mended++; } }
    else mended += mendHalfPairs(v);
    if (typeof k === 'string' && halfPair(k) >= 0) { const o = value as Record<string, unknown>; o[wholeText(k)] = o[k]; delete o[k]; mended++; }
  }
  return mended;
}
